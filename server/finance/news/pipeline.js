import crypto from 'crypto';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';

const rules = [
  ['regulatory', /处罚|监管|立案|问询|违规/], ['earnings', /业绩|营收|净利润|预增|预亏/],
  ['capital', /回购|增持|减持|定增|融资|分红/], ['contract', /中标|合同|订单|合作/],
  ['risk', /诉讼|风险|终止|退市|违约/], ['product', /产品|发布|研发|专利/],
];
const positive = /增长|中标|回购|增持|盈利|分红|突破|获批/;
const negative = /亏损|减持|处罚|诉讼|风险|终止|退市|违约/;
const stop = new Set(['股份','有限公司','公司','关于','公告','进行','以及','相关','事项']);

export const cleanText = text => String(text || '').replace(/<[^>]+>/g, ' ').replace(/&\w+;/g, ' ').replace(/\s+/g, ' ').trim();
export const classify = text => rules.find(([, regex]) => regex.test(text))?.[0] || 'other';
export const sentiment = text => positive.test(text) ? 0.65 : negative.test(text) ? -0.65 : 0;
export function keywords(text) { return [...new Set((cleanText(text).match(/[\u4e00-\u9fff]{2,6}|[A-Za-z]{3,}/g) || []).filter(x => !stop.has(x)))].slice(0, 8); }

async function embed(text) {
  if (!process.env.EMBEDDING_API_URL || !process.env.EMBEDDING_API_KEY) return null;
  const { data } = await axios.post(process.env.EMBEDDING_API_URL, { model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small', input: text }, { headers: { Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}` }, timeout: Number(process.env.EMBEDDING_TIMEOUT_MS || 30000) });
  return data?.data?.[0]?.embedding || null;
}

export async function processNews({ limit = 200 } = {}) {
  const db = getPrisma(); const articles = await db.newsArticle.findMany({ where: { cleanedContent: null }, take: limit, orderBy: { publishedAt: 'desc' }, include: { stock: { include: { industry: true } } } });
  let embedded = 0, clustered = 0, events = 0;
  for (const article of articles) {
    const text = cleanText(`${article.title} ${article.summary || ''} ${article.content || ''}`); const category = classify(text); const score = sentiment(text); const words = keywords(text);
    const vector = await embed(text);
    await db.newsArticle.update({ where: { id: article.id }, data: { cleanedContent: text, classification: category, sentiment: score, embeddingModel: vector ? (process.env.EMBEDDING_MODEL || 'text-embedding-3-small') : null } });
    if (vector) { await db.$executeRawUnsafe('UPDATE news_articles SET embedding=$1::vector WHERE id=$2', `[${vector.join(',')}]`, article.id); embedded++; }
    const clusterKey = crypto.createHash('sha256').update(`${category}:${words.slice(0,3).sort().join('|')}`).digest('hex');
    const cluster = await db.newsCluster.upsert({ where: { clusterKey }, create: { clusterKey, label: words.slice(0,3).join(' / ') || category, keywords: words, articleCount: 1, sentiment: score, firstSeenAt: article.publishedAt, lastSeenAt: article.publishedAt }, update: { articleCount: { increment: 1 }, lastSeenAt: article.publishedAt, sentiment: score, keywords: words } });
    await db.newsClusterMember.upsert({ where: { clusterId_articleId: { clusterId: cluster.id, articleId: article.id } }, create: { clusterId: cluster.id, articleId: article.id, similarity: vector ? 1 : null }, update: {} }); clustered++;
    const eventKey = `article:${article.id}`;
    await db.event.upsert({ where: { eventKey }, create: { eventKey, articleId: article.id, eventType: category, title: article.title, occurredAt: article.publishedAt, entities: article.stock ? [{ type: 'stock', code: article.stock.code, name: article.stock.name }] : [], industries: article.stock?.industry ? [{ code: article.stock.industry.code, name: article.stock.industry.name }] : [], sentiment: score, confidence: article.stock ? 0.8 : 0.55 }, update: { eventType: category, sentiment: score } }); events++;
  }
  return { read: articles.length, embedded, clustered, events, embeddingConfigured: Boolean(process.env.EMBEDDING_API_KEY) };
}
