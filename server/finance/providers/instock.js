const DEFAULT_BASE_URL = 'http://localhost:9988';
const TABLE = 'cn_stock_selection';
const CACHE_KEY = `${TABLE}:latest`;
const FACTOR_KEYS = ['quality', 'growthValuation', 'technical', 'marketChip', 'risk'];

const clamp = value => Math.max(0, Math.min(100, value));
const numeric = value => {
  if (value == null || value === '' || value === '-' || value === '--') return null;
  const parsed = Number(String(value).replaceAll(',', '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const first = (row, keys) => keys.map(key => row?.[key]).find(value => value != null && value !== '') ?? null;
const dateText = value => String(value || '').slice(0, 10);
const mean = values => { const available = values.filter(Number.isFinite); return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null; };
const scorePoint = (value, { good, bad, invert = false }) => {
  if (!Number.isFinite(value)) return null;
  const score = ((value - bad) / (good - bad || .001)) * 100;
  return clamp(invert ? 100 - score : score);
};
const positiveFlag = (row, keys) => {
  const value = first(row, keys);
  if (value == null) return null;
  return ['1', 'true', 'yes', '是', 'Y'].includes(String(value).trim()) ? 100 : 35;
};
const percent = value => Number.isFinite(value) && Math.abs(value) <= 1 ? value * 100 : value;
const toYi = value => !Number.isFinite(value) ? null : Math.abs(value) > 1e6 ? value / 1e8 : value;
const listedDays = value => {
  if (!value) return null;
  const text = String(value).replaceAll('-', '').slice(0, 8);
  if (!/^\d{8}$/.test(text)) return null;
  const parsed = new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00Z`);
  return Number.isNaN(parsed.valueOf()) ? null : Math.floor((Date.now() - parsed.valueOf()) / 86400000);
};

export function unwrapInStockRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.data, payload?.rows, payload?.items, payload?.result?.data, payload?.data?.data]) if (Array.isArray(candidate)) return candidate;
  return [];
}

export function normalizeSelectionRow(row) {
  const code = String(first(row, ['code', 'ts_code', 'stock_code', 'symbol']) || '').replace(/\D/g, '').slice(0, 6);
  const name = String(first(row, ['name', 'stock_name']) || code);
  const price = numeric(first(row, ['new_price', 'close', 'price']));
  const roe = percent(numeric(first(row, ['roe_weight', 'roe'])));
  const roic = percent(numeric(first(row, ['roic'])));
  const grossMargin = percent(numeric(first(row, ['sale_gpr', 'gross_margin'])));
  const netMargin = percent(numeric(first(row, ['sale_npr', 'net_margin'])));
  const revenueGrowth = percent(numeric(first(row, ['toi_yoy_ratio', 'income_growthrate_3y', 'revenue_growth'])));
  const profitGrowth = percent(numeric(first(row, ['deduct_netprofit_growthrate', 'netprofit_yoy_ratio', 'netprofit_growthrate_3y'])));
  const cashFlow = numeric(first(row, ['per_netcash_operate', 'operate_cash_flow']));
  const deductProfit = numeric(first(row, ['deduct_netprofit']));
  const debtRatio = percent(numeric(first(row, ['debt_asset_ratio'])));
  const currentRatio = numeric(first(row, ['current_ratio']));
  const pe = numeric(first(row, ['pettmdeducted', 'pe9', 'pe_ttm', 'pe']));
  const pb = numeric(first(row, ['pbnewmrq', 'pb']));
  const peg = numeric(first(row, ['ycpeg', 'peg']));
  const changePercent = percent(numeric(first(row, ['change_rate', 'change_percent', 'pct_chg'])));
  const change5 = percent(numeric(first(row, ['changerate_5days'])));
  const change10 = percent(numeric(first(row, ['changerate_10days'])));
  const turnoverRate = percent(numeric(first(row, ['turnoverrate', 'turnover_rate'])));
  const volumeRatio = numeric(first(row, ['volume_ratio', 'vol_ratio']));
  const dealAmountYi = toYi(numeric(first(row, ['deal_amount', 'amount'])));
  const freeCapYi = toYi(numeric(first(row, ['free_cap', 'circ_mv'])));
  const listingAgeDays = listedDays(first(row, ['listing_date', 'list_date']));
  const industry = first(row, ['industry']);
  const financeLike = /银行|保险|证券|多元金融|房地产/.test(String(industry || ''));

  // Each dimension keeps representative, economically distinct features; correlated duplicates
  // (for example three MACD timeframes) are evidence only and are not repeatedly weighted.
  const profitability = mean([scorePoint(roe, { bad: 5, good: 20 }), scorePoint(roic, { bad: 3, good: 15 }), scorePoint(netMargin, { bad: 0, good: 20 })]);
  const cashSafety = mean([cashFlow == null ? null : cashFlow > 0 ? 85 : 10, financeLike ? null : scorePoint(debtRatio, { bad: 60, good: 25 }), scorePoint(currentRatio, { bad: .8, good: 2 })]);
  const quality = mean([profitability, cashSafety, scorePoint(grossMargin, { bad: 10, good: 50 })]);
  const growth = mean([scorePoint(revenueGrowth, { bad: -10, good: 30 }), scorePoint(profitGrowth, { bad: -15, good: 35 })]);
  const valuation = mean([scorePoint(pe, { bad: 80, good: 15 }), scorePoint(pb, { bad: 10, good: 1.5 }), scorePoint(peg, { bad: 3, good: .8 })]);
  const growthValuation = mean([growth, valuation]);
  const trend = mean([positiveFlag(row, ['long_avg_array']), positiveFlag(row, ['breakup_ma_20days']), positiveFlag(row, ['break_through'])]);
  const momentum = mean([scorePoint(change5, { bad: -8, good: 12 }), scorePoint(change10, { bad: -12, good: 20 })]);
  const technical = mean([trend, momentum]);
  const liquidity = mean([scorePoint(turnoverRate, { bad: .3, good: 5 }), scorePoint(volumeRatio, { bad: .6, good: 2 }), scorePoint(dealAmountYi, { bad: .5, good: 10 })]);
  const funds = mean([scorePoint(numeric(first(row, ['netinflow_3days'])), { bad: -1, good: 1 }), scorePoint(numeric(first(row, ['ddx_3d'])), { bad: -.2, good: .5 }), scorePoint(numeric(first(row, ['mutual_netbuy_amt'])), { bad: -1, good: 1 })]);
  const marketChip = mean([liquidity, funds]);

  const riskReasons = [];
  if (/ST|退/.test(name.toUpperCase())) riskReasons.push('ST或退市风险标识');
  if (listingAgeDays != null && listingAgeDays < 120) riskReasons.push('上市不足120日');
  if (dealAmountYi != null && dealAmountYi < 2) riskReasons.push('成交额低于2亿元');
  if (deductProfit != null && deductProfit <= 0) riskReasons.push('扣非净利润不为正');
  if (cashFlow != null && cashFlow <= 0) riskReasons.push('每股经营现金流不为正');
  if (!financeLike && debtRatio != null && debtRatio > 60) riskReasons.push('资产负债率高于60%');
  if (change5 != null && change5 > 25) riskReasons.push('5日涨幅超过25%，禁止追高');
  if (change10 != null && change10 > 40) riskReasons.push('10日涨幅超过40%，禁止追高');
  if (positiveFlag(row, ['short_avg_array']) === 100) riskReasons.push('均线空头排列');
  const risk = mean([
    financeLike ? null : scorePoint(debtRatio, { bad: 35, good: 80 }),
    change5 == null ? null : clamp(Math.max(0, Math.abs(change5) - 8) * 4),
    change10 == null ? null : clamp(Math.max(0, Math.abs(change10) - 15) * 3),
    positiveFlag(row, ['high_funds_outflow']), positiveFlag(row, ['down_7days'])
  ]);
  const factorScores = { quality, growthValuation, technical, marketChip, risk };
  const positiveDimensions = [quality, growthValuation, technical, marketChip].filter(Number.isFinite);
  const evidenceCount = [roe, roic, cashFlow, debtRatio, revenueGrowth, profitGrowth, pe, peg, change5, change10, turnoverRate, volumeRatio, dealAmountYi].filter(Number.isFinite).length;
  const evidenceCompleteness = evidenceCount / 13;
  const qualityGate = Number.isFinite(quality) && quality >= 70;
  const dimensionGate = positiveDimensions.length >= 3 && evidenceCompleteness >= .55;
  const hardFilterPassed = riskReasons.length === 0;
  const eligible = qualityGate && dimensionGate && hardFilterPassed;
  const positive = mean([quality, growthValuation, technical, marketChip]);
  const totalScore = positive == null ? null : clamp(positive * .95 - (risk ?? 40) * .15 + 8);
  const strengths = [
    ['盈利与财务质量', quality], ['成长估值匹配', growthValuation], ['趋势与动量', technical], ['流动性与资金', marketChip]
  ].filter(([, score]) => Number.isFinite(score) && score >= 65).sort((a, b) => b[1] - a[1]).map(([label, score]) => `${label} ${score.toFixed(0)}分`);
  const screeningStatus = !hardFilterPassed ? 'risk-excluded' : !qualityGate ? 'quality-gate-failed' : !dimensionGate ? 'insufficient-evidence' : totalScore >= 80 ? 'near-trigger' : totalScore >= 70 ? 'watch' : 'neutral';

  return {
    code, name, date: dateText(first(row, ['date', 'trade_date'])), industry,
    concept: first(row, ['concept']), style: first(row, ['style']), eligible, screeningStatus,
    screeningReasons: eligible ? strengths.slice(0, 3) : riskReasons.length ? riskReasons : !qualityGate ? ['基本面质量分未达到70分闸门'] : ['至少三个维度且55%关键证据完整才进入候选'],
    hardFilter: { passed: hardFilterPassed, reasons: riskReasons },
    quote: { price, changePercent, turnoverRate, volumeRatio, pe, pb, dealAmountYi, freeCapYi },
    fundamentals: { roe, roic, grossMargin, netMargin, revenueGrowth, profitGrowth, cashFlow, deductProfit, debtRatio, currentRatio, peg },
    technicalEvidence: { macdDaily: positiveFlag(row, ['macd_golden_fork']) === 100, aboveMa20: positiveFlag(row, ['breakup_ma_20days']) === 100, longMaAlignment: positiveFlag(row, ['long_avg_array']) === 100, breakout: positiveFlag(row, ['break_through']) === 100, change5, change10, volumeRatio, turnoverRate, changePercent },
    factorScores: Object.fromEntries(Object.entries(factorScores).map(([key, value]) => [key, value == null ? null : Number(value.toFixed(1))])),
    totalScore: totalScore == null ? null : Number(totalScore.toFixed(1)), evidenceCompleteness: Number(evidenceCompleteness.toFixed(2)),
    factorMethod: { selected: ['ROE/ROIC/净利率', '现金流/负债', '营收与扣非增长', 'PE/PEG', '均线趋势/5-10日动量', '量比/换手/成交额', '3日资金/DDX'], excludedDuplicates: ['周月MACD不重复加权', '同类均线突破只计趋势组', '资金代理指标只占辅助权重'] }
  };
}

const previousDate = date => { const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() - 1); return next.toISOString().slice(0, 10); };
async function fetchJson(url, timeoutMs = 12000) { const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'AI-Research-Platform/1.0' }, signal: AbortSignal.timeout(timeoutMs) }); if (!response.ok) throw new Error(`InStock HTTP ${response.status}`); return response.json(); }
function buildResult(rows, limit) {
  const normalized = rows.map(normalizeSelectionRow).filter(item => item.code);
  const scored = normalized.filter(item => item.totalScore != null);
  const eligible = scored.filter(item => item.eligible).sort((a, b) => b.totalScore - a.totalScore);
  const factorMethod = normalized.find(item => item.factorMethod)?.factorMethod;
  return {
    items: eligible.slice(0, limit),
    coverage: {
      rawRows: rows.length, normalized: normalized.length, scored: scored.length, eligible: eligible.length, returned: Math.min(limit, eligible.length),
      riskExcluded: normalized.filter(item => item.screeningStatus === 'risk-excluded').length,
      qualityRejected: normalized.filter(item => item.screeningStatus === 'quality-gate-failed').length,
      evidenceRejected: normalized.filter(item => item.screeningStatus === 'insufficient-evidence').length,
      averageCompleteness: eligible.length ? Number((eligible.reduce((sum, item) => sum + item.evidenceCompleteness, 0) / eligible.length).toFixed(2)) : 0,
      factors: Object.fromEntries(FACTOR_KEYS.map(field => [field, normalized.filter(item => item.factorScores[field] != null).length]))
    },
    methodology: { version: 'InStock 多维策略 V1.1', qualityGate: 70, minimumDimensions: 3, minimumCompleteness: .55, factorMethod }
  };
}

export async function getInStockSelection({ date = new Date().toISOString().slice(0, 10), lookback = 10, limit = 100 } = {}) {
  const baseUrl = String(process.env.INSTOCK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''), safeLimit = Math.min(500, Math.max(1, limit)); let cursor = date, lastError = null;
  for (let attempt = 0; attempt <= lookback; attempt += 1) {
    try {
      const url = new URL('/instock/api_data', baseUrl); url.searchParams.set('name', TABLE); url.searchParams.set('date', cursor);
      const rows = unwrapInStockRows(await fetchJson(url));
      if (rows.length) { const result = buildResult(rows, safeLimit); return { status: 'live', requestedDate: date, dataDate: cursor, fallbackDays: attempt, ...result, source: `${baseUrl} · ${TABLE}` }; }
    } catch (error) { lastError = error; }
    cursor = previousDate(cursor);
  }
  if (process.env.DATABASE_URL) { const { readCache } = await import('./cache.js'), cached = await readCache('instock', CACHE_KEY, { allowStale: true }).catch(() => null); if (cached?.payload?.items?.length) return { ...cached.payload, status: 'cached-sync', requestedDate: date, source: `InStock 本机受保护同步 · ${TABLE}`, cacheFetchedAt: cached.fetchedAt, reason: lastError ? `本机直连不可用，使用最近同步快照：${lastError.message}` : '使用最近同步快照' }; }
  return { status: 'unavailable', requestedDate: date, dataDate: null, fallbackDays: lookback, items: [], coverage: { rawRows: 0, normalized: 0, scored: 0, eligible: 0, returned: 0, averageCompleteness: 0, factors: {} }, source: `${baseUrl} · ${TABLE}`, reason: lastError ? lastError.message : `最近 ${lookback + 1} 个自然日均无记录` };
}

export async function storeInStockSelectionSnapshot(payload) {
  const rows = unwrapInStockRows(payload).slice(0, 6000), result = buildResult(rows, 500);
  if (!rows.length) throw Object.assign(new Error('InStock payload has no rows'), { status: 422, code: 'EMPTY_INSTOCK_PAYLOAD' });
  const dates = rows.map(row => dateText(first(row, ['date', 'trade_date']))).filter(Boolean).sort();
  const dataDate = dates.at(-1) || dateText(payload?.dataDate) || new Date().toISOString().slice(0, 10);
  const snapshot = { dataDate, ...result, syncedAt: new Date().toISOString() };
  const { writeCache } = await import('./cache.js'); await writeCache('instock', CACHE_KEY, snapshot, { ttlMs: 36e5, staleMs: 1000 * 60 * 60 * 24 * 14, status: 'synced' }); return snapshot;
}
