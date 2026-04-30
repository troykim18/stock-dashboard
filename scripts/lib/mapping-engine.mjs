export function corrWeight(corr) {
  return { high: 100, mid: 68, low: 38 }[String(corr || '').toLowerCase()] || 50;
}

export function buildKrMeta(krStocks = []) {
  return new Map((Array.isArray(krStocks) ? krStocks : []).map(stock => [stock.code || stock.t, stock]));
}

export function findUsStock(usStocks, ticker) {
  const q = String(ticker || '').trim().toUpperCase();
  return (Array.isArray(usStocks) ? usStocks : []).find(stock => String(stock.symbol || stock.id).toUpperCase() === q) || null;
}

export function getKrProxyTop(usStocks, krStocks, ticker, options = {}) {
  const limit = Number(options.limit || 5);
  const crossMapping = options.crossMapping || { matrix: [] };
  const us = findUsStock(usStocks, ticker);
  if (!us) return { found: false, ticker: String(ticker || '').toUpperCase(), proxies: [] };

  const krMeta = buildKrMeta(krStocks);
  const usMove = Number(options.usMovePct ?? us.pct ?? 0);
  const moveBoost = Math.min(18, Math.abs(usMove) * 2);
  const direction = usMove >= 0 ? 'up' : 'down';
  const seen = new Map();

  for (const kr of us.kr || []) {
    const code = kr.t || kr.code;
    if (!code) continue;
    const meta = krMeta.get(code) || {};
    const krPct = Number(kr.pct ?? meta.pct ?? 0);
    const krMomentum = Number.isFinite(krPct) ? Math.max(-8, Math.min(12, krPct * 1.4)) : 0;
    const groupBoost = (meta.indexGroups || kr.indexGroups || []).includes('KOSPI200') ? 6 : 0;
    const themeBoost = Array.isArray(meta.themes) && meta.themes.some(t => (us.themes || []).includes(t)) ? 5 : 0;
    const relationBoost = kr.relation ? 5 : 0;
    const score = corrWeight(kr.corr) + moveBoost + krMomentum + groupBoost + themeBoost + relationBoost;

    const row = {
      code,
      name: kr.n || meta.name || '',
      market: meta.market || kr.market || '',
      groups: meta.indexGroups || kr.indexGroups || [],
      corr: kr.corr || 'mid',
      relation: kr.relation || '',
      score: Math.round(score),
      price: kr.price ?? meta.price ?? null,
      pct: Number.isFinite(krPct) ? krPct : null,
      reason: [
        `${us.symbol || us.id} ${direction === 'up' ? '상승' : '하락'} 충격`,
        us.subSector ? `팩터 ${us.subSector}` : '',
        kr.relation || '',
        kr.corr ? `관련도 ${kr.corr}` : ''
      ].filter(Boolean).join(' · ')
    };

    const prev = seen.get(code);
    if (!prev || row.score > prev.score) seen.set(code, row);
  }

  for (const m of crossMapping.matrix || []) {
    if (String(m.us || '').toUpperCase() !== String(us.symbol || us.id).toUpperCase()) continue;
    const code = m.krCode || '';
    if (!code) continue;
    const meta = krMeta.get(code) || {};
    const existingKr = (us.kr || []).find(kr => (kr.t || kr.code) === code) || {};
    const matrixScore = Number(m.score || 0);
    const row = {
      code,
      name: existingKr.n || m.kr || meta.name || '',
      market: meta.market || existingKr.market || '',
      groups: meta.indexGroups || existingKr.indexGroups || [],
      corr: matrixScore >= 90 ? 'high' : matrixScore >= 70 ? 'mid' : 'low',
      relation: `${m.factor || 'Factor'} matrix`,
      score: Math.round(matrixScore + 20 + Math.min(10, Math.abs(usMove))),
      price: existingKr.price ?? meta.price ?? null,
      pct: null,
      reason: `Mapping Matrix v${crossMapping.version || 1} · ${m.factor || 'Factor'} transmission · score ${matrixScore}`
    };
    const prev = seen.get(code);
    if (!prev || row.score > prev.score) seen.set(code, row);
  }

  return {
    found: true,
    ticker: us.symbol || us.id,
    name: us.name,
    koName: us.koName || '',
    sector: us.sector,
    sectorLabel: us.sectorLabel || us.gicsSector || '',
    factor: us.subSector || '',
    themes: us.themes || [],
    usMovePct: usMove,
    proxies: [...seen.values()].sort((a, b) => b.score - a.score).slice(0, limit)
  };
}
