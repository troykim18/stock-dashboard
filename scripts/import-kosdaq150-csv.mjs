import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const csvPath = path.join(root, 'data', 'kosdaq150.csv');
const krPath = path.join(root, 'data', 'kr-stocks.generated.json');

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
      row.push(cell.trim());
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function pick(obj, names) {
  for (const name of names) {
    if (obj[name]) return obj[name];
  }
  return '';
}

function inferSector(name = '', industry = '') {
  const text = `${name} ${industry}`;
  if (/반도체|세미|칩|하이닉|동진쎄미|리노|HPSP|ISC|심텍/.test(text)) return ['semiconductor', '반도체'];
  if (/바이오|제약|헬스|의료|팜|셀트리온|알테오젠|HLB|리가켐/.test(text)) return ['bio_healthcare', '바이오/헬스케어'];
  if (/에코프로|배터리|2차전지|전지|양극재|전해/.test(text)) return ['ev_battery', '전기차/2차전지'];
  if (/게임|엔터|콘텐츠|스튜디오|미디어/.test(text)) return ['media_platform', '미디어/플랫폼'];
  if (/로봇|장비|기계|자동화/.test(text)) return ['shipbuilding_industrial', '산업재'];
  if (/화장품|뷰티|코스메/.test(text)) return ['consumer_brand', '소비/브랜드'];
  return ['industrial', '기타'];
}

async function main() {
  const csv = await fs.readFile(csvPath, 'utf8');
  const rows = parseCsv(csv);
  const headers = rows.shift()?.map(h => h.replace(/^\uFEFF/, '').trim()) || [];
  const records = rows.map(cols => Object.fromEntries(headers.map((h, i) => [h, cols[i] || ''])));

  const current = JSON.parse(await fs.readFile(krPath, 'utf8'));
  const byCode = new Map(current.map(item => [item.code, item]));
  let added = 0;
  let updated = 0;

  for (const row of records) {
    const code = pick(row, ['종목코드', '단축코드', '표준코드', 'Code', 'Symbol', '코드']).replace(/\D/g, '').padStart(6, '0').slice(-6);
    const name = pick(row, ['종목명', '한글종목명', 'Name', '회사명']);
    const industry = pick(row, ['업종', '업종명', '산업', 'Sector']);
    if (!/^\d{6}$/.test(code) || !name) continue;
    const [sector, sectorLabel] = inferSector(name, industry);
    const prev = byCode.get(code);
    const next = {
      ...(prev || {}),
      code,
      name: prev?.name || name,
      market: 'KOSDAQ',
      indexGroups: [...new Set([...(prev?.indexGroups || []), 'KOSDAQ150'])],
      sector: prev?.sector || sector,
      sectorLabel: prev?.sectorLabel || sectorLabel,
      subSector: prev?.subSector || '',
      themes: prev?.themes || [],
      note: prev?.note || 'KOSDAQ150 CSV 병합. 세부섹터 검수 필요.'
    };
    if (prev) updated++; else added++;
    byCode.set(code, next);
  }

  const merged = [...byCode.values()].sort((a, b) => (a.market + a.code).localeCompare(b.market + b.code));
  await fs.writeFile(krPath, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`KOSDAQ150 CSV imported. added=${added}, updated=${updated}, total=${merged.length}`);
}

main().catch(error => {
  console.error(error.message);
  console.error('Place a UTF-8 CSV at data/kosdaq150.csv, then run: node scripts/import-kosdaq150-csv.mjs');
  process.exit(1);
});
