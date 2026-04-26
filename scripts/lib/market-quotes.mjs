export function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[,%+원\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function fetchNaverQuote(code) {
  const cleanCode = String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
  if (!/^\d{6}$/.test(cleanCode)) return null;
  try {
    const r = await fetch(`https://polling.finance.naver.com/api/realtime/domestic/stock/${cleanCode}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 stock-dashboard-tracker',
        'Accept': 'application/json',
        'Referer': `https://finance.naver.com/item/main.naver?code=${cleanCode}`
      }
    });
    if (r.ok) {
      const data = await r.json();
      const item = data?.datas?.[0] || data?.result?.areas?.[0]?.datas?.[0];
      const price = toNumber(item?.closePrice || item?.nv || item?.now);
      const pct = toNumber(item?.fluctuationsRatio || item?.cr || item?.rate);
      if (price) {
        return {
          code: cleanCode,
          price,
          pct: pct || 0,
          source: 'naver',
          marketTime: item?.localTradedAt || item?.tradeTime || null
        };
      }
    }
  } catch {}
  return null;
}

export async function fetchYahooChart(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 stock-dashboard-tracker', 'Accept': 'application/json' }
    });
    if (!r.ok) return null;
    const data = await r.json();
    const result = data.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const closes = (result.indicators?.quote?.[0]?.close || []).filter(v => typeof v === 'number' && v > 0);
    const price = closes.at(-1) || meta.regularMarketPrice;
    const prev = closes.at(-2) || meta.chartPreviousClose || meta.previousClose;
    if (!price || !prev) return null;
    return { symbol, price, pct: ((price - prev) / prev) * 100, source: 'yahoo' };
  } catch {
    return null;
  }
}

export async function fetchKrQuote(code) {
  const naver = await fetchNaverQuote(code);
  if (naver) return naver;
  const cleanCode = String(code || '').replace(/\D/g, '').padStart(6, '0').slice(-6);
  const yahoo = await fetchYahooChart(`${cleanCode}.KS`) || await fetchYahooChart(`${cleanCode}.KQ`);
  return yahoo ? { code: cleanCode, price: yahoo.price, pct: yahoo.pct, source: yahoo.source } : null;
}

export async function fetchUsQuote(symbol) {
  return fetchYahooChart(symbol);
}

export async function mapLimit(items, limit, worker) {
  const results = [];
  let next = 0;
  async function run() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
