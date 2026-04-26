const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

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
  if (!FINNHUB_API_KEY) return { error: 'FINNHUB_API_KEY is not configured' };
  const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
  const r = await fetch(url);
  return await r.json();
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

async function callAnthropic(prompt, maxTokens = 800) {
  if (!ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY is not configured' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await r.json();
  if (!r.ok || data.error) return { error: data.error?.message || 'Anthropic request failed' };
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
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
        anthropic: Boolean(ANTHROPIC_API_KEY),
        timestamp: new Date().toISOString()
      });
    }
    if (type === 'quote') return send(res, 200, await fetchQuote(symbol));
    if (type === 'english-news') return send(res, 200, await fetchEnglishNews(symbol));
    if (type === 'naver-news') return send(res, 200, await fetchNaverNews(query));
    if (type === 'google-news') return send(res, 200, await fetchGoogleNews(query));

    if (type === 'translate') {
      const body = await readBody(req);
      const prompt = `다음 영어 금융 뉴스를 자연스러운 한국어로 번역해줘. 번역문만 반환하고 다른 설명은 하지 마:\n\n${body.text || ''}`;
      return send(res, 200, await callAnthropic(prompt, 300));
    }

    if (type === 'ai-analysis') {
      const body = await readBody(req);
      return send(res, 200, await callAnthropic(body.prompt || '', 800));
    }

    return send(res, 400, { error: 'Unknown type' });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Server error' });
  }
}
