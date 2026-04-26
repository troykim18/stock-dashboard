import { sb, logRun } from './lib/supabase-rest.mjs';
import { hasGoogleDriveConfig, uploadTextFileToDrive } from './lib/google-drive.mjs';

const keepDays = Number(process.env.SNAPSHOT_KEEP_DAYS || 30);
const cutoff = new Date(Date.now() - keepDays * 24 * 3600_000).toISOString().slice(0, 10);

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('|') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvEscape(row[header])).join(','))
  ].join('\n');
}

function archiveFileName(cutoffDate) {
  return `intraday_snapshots_archive_before_${cutoffDate}.csv`;
}

try {
  const oldRows = await sb(`intraday_snapshots?trade_date=lt.${cutoff}&select=*`);
  if (oldRows.length) {
    let driveMessage = 'google drive skipped';
    if (hasGoogleDriveConfig()) {
      const csv = rowsToCsv(oldRows);
      const uploaded = await uploadTextFileToDrive({
        name: archiveFileName(cutoff),
        text: csv,
        mimeType: 'text/csv'
      });
      driveMessage = uploaded.skipped ? uploaded.reason : `google drive uploaded ${uploaded.name}`;
    }

    await sb('intraday_snapshots_archive', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(oldRows)
    });
    await sb(`intraday_snapshots?trade_date=lt.${cutoff}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    await logRun('archive-old-snapshots', 'ok', `archived/deleted ${oldRows.length} rows before ${cutoff}; ${driveMessage}`);
    console.log(`Archived and deleted ${oldRows.length} rows before ${cutoff}; ${driveMessage}`);
  } else {
    await logRun('archive-old-snapshots', 'ok', `archived/deleted 0 rows before ${cutoff}`);
    console.log(`Archived and deleted 0 rows before ${cutoff}`);
  }
} catch (error) {
  await logRun('archive-old-snapshots', 'error', error.message);
  throw error;
}
