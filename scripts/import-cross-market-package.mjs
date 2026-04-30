import fs from 'node:fs/promises';
import path from 'node:path';

const sourceDir = process.argv[2] || 'incoming/cross_market_mapping_v1_package_v2';
const outFile = process.argv[3] || 'data/cross-market-mapping.v1.json';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(v => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(v => v.trim())) rows.push(row);
  const headers = rows.shift().map(h => h.trim());
  return rows.map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] || '').trim()])));
}

async function readCsv(name) {
  return parseCsv(await fs.readFile(path.join(sourceDir, name), 'utf8'));
}

const krAliases = new Map([
  ['SK하이닉스', { code: '000660', canonicalName: 'SK Hynix' }],
  ['HD현대일렉트릭', { code: '267260', canonicalName: 'HD현대일렉트릭' }],
  ['한화에어로', { code: '012450', canonicalName: 'Hanwha Aerospace' }]
]);

const [megaSectors, usSignalHub, krProxyUniverseRaw, matrixRaw] = await Promise.all([
  readCsv('mega_sectors_18.csv'),
  readCsv('us_top30_signal_hub.csv'),
  readCsv('kr_core50_proxy_universe.csv'),
  readCsv('us_kr_mapping_matrix_v1.csv')
]);

const usFactor = new Map();
for (const us of usSignalHub) {
  const hit = matrixRaw.find(row => row.us === us.ticker);
  const kr = krProxyUniverseRaw.find(row => row.name === hit?.kr);
  usFactor.set(us.ticker, kr?.cluster || '');
}

const krProxyUniverse = krProxyUniverseRaw.map(row => ({
  ...row,
  ...(krAliases.get(row.name) || {})
}));

const matrix = matrixRaw.map(row => {
  const alias = krAliases.get(row.kr) || {};
  const kr = krProxyUniverse.find(item => item.name === row.kr);
  return {
    us: row.us,
    kr: row.kr,
    krCode: alias.code || kr?.code || '',
    score: Number(row.score || 0),
    factor: kr?.cluster || usFactor.get(row.us) || '',
    source: 'matrix_v1'
  };
});

const out = {
  version: 1,
  source: path.basename(sourceDir),
  megaSectors,
  usSignalHub: usSignalHub.map(row => ({ ...row, factor: usFactor.get(row.ticker) || '' })),
  krProxyUniverse,
  matrix
};

await fs.mkdir(path.dirname(outFile), { recursive: true });
await fs.writeFile(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outFile}: ${matrix.length} matrix rows`);
