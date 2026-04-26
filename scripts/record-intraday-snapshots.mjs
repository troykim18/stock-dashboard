import fs from 'node:fs/promises';
import { sb, insertRows, logRun } from './lib/supabase-rest.mjs';
import { fetchKrQuote, mapLimit } from './lib/market-quotes.mjs';
import { getMarketCloseReason, krMarketWindow, kstDate, kstMinutes } from './lib/kr-market-calendar.mjs';

async function inTrackingWindow(tradeDate) {
  const m = kstMinutes();
  const window = await krMarketWindow(tradeDate);
  return m >= window.open && m <= window.trackingClose;
}

async function sessionName(tradeDate) {
  const m = kstMinutes();
  const window = await krMarketWindow(tradeDate);
  if (m <= window.regularClose) return 'regular';
  if (m <= window.afterHoursClose) return 'after_hours';
  return 'nxt';
}

const tradeDate = process.env.TRADE_DATE || kstDate();

try {
  const closeReason = await getMarketCloseReason(tradeDate);
  if (!process.env.FORCE_TRACK && closeReason) {
    await logRun('record-intraday-snapshots', 'skipped', `market closed: ${closeReason}`, tradeDate);
    console.log(`KR market closed: ${closeReason}`);
    process.exit(0);
  }

  if (!process.env.FORCE_TRACK && !(await inTrackingWindow(tradeDate))) {
    await logRun('record-intraday-snapshots', 'skipped', 'outside KST tracking window', tradeDate);
    console.log('Outside KST tracking window.');
    process.exit(0);
  }

  const signals = await sb(`daily_signals?trade_date=eq.${tradeDate}&select=kr_code,kr_name`);
  const usStocks = JSON.parse(await fs.readFile('data/us-stocks.generated.json', 'utf8'));
  const allMapped = new Map();
  for (const stock of usStocks) {
    for (const kr of stock.kr || []) allMapped.set(kr.t, kr.n);
  }

  const byCode = new Map([...allMapped].map(([kr_code, kr_name]) => [kr_code, kr_name]));
  for (const signal of signals) byCode.set(signal.kr_code, signal.kr_name);
  const quotes = await mapLimit([...byCode.keys()], 8, async code => ({ code, quote: await fetchKrQuote(code) }));
  const currentSession = await sessionName(tradeDate);
  const rows = quotes
    .filter(x => x.quote && x.quote.price)
    .map(({ code, quote }) => ({
      trade_date: tradeDate,
      captured_at: new Date().toISOString(),
      kr_code: code,
      kr_name: byCode.get(code),
      price: quote.price,
      change_pct: quote.pct,
      source: quote.source,
      session: currentSession
    }));

  await insertRows('intraday_snapshots', rows);
  await logRun('record-intraday-snapshots', 'ok', `${rows.length} snapshots`, tradeDate);
  console.log(`Recorded ${rows.length} snapshots for ${tradeDate}`);
} catch (error) {
  await logRun('record-intraday-snapshots', 'error', error.message, tradeDate);
  throw error;
}
