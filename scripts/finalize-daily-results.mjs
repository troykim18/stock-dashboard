import { sb, insertRows, logRun } from './lib/supabase-rest.mjs';
import { getMarketCloseReason, kstDate } from './lib/kr-market-calendar.mjs';

function grade(maxReaction, retention, lastPct) {
  if (maxReaction >= 5 && retention >= 0.6) return 'A';
  if (maxReaction >= 2 && retention >= 0.35) return 'B';
  if (maxReaction >= 2) return 'C';
  if (maxReaction > 0) return 'D';
  if (lastPct < 0) return 'F';
  return 'N';
}

const tradeDate = process.env.TRADE_DATE || kstDate();

try {
  const closeReason = await getMarketCloseReason(tradeDate);
  if (!process.env.FORCE_TRACK && closeReason) {
    await logRun('finalize-daily-results', 'skipped', `market closed: ${closeReason}`, tradeDate);
    console.log(`KR market closed: ${closeReason}`);
    process.exit(0);
  }

  const rows = await sb(`intraday_snapshots?trade_date=eq.${tradeDate}&select=kr_code,kr_name,price,change_pct,captured_at&order=kr_code.asc,captured_at.asc`);
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.kr_code)) groups.set(row.kr_code, []);
    groups.get(row.kr_code).push(row);
  }

  const results = [];
  for (const [code, snaps] of groups) {
    if (!snaps.length) continue;
    const first = snaps[0];
    const last = snaps.at(-1);
    const prices = snaps.map(s => Number(s.price)).filter(Number.isFinite);
    const pcts = snaps.map(s => Number(s.change_pct || 0)).filter(Number.isFinite);
    const highPct = Math.max(...pcts);
    const lowPct = Math.min(...pcts);
    const maxReaction = Math.max(0, highPct);
    const retention = maxReaction > 0 ? Math.max(0, Number(last.change_pct || 0)) / maxReaction : 0;
    const drawdown = maxReaction - Number(last.change_pct || 0);
    results.push({
      trade_date: tradeDate,
      kr_code: code,
      kr_name: first.kr_name,
      first_price: first.price,
      last_price: last.price,
      high_price: Math.max(...prices),
      low_price: Math.min(...prices),
      first_pct: first.change_pct || 0,
      last_pct: last.change_pct || 0,
      high_pct: highPct,
      low_pct: lowPct,
      max_reaction_pct: maxReaction,
      drawdown_from_high_pct: drawdown,
      retention_pct: retention * 100,
      grade: grade(maxReaction, retention, Number(last.change_pct || 0)),
      snapshot_count: snaps.length,
      updated_at: new Date().toISOString()
    });
  }

  await insertRows('daily_results', results, 'trade_date,kr_code');
  await logRun('finalize-daily-results', 'ok', `${results.length} results`, tradeDate);
  console.log(`Finalized ${results.length} results for ${tradeDate}`);
} catch (error) {
  await logRun('finalize-daily-results', 'error', error.message, tradeDate);
  throw error;
}
