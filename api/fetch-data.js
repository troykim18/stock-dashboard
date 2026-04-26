const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.4-nano';

function send(res, status, body) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(status).json(body);
}

function cleanHtml(text = '') {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .trim();
}

function rssItems(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8);
  return items.map(([, item]) => {
    const pick = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return cleanHtml((m && m[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, ''));
    };
    const title = pick('title');
    const sourceMatch = title.match(/- ([^-]+)$/);
    return {
      source: sourceMatch ? sourceMatch[1].trim() : '구글뉴스',
      headline: title.replace(/ - [^-]+$/, '').trim(),
      summary: pick('description').slice(0, 200),
      url: pick('link'),
      datetime: Math.floor(new Date(pick('pubDate')).getTime() / 1000) || Math.floor(Date.now() / 1000)
    };
  });
}

async function fetchYahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 stock-dashboard',
      'Accept': 'application/json'
    }
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
  return {
    symbol,
    price,
    pct: ((price - prev) / prev) * 100,
    currency: meta.currency || '',
    exchange: meta.exchangeName || meta.fullExchangeName || '',
    marketTime: meta.regularMarketTime || null
  };
}

async function mapLimit(items, limit, worker) {
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

async function fetchPrices(symbols = [], krCodes = []) {
  const usSymbols = [...new Set(symbols.map(s => String(s).trim().toUpperCase()).filter(Boolean))];
  const cleanKrCodes = [...new Set(krCodes.map(s => String(s).trim()).filter(Boolean))];
  const prices = {};
  const krPrices = {};

  const usQuotes = await mapLimit(usSymbols, 12, symbol => fetchYahooChart(symbol));
  usQuotes.forEach((quote, idx) => {
    if (quote) prices[usSymbols[idx]] = quote;
  });

  await mapLimit(cleanKrCodes, 8, async code => {
    const kospi = await fetchYahooChart(`${code}.KS`);
    const quote = kospi || await fetchYahooChart(`${code}.KQ`);
    if (quote) krPrices[code] = quote;
  });

  return { prices, krPrices, timestamp: new Date().toISOString() };
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}

async function fetchQuote(symbol) {
  const yahoo = await fetchPrices([symbol], []);
  const hit = yahoo.prices[String(symbol).toUpperCase()];
  if (hit) return { c: hit.price, dp: hit.pct, source: 'yahoo', marketTime: hit.marketTime };
  if (!FINNHUB_API_KEY) return { error: 'FINNHUB_API_KEY is not configured' };
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const r = await fetch(url);
  return { ...(await r.json()), source: 'finnhub' };
}

async function fetchEnglishNews(symbol) {
  if (!FINNHUB_API_KEY) return { news: [] };
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);
  const f = d => d.toISOString().split('T')[0];
  const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${f(weekAgo)}&to=${f(today)}&token=${FINNHUB_API_KEY}`;
  const r = await fetch(url);
  const news = await r.json();
  return { news: Array.isArray(news) ? news.slice(0, 8) : [] };
}

async function fetchNaverNews(query) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return { news: [] };
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=8&sort=date`;
  const r = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET
    }
  });
  if (!r.ok) return { news: [] };
  const d = await r.json();
  return {
    news: (d.items || []).map(it => ({
      source: '네이버',
      headline: cleanHtml(it.title),
      summary: cleanHtml(it.description),
      url: it.originallink || it.link,
      datetime: Math.floor(new Date(it.pubDate).getTime() / 1000)
    }))
  };
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r = await fetch(url);
  if (!r.ok) return { news: [] };
  return { news: rssItems(await r.text()) };
}

async function callOpenAI(prompt, maxTokens = 800) {
  if (!OPENAI_API_KEY) return { error: 'OPENAI_API_KEY is not configured' };
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      max_output_tokens: maxTokens
    })
  });
  const data = await r.json();
  if (!r.ok || data.error) return { error: data.error?.message || 'OpenAI request failed' };
  const text = data.output_text ||
    (data.output || [])
      .flatMap(item => item.content || [])
      .filter(c => c.type === 'output_text')
      .map(c => c.text)
      .join('\n')
      .trim();
  return { text };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    const type = req.query.type || 'health';
    const symbol = req.query.symbol || '';
    const query = req.query.query || symbol;

    if (type === 'health') {
      return send(res, 200, {
        ok: true,
        finnhub: Boolean(FINNHUB_API_KEY),
        naver: Boolean(NAVER_CLIENT_ID && NAVER_CLIENT_SECRET),
        openai: Boolean(OPENAI_API_KEY),
        yahoo: true,
        model: OPENAI_MODEL,
        timestamp: new Date().toISOString()
      });
    }
    if (type === 'quote') return send(res, 200, await fetchQuote(symbol));
    if (type === 'prices') {
      const symbols = String(req.query.symbols || '').split(',');
      const krCodes = String(req.query.kr || '').split(',');
      return send(res, 200, await fetchPrices(symbols, krCodes));
    }
    if (type === 'english-news') return send(res, 200, await fetchEnglishNews(symbol));
    if (type === 'naver-news') return send(res, 200, await fetchNaverNews(query));
    if (type === 'google-news') return send(res, 200, await fetchGoogleNews(query));

    if (type === 'translate') {
      const body = await readBody(req);
      const prompt = `다음 영어 금융 뉴스를 자연스러운 한국어로 번역해줘. 번역문만 반환하고 다른 설명은 하지 마:\n\n${body.text || ''}`;
      return send(res, 200, await callOpenAI(prompt, 300));
    }

    if (type === 'ai-analysis') {
      const body = await readBody(req);
      return send(res, 200, await callOpenAI(body.prompt || '', 800));
    }

    return send(res, 400, { error: 'Unknown type' });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Server error' });
  }
}
