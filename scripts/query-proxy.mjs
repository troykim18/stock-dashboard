import fs from 'node:fs/promises';
import { getKrProxyTop } from './lib/mapping-engine.mjs';

const ticker = process.argv[2] || 'NVDA';
const limit = Number(process.argv[3] || 5);
const usStocks = JSON.parse(await fs.readFile('data/us-stocks.generated.json', 'utf8'));
const krStocks = JSON.parse(await fs.readFile('data/kr-stocks.generated.json', 'utf8'));
let crossMapping = { matrix: [] };
try {
  crossMapping = JSON.parse(await fs.readFile('data/cross-market-mapping.v1.json', 'utf8'));
} catch {}
const result = getKrProxyTop(usStocks, krStocks, ticker, { limit, crossMapping });

if (!result.found) {
  console.error(`US ticker not found: ${ticker}`);
  process.exit(1);
}

console.log(`${result.ticker} ${result.name} -> ${result.factor || result.sectorLabel}`);
for (const [idx, proxy] of result.proxies.entries()) {
  const groups = proxy.groups?.length ? ` [${proxy.groups.join('/')}]` : '';
  console.log(`${idx + 1}. ${proxy.name} (${proxy.code})${groups} score=${proxy.score} corr=${proxy.corr} ${proxy.relation || ''}`);
}
