import { getPrisma } from '../research/prisma.js';
import { getHotSectorRecommendations } from './hot-sectors.js';

const KEYWORDS=[
  ['人工智能',/人工智能|\bAI\b|大模型|生成式|智能体/gi],['算力',/算力|数据中心|服务器|液冷|光模块/gi],['芯片',/芯片|半导体|晶圆|光刻|存储/gi],
  ['机器人',/机器人|人形|减速器|伺服|自动化/gi],['新能源',/新能源|光伏|风电|锂电|储能|电池/gi],['智能驾驶',/智能驾驶|自动驾驶|车联网|飞行汽车/gi],
  ['创新药',/创新药|医药|生物|临床|医疗器械/gi],['消费',/消费|零售|白酒|食品饮料|旅游|家电/gi],['金融',/银行|券商|保险|降准|降息/gi],
  ['有色资源',/黄金|稀土|铜|铝|锂矿|煤炭|石油|天然气/gi],['军工',/军工|国防|航空|航天|卫星|无人机|船舶/gi],['低空经济',/低空|eVTOL|通航|无人机/gi],
  ['并购重组',/并购|重组|收购|资产注入/gi],['业绩增长',/业绩|增长|预增|扭亏|净利润/gi],['政策',/政策|国务院|发改委|工信部|证监会|监管/gi],
];
const clamp=value=>Math.max(0,Math.min(100,value));

export async function getNewsIntelligence(){
  const db=getPrisma(),now=new Date(),since=new Date(now-24*3600000),previousSince=new Date(now-48*3600000);
  const articles=await db.newsArticle.findMany({where:{publishedAt:{gte:previousSince}},take:1000,orderBy:{publishedAt:'desc'},include:{source:true}});
  const current=articles.filter(x=>new Date(x.publishedAt)>=since),previous=articles.filter(x=>new Date(x.publishedAt)<since);
  const scoreWindow=rows=>KEYWORDS.map(([word,regex])=>{let count=0;const sources=new Set();for(const row of rows){const text=`${row.title} ${row.summary||''} ${row.cleanedContent||''}`;regex.lastIndex=0;const hits=text.match(regex)?.length||0;if(hits){count+=hits;sources.add(row.source?.name||'未知来源');}}return{word,count,sourceCount:sources.size};});
  const before=new Map(scoreWindow(previous).map(x=>[x.word,x.count]));
  const keywords=scoreWindow(current).filter(x=>x.count).map(x=>({...x,previousCount:before.get(x.word)||0,acceleration:x.count-(before.get(x.word)||0)})).sort((a,b)=>b.count-a.count||b.sourceCount-a.sourceCount).slice(0,24);
  const sectors=await getHotSectorRecommendations({limit:8});
  const forecasts=sectors.items.map(item=>{
    const acceleration=keywords.filter(k=>item.name.includes(k.word)||k.word.includes(item.name.split('与')[0])).reduce((sum,k)=>sum+k.acceleration,0);
    const base=item.score,probability=base==null?null:clamp(base*.72+clamp(50+acceleration*5)*.18+item.components.evidence*.1);
    return{...item,nextSessionAttentionProbability:probability==null?null:Number(probability.toFixed(1)),confidence:item.evidenceCompleteness>=.9?'中高':item.evidenceCompleteness>=.75?'中':'低',forecastReason:probability==null?'量价或新闻证据不足，模型不输出概率。':`新闻、情绪、动量、扩散度与多源证据的透明评分为 ${item.score}；热词加速度 ${acceleration>=0?'+':''}${acceleration}。`,invalidationConditions:item.invalidationConditions};
  }).sort((a,b)=>(b.nextSessionAttentionProbability??-1)-(a.nextSessionAttentionProbability??-1));
  return{keywords,sectorForecasts:forecasts,coverage:{currentArticles:current.length,previousArticles:previous.length,sources:new Set(current.map(x=>x.source?.name).filter(Boolean)).size,windowHours:24},model:{id:'news-sector-attention-v1',type:'transparent quantitative ranking',features:['24小时新闻频次','相邻窗口热词加速度','新闻情绪','关联股票动量','上涨扩散度','来源多样性'],target:'下一交易日板块关注度（非收益率）'},asOf:now,disclosure:'概率表示研究关注排序，不是涨跌或收益预测；新闻热度可能在开盘前衰减。'};
}
