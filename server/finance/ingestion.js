import { getPrisma } from '../research/prisma.js';
import * as em from './adapters/eastmoney.js';
import { assertQuote, cleanCode, date, hash, marketFor, number } from './normalize.js';

const SOURCE = { key: 'eastmoney', name: '东方财富', kind: 'market-data', baseUrl: 'https://www.eastmoney.com/' };
async function source(db) { return db.dataSource.upsert({ where: { key: SOURCE.key }, create: SOURCE, update: { name: SOURCE.name, baseUrl: SOURCE.baseUrl, enabled: true } }); }
async function runJob(job, action) {
  const db = getPrisma(); const ds = await source(db);
  const run = await db.ingestionRun.create({ data: { job, provider: ds.key, sourceId: ds.id } });
  try {
    const result = await action(db, ds);
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'succeeded', finishedAt: new Date(), recordsRead: result.read, recordsWritten: result.written, anomalies: result.anomalies || [] } });
    return { runId: run.id.toString(), ...result };
  } catch (error) {
    await db.ingestionRun.update({ where: { id: run.id }, data: { status: 'failed', finishedAt: new Date(), error: error.message } });
    throw error;
  }
}

function quoteFromRaw(r) {
  return assertQuote({ code: cleanCode(r.f12), name: String(r.f14 || '').trim(), price: number(r.f2), changePercent: number(r.f3), volume: number(r.f5), turnover: number(r.f6), turnoverRate: number(r.f8), pe: number(r.f9), pb: number(r.f23), industryName: String(r.f100 || '').trim(), high: number(r.f15), low: number(r.f16), open: number(r.f17), previousClose: number(r.f18), marketCap: number(r.f20), raw: r });
}
export async function ingestQuotes({ size = Number(process.env.FINANCE_QUOTE_BATCH_SIZE || 500) } = {}) {
  return runJob('quotes', async (db, ds) => {
    const raw = await em.fetchQuotes({ size }); let written = 0; const anomalies = []; const seen = new Set();
    for (const row of raw) {
      try {
        const q = quoteFromRaw(row); if (!q.name || q.price == null || seen.has(q.code)) continue; seen.add(q.code);
        const industry = q.industryName ? await db.industry.upsert({ where: { code: q.industryName }, create: { code: q.industryName, name: q.industryName, source: ds.key, raw: { providerField: 'f100' } }, update: { name: q.industryName, source: ds.key } }) : null;
        const stock = await db.stock.upsert({ where: { code: q.code }, create: { code: q.code, name: q.name, market: marketFor(q.code), exchange: marketFor(q.code), industryId: industry?.id, raw: q.raw }, update: { name: q.name, market: marketFor(q.code), industryId: industry?.id, raw: q.raw } });
        const tradeDate = new Date(); tradeDate.setUTCHours(0, 0, 0, 0);
        await db.stockPrice.upsert({ where: { stockId_tradeDate_interval_sourceId: { stockId: stock.id, tradeDate, interval: '1d', sourceId: ds.id } }, create: { stockId: stock.id, tradeDate, close: q.price, open: q.open, high: q.high, low: q.low, previousClose: q.previousClose, changePercent: q.changePercent, volume: q.volume == null ? null : BigInt(Math.trunc(q.volume)), turnover: q.turnover, turnoverRate: q.turnoverRate, marketCap: q.marketCap, pe: q.pe, pb: q.pb, sourceId: ds.id, providerKey: `${q.code}:${tradeDate.toISOString().slice(0,10)}`, sourceUrl: `https://quote.eastmoney.com/${q.code}.html`, payloadHash: hash(row), raw: row }, update: { close: q.price, open: q.open, high: q.high, low: q.low, previousClose: q.previousClose, changePercent: q.changePercent, volume: q.volume == null ? null : BigInt(Math.trunc(q.volume)), turnover: q.turnover, turnoverRate: q.turnoverRate, marketCap: q.marketCap, pe: q.pe, pb: q.pb, fetchedAt: new Date(), payloadHash: hash(row), raw: row } }); written++;
      } catch (e) { anomalies.push({ providerKey: String(row?.f12 || 'unknown'), error: e.message }); }
    }
    if (!written) throw new Error(`Eastmoney returned no usable quotes (${anomalies.length} anomalies)`);
    return { read: raw.length, written, anomalies };
  });
}

export async function ingestMarketIndicators() {
  return runJob('market-indicators', async (db, ds) => {
    const rows = await em.fetchMarketIndicators(); let written = 0; const observedAt = new Date(); observedAt.setUTCSeconds(0, 0);
    for (const r of rows) for (const [suffix, name, value, unit] of [['close','收盘点位',r.f2,'points'],['change_pct','涨跌幅',r.f3,'percent'],['turnover','成交额',r.f6,'CNY']]) {
      if (number(value) == null) continue; const key = `${r.f12}.${suffix}`;
      await db.marketIndicator.upsert({ where: { key_observedAt_sourceId: { key, observedAt, sourceId: ds.id } }, create: { key, name: `${r.f14}${name}`, observedAt, value: number(value), unit, dimensions: { indexCode: r.f12 }, sourceId: ds.id, providerKey: `${key}:${observedAt.toISOString()}`, sourceUrl: 'https://quote.eastmoney.com/center/', payloadHash: hash(r), raw: r }, update: { value: number(value), fetchedAt: new Date(), payloadHash: hash(r), raw: r } }); written++;
    }
    return { read: rows.length, written, anomalies: [] };
  });
}

export async function ingestStockDocuments(code) {
  code = cleanCode(code);
  return runJob(`stock-documents:${code}`, async (db, ds) => {
    const stock = await db.stock.findUnique({ where: { code } }); if (!stock) throw Object.assign(new Error(`Stock ${code} must be ingested before documents`), { status: 404 });
    const [announcements, financials, reports] = await Promise.all([em.fetchAnnouncements(code), em.fetchFinancials(code), em.fetchResearchReports(code)]); let written = 0; const anomalies = [];
    for (const r of announcements) {
      const publishedAt = date(r.notice_date); if (!publishedAt || !r.title) { anomalies.push({ providerKey: r.art_code, error: 'missing title/date' }); continue; }
      const providerKey = String(r.art_code || hash([code, r.title, publishedAt])); const canonicalKey = `eastmoney:announcement:${providerKey}`;
      await db.newsArticle.upsert({ where: { canonicalKey }, create: { canonicalKey, stockId: stock.id, title: r.title, category: 'announcement', publishedAt, url: r.url || `https://data.eastmoney.com/notices/detail/${code}/${providerKey}.html`, sourceId: ds.id, providerKey, payloadHash: hash(r), raw: r }, update: { title: r.title, publishedAt, url: r.url || undefined, fetchedAt: new Date(), payloadHash: hash(r), raw: r } }); written++;
    }
    for (const r of financials) {
      const periodEnd = date(r.REPORT_DATE); if (!periodEnd) { anomalies.push({ providerKey: r.REPORT_DATE_NAME, error: 'missing period' }); continue; }
      const statementType = 'financial-summary';
      const values = { revenue: number(r.TOTALOPERATEREVE ?? r.TOTAL_OPERATE_INCOME), netProfit: number(r.PARENTNETPROFIT ?? r.PARENT_NETPROFIT), totalAssets: number(r.TOTAL_ASSETS_PK), totalEquity: number(r.TOTAL_EQUITY_PK), totalLiabilities: number(r.LIABILITY), roe: number(r.ROEJQ), grossMargin: number(r.XSMLL), operatingCashFlow: number(r.NETCASH_OPERATE_PK), investingCashFlow: number(r.NETCASH_INVEST_PK), financingCashFlow: number(r.NETCASH_FINANCE_PK) };
      await db.financialStatement.upsert({ where: { stockId_statementType_periodEnd_sourceId: { stockId: stock.id, statementType, periodEnd, sourceId: ds.id } }, create: { stockId: stock.id, statementType, periodEnd, reportType: r.REPORT_DATE_NAME, ...values, metrics: r, sourceId: ds.id, providerKey: `${code}:${periodEnd.toISOString().slice(0,10)}:${statementType}`, sourceUrl: `https://data.eastmoney.com/bbsj/${code}.html`, payloadHash: hash(r), raw: r }, update: { ...values, metrics: r, fetchedAt: new Date(), payloadHash: hash(r), raw: r } }); written++;
    }
    for (const r of reports) {
      const publishedAt = date(r.publishDate); if (!publishedAt || !r.title || !r.infoCode) { anomalies.push({ providerKey: r.infoCode, error: 'missing report identity/date' }); continue; }
      const providerKey = String(r.infoCode); const canonicalKey = `eastmoney:research:${providerKey}`;
      await db.researchReport.upsert({ where: { canonicalKey }, create: { canonicalKey, stockId: stock.id, title: r.title, institution: r.orgSName || r.orgName, analyst: r.researcher, rating: r.emRatingName || r.sRatingName, targetPrice: number(r.indvAimPriceT || r.indvAimPriceL), publishedAt, url: `https://data.eastmoney.com/report/zw_stock.jshtml?infocode=${providerKey}`, summary: null, sourceId: ds.id, providerKey, payloadHash: hash(r), raw: r }, update: { title: r.title, institution: r.orgSName || r.orgName, analyst: r.researcher, rating: r.emRatingName || r.sRatingName, targetPrice: number(r.indvAimPriceT || r.indvAimPriceL), publishedAt, fetchedAt: new Date(), payloadHash: hash(r), raw: r } }); written++;
    }
    return { read: announcements.length + financials.length + reports.length, written, anomalies };
  });
}
