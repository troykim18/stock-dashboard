const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
}

export async function sb(path, options = {}) {
  requireSupabase();
  const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText}: ${text}`);
  }
  return data;
}

export async function insertRows(table, rows, onConflict = '') {
  if (!rows.length) return [];
  const query = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  return sb(`${table}${query}`, {
    method: 'POST',
    headers: onConflict ? { Prefer: 'resolution=merge-duplicates,return=representation' } : undefined,
    body: JSON.stringify(rows)
  });
}

export async function logRun(run_type, status, message = '', trade_date = null) {
  try {
    await insertRows('tracker_runs', [{ run_type, status, message, trade_date }]);
  } catch (error) {
    console.error('tracker_runs log failed:', error.message);
  }
}
