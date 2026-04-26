import fs from 'node:fs/promises';
import { insertRows, logRun } from './lib/supabase-rest.mjs';
import { fetchUsQuote, mapLimit } from './lib/market-quotes.mjs';
import { getMarketCloseReason, kstDate } from './lib/kr-market-calendar.mjs';

function scoreCorr(corr) {
  return { high: 0.85, mid: 0.6, low: 0.35 }[corr] || 0.5;
}

const tradeDate = process.env.TRADE_DATE || kstDate();
const minUsMove = Number(process.env.MIN_US_MOVE_PCT || 1.5);
const maxUsStocks = Number(process.env.MAX_US_STOCKS || 80);

try {
  const closeReason = await getMarketCloseReason(tradeDate);
  if (!process.env.FORCE_TRACK && closeReason) {
    await logRun('generate-daily-signals', 'skipped', `market closed: ${closeReason}`, tradeDate);
    console.log(`KR market closed: ${closeReason}`);
    process.exit(0);
  }

  const usStocks = JSON.parse(await fs.readFile('data/us-stocks.generated.json', 'utf8'));
  const candidates = usStocks.filter(s => Array.isArray(s.kr) && s.kr.length);
  const quotes = await mapLimit(candidates, 10, async stock => ({ stock, quote: await fetchUsQuote(stock.symbol || stock.id) }));
  const movers = quotes
    .filter(x => x.quote && Math.abs(x.quote.pct || 0) >= minUsMove)
    .sort((a, b) => Math.abs(b.quote.pct) - Math.abs(a.quote.pct))
    .slice(0, maxUsStocks);

  const rows = [];
  for (const { stock, quote } of movers) {
    for (const kr of stock.kr) {
      rows.push({
        trade_date: tradeDate,
        us_symbol: stock.symbol || stock.id,
        us_name: stock.name,
        us_ko_name: stock.koName || null,
        us_price: quote.price,
        us_change_pct: quote.pct,
        us_sector: stock.sector,
        us_sub_sector: stock.subSector,
        kr_code: kr.t,
        kr_name: kr.n,
        kr_market: kr.market || null,
        kr_groups: kr.indexGroups || [],
        relation: kr.relation || null,
        corr: kr.corr || null,
        confidence: scoreCorr(kr.corr),
        expected_direction: quote.pct >= 0 ? 'up' : 'down',
        reason: `${stock.id} ${quote.pct >= 0 ? '+' : ''}${quote.pct.toFixed(2)}%, ${stock.sectorLabel || stock.gicsSector || ''}/${stock.subSector || ''}`
      });
    }
  }

  await insertRows('daily_signals', rows, 'trade_date,us_symbol,kr_code');
  await logRun('generate-daily-signals', 'ok', `${rows.length} signals from ${movers.length} US movers`, tradeDate);
  console.log(`Generated ${rows.length} signals for ${tradeDate}`);
} catch (error) {
  await logRun('generate-daily-signals', 'error', error.message, tradeDate);
  throw error;
}
