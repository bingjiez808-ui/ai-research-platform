import { ingestMarketIndicators, ingestQuotes, ingestStockDocuments } from '../server/finance/ingestion.js';
import { getPrisma } from '../server/research/prisma.js';
import { marketAnalyst, newsIntelligence, stockResearch } from '../server/finance/agents/index.js';

const job = process.argv[2];
if (!['open', 'close', 'nightly'].includes(job)) throw new Error('Usage: npm run finance:job -- <open|close|nightly>');
const codes = (process.env.FINANCE_WATCHLIST || '').split(',').map(x => x.trim()).filter(Boolean);
const output = [];
async function saveAnalysis(db, stockId, analysis) {
  await db.aIAnalysis.create({ data: { stockId, agent: analysis.agent, method: analysis.method, version: analysis.version, asOf: new Date(), score: analysis.score, signal: analysis.signal, summary: analysis.summary, evidence: analysis.evidence, risks: analysis.risks } });
}
try {
  if (job === 'open' || job === 'close') {
    output.push({ quotes: await ingestQuotes() });
    output.push({ marketIndicators: await ingestMarketIndicators() });
    const indicators = await getPrisma().marketIndicator.findMany({ take: 12, orderBy: { observedAt: 'desc' } });
    await saveAnalysis(getPrisma(), null, marketAnalyst(indicators));
  }
  if (job === 'nightly' && !codes.length) throw new Error('FINANCE_WATCHLIST is required for nightly ingestion; refusing to invent a stock universe');
  if (job === 'close' || job === 'nightly') for (const code of codes) {
    output.push({ code, documents: await ingestStockDocuments(code) });
    const stock = await getPrisma().stock.findUnique({ where: { code }, include: { prices: { take: 1, orderBy: { tradeDate: 'desc' } }, statements: { take: 1, orderBy: { periodEnd: 'desc' } }, news: { take: 30, orderBy: { publishedAt: 'desc' } } } });
    if (stock) { await saveAnalysis(getPrisma(), stock.id, stockResearch(stock)); await saveAnalysis(getPrisma(), stock.id, newsIntelligence(stock.news)); }
  }
  console.log(JSON.stringify({ job, output }, null, 2));
} finally { await getPrisma().$disconnect(); }
