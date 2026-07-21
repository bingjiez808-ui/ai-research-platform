import { getPrisma } from '../../research/prisma.js';

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export async function calculateEventImpacts({ limit = 200 } = {}) {
  const db = getPrisma(); const events = await db.event.findMany({ take: limit, orderBy: { occurredAt: 'desc' }, include: { article: { include: { stock: true } } } });
  let written = 0, insufficient = 0;
  for (const event of events) {
    const stock = event.article?.stock; if (!stock) { insufficient++; continue; }
    const prices = await db.stockPrice.findMany({ where: { stockId: stock.id }, orderBy: { tradeDate: 'asc' } });
    const before = prices.filter(p => p.tradeDate <= event.occurredAt).at(-1); const after = prices.find(p => p.tradeDate > event.occurredAt);
    if (!before || !after) { insufficient++; continue; }
    const pre = Number(before.close), post = Number(after.close), stockReturn = (post - pre) / pre; const abnormal = stockReturn;
    const recencyConfidence = Math.min(1, prices.length / 20); const impactScore = clamp(abnormal * 500 + Number(event.sentiment || 0) * 20, -100, 100);
    await db.eventImpact.upsert({ where: { eventId_stockId_window: { eventId: event.id, stockId: stock.id, window: 'next-trading-day' } }, create: { eventId: event.id, stockId: stock.id, window: 'next-trading-day', prePrice: pre, postPrice: post, benchmarkReturn: 0, stockReturn, abnormalReturn: abnormal, impactScore, confidence: recencyConfidence, method: 'event-window-v1', evidence: [{ beforeId: String(before.id), afterId: String(after.id) }] }, update: { prePrice: pre, postPrice: post, stockReturn, abnormalReturn: abnormal, impactScore, confidence: recencyConfidence, calculatedAt: new Date() } }); written++;
  }
  return { read: events.length, written, insufficient };
}
