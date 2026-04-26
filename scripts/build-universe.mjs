import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const dataDir = path.join(root, 'data');

function clean(text = '') {
  return text
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\[[^\]]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function wikiHtml(page) {
  const cacheName = page === 'List_of_S%26P_500_companies' ? 'sp500.json' : page === 'KOSPI_200' ? 'kospi200.json' : '';
  if (cacheName) {
    try {
      const cached = JSON.parse(await fs.readFile(path.join(root, '.cache', cacheName), 'utf8'));
      return cached.parse.text['*'];
    } catch {}
  }
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&origin=*`;
  const r = await fetch(url, { headers: { 'User-Agent': 'stock-dashboard-data-builder' } });
  if (!r.ok) throw new Error(`Wikipedia fetch failed: ${page}`);
  const data = await r.json();
  return data.parse.text['*'];
}

function parseTables(html) {
  const tables = [...html.matchAll(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/g)].map(m => m[0]);
  return tables.map(table => {
    const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
    const parsed = rows.map(row => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => clean(m[1]))).filter(r => r.length);
    const headers = parsed.shift() || [];
    return parsed.map(cols => Object.fromEntries(headers.map((h, i) => [h, cols[i] || ''])));
  });
}

function parseLargestTable(html, requiredKey) {
  const tables = parseTables(html);
  const matching = requiredKey ? tables.filter(t => t[0] && Object.keys(t[0]).includes(requiredKey)) : tables;
  return matching.sort((a, b) => b.length - a.length)[0] || [];
}

function parseFirstTable(html) {
  const table = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/)?.[0] || '';
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => m[1]);
  const parsed = rows.map(row => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => clean(m[1]))).filter(r => r.length);
  const headers = parsed.shift() || [];
  return parsed.map(cols => Object.fromEntries(headers.map((h, i) => [h, cols[i] || ''])));
}

function sectorKey(gicsSector = '') {
  const s = gicsSector.toLowerCase();
  if (s.includes('information technology')) return 'tech';
  if (s.includes('communication')) return 'telecom';
  if (s.includes('consumer discretionary')) return 'consumer';
  if (s.includes('consumer staples')) return 'consumer';
  if (s.includes('financial')) return 'finance';
  if (s.includes('health')) return 'health';
  if (s.includes('industrial')) return 'industrial';
  if (s.includes('material')) return 'material';
  if (s.includes('energy')) return 'energy';
  if (s.includes('real estate')) return 'realty';
  if (s.includes('utilit')) return 'util';
  return 'industrial';
}

function sectorLabel(key) {
  return {
    tech: '기술/소프트웨어',
    telecom: '통신/미디어',
    consumer: '소비재',
    finance: '금융',
    health: '헬스케어',
    industrial: '산업재',
    material: '소재',
    energy: '에너지',
    realty: '리츠',
    util: '유틸리티'
  }[key] || '기타';
}

function classifyUs(row) {
  const sub = (row['GICS Sub-Industry'] || '').toLowerCase();
  const name = `${row.Security || ''} ${row.Symbol || ''}`.toLowerCase();
  if (sub.includes('semiconductor')) {
    if (/nvidia|advanced micro|amd/.test(name)) return { sector: 'semi', sectorLabel: '반도체', subSector: 'ai_gpu_accelerator', themes: ['AI GPU', '데이터센터'] };
    if (/micron/.test(name)) return { sector: 'semi', sectorLabel: '반도체', subSector: 'memory_hbm', themes: ['메모리', 'HBM'] };
    if (/qualcomm|broadcom|marvell/.test(name)) return { sector: 'semi', sectorLabel: '반도체', subSector: 'fabless_mobile', themes: ['팹리스', '통신칩'] };
    if (/nxp|texas instruments|analog devices|on semiconductor|microchip/.test(name)) return { sector: 'semi', sectorLabel: '반도체', subSector: 'auto_mcu_power', themes: ['차량용반도체', 'MCU', '아날로그'] };
    return { sector: 'semi', sectorLabel: '반도체', subSector: 'semiconductor_general', themes: ['반도체'] };
  }
  if (sub.includes('semiconductor materials') || sub.includes('semiconductor equipment')) {
    return { sector: 'semi', sectorLabel: '반도체', subSector: 'semi_equipment', themes: ['반도체 장비'] };
  }
  if (sub.includes('application software') || sub.includes('systems software')) return { sector: 'tech', sectorLabel: '소프트웨어', subSector: 'software', themes: ['소프트웨어', 'AI'] };
  if (sub.includes('interactive media') || sub.includes('movies') || sub.includes('broadcast')) return { sector: 'telecom', sectorLabel: '미디어/플랫폼', subSector: 'media_platform', themes: ['플랫폼', '콘텐츠'] };
  if (sub.includes('automobile')) return { sector: 'ev', sectorLabel: '자동차/전기차', subSector: 'ev_oem', themes: ['자동차', '전기차'] };
  if (sub.includes('aerospace') || sub.includes('defense')) return { sector: 'industrial', sectorLabel: '방산/항공', subSector: 'defense_aerospace', themes: ['방산', '항공우주'] };
  if (sub.includes('pharmaceutical') || sub.includes('biotechnology')) return { sector: 'health', sectorLabel: '바이오/제약', subSector: 'bio_pharma', themes: ['바이오', '제약'] };
  const key = sectorKey(row['GICS Sector']);
  return { sector: key, sectorLabel: sectorLabel(key), subSector: sub.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), themes: [row['GICS Sub-Industry']].filter(Boolean) };
}

function relationForUs(us) {
  const s = us.subSector;
  if (s === 'ai_gpu_accelerator') return [
    { t: '000660', n: 'SK하이닉스', corr: 'high', relation: 'HBM 공급망' },
    { t: '042700', n: '한미반도체', corr: 'high', relation: 'HBM 후공정 장비' },
    { t: '005930', n: '삼성전자', corr: 'high', relation: '메모리/HBM' }
  ];
  if (s === 'memory_hbm') return [
    { t: '000660', n: 'SK하이닉스', corr: 'high', relation: 'DRAM/HBM 동행' },
    { t: '005930', n: '삼성전자', corr: 'high', relation: '메모리 동행' }
  ];
  if (s === 'semi_equipment') return [
    { t: '042700', n: '한미반도체', corr: 'mid', relation: '장비 투자 사이클' },
    { t: '240810', n: '원익IPS', corr: 'mid', relation: '전공정 장비' }
  ];
  if (s === 'auto_mcu_power') return [
    { t: '102120', n: '어보브반도체', corr: 'mid', relation: 'MCU/비메모리 심리' },
    { t: '054450', n: '텔레칩스', corr: 'mid', relation: '차량용 반도체' },
    { t: '000990', n: 'DB하이텍', corr: 'mid', relation: '전력반도체/파운드리' }
  ];
  if (s === 'fabless_mobile') return [
    { t: '005930', n: '삼성전자', corr: 'mid', relation: '파운드리/모바일 AP' },
    { t: '009150', n: '삼성전기', corr: 'mid', relation: '모바일 부품' },
    { t: '108320', n: 'LX세미콘', corr: 'low', relation: '팹리스 심리' }
  ];
  if (s === 'defense_aerospace') return [
    { t: '012450', n: '한화에어로스페이스', corr: 'high', relation: '방산/항공우주' },
    { t: '079550', n: 'LIG넥스원', corr: 'mid', relation: '유도무기/방산전자' },
    { t: '047810', n: '한국항공우주', corr: 'mid', relation: '항공우주' }
  ];
  if (s === 'bio_pharma') return [
    { t: '207940', n: '삼성바이오로직스', corr: 'mid', relation: 'CDMO/바이오 투자심리' },
    { t: '068270', n: '셀트리온', corr: 'mid', relation: '바이오시밀러/헬스케어' }
  ];
  if (s === 'ev_oem') return [
    { t: '373220', n: 'LG에너지솔루션', corr: 'high', relation: '배터리 공급망' },
    { t: '006400', n: '삼성SDI', corr: 'mid', relation: '배터리 공급망' },
    { t: '012330', n: '현대모비스', corr: 'mid', relation: '전장/자동차부품' }
  ];
  return [];
}

async function main() {
  await fs.mkdir(dataDir, { recursive: true });

  const spRows = parseLargestTable(await wikiHtml('List_of_S%26P_500_companies'), 'Symbol');
  const us = spRows.map(row => {
    const classified = classifyUs(row);
    return {
      id: row.Symbol.replace('.', '-'),
      symbol: row.Symbol,
      name: row.Security,
      gicsSector: row['GICS Sector'],
      gicsSubIndustry: row['GICS Sub-Industry'],
      ...classified,
      price: 0,
      pct: 0,
      signal: 'neutral',
      kr: [],
      reason: `${row['GICS Sub-Industry']} 업종. 검수 전 자동 분류입니다.`
    };
  });
  us.forEach(item => { item.kr = relationForUs(item); });

  const ksRows = parseLargestTable(await wikiHtml('KOSPI_200'), 'Symbol');
  const kospi200 = ksRows
    .filter(row => row.Symbol && /^\d{6}$/.test(row.Symbol))
    .map(row => ({
      code: row.Symbol,
      name: row.Company,
      market: 'KOSPI',
      indexGroups: ['KOSPI200'],
      gicsSector: row['GICS Sector'] || '',
      sector: sectorKey(row['GICS Sector'] || ''),
      sectorLabel: sectorLabel(sectorKey(row['GICS Sector'] || '')),
      subSector: '',
      themes: [],
      note: 'KOSPI200 자동 수집. 세부섹터 검수 필요.'
    }));

  const themeCore = JSON.parse(await fs.readFile(path.join(dataDir, 'theme-core-kr.json'), 'utf8'));
  const krMap = new Map();
  for (const item of kospi200) krMap.set(item.code, item);
  for (const item of themeCore) {
    const prev = krMap.get(item.code);
    krMap.set(item.code, prev ? { ...prev, ...item, indexGroups: [...new Set([...(prev.indexGroups || []), ...(item.indexGroups || [])])] } : item);
  }

  await fs.writeFile(path.join(dataDir, 'us-stocks.generated.json'), JSON.stringify(us, null, 2), 'utf8');
  await fs.writeFile(path.join(dataDir, 'kr-stocks.generated.json'), JSON.stringify([...krMap.values()], null, 2), 'utf8');
  await fs.writeFile(path.join(dataDir, 'mapping-review.generated.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: 'draft_requires_human_review',
    sources: [
      'Wikipedia: List of S&P 500 companies',
      'Wikipedia: KOSPI 200',
      'data/theme-core-kr.json'
    ],
    counts: { us: us.length, kr: krMap.size }
  }, null, 2), 'utf8');

  console.log(`Generated ${us.length} US stocks and ${krMap.size} KR stocks.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
