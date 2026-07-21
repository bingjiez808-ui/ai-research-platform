import { getPrisma } from '../research/prisma.js';

const clamp=value=>Math.max(0,Math.min(100,value));
const THEMES=[
  ['半导体与算力',/半导体|芯片|晶圆|光刻|算力|服务器|数据中心|AI算力/i],
  ['机器人与智能制造',/机器人|人形|自动化|智能制造|减速器|伺服|工业母机/i],
  ['新能源与储能',/新能源|储能|锂电|电池|光伏|风电|充电桩|逆变器/i],
  ['汽车与智能驾驶',/汽车|智能驾驶|自动驾驶|车联网|零部件|新能源汽车/i],
  ['医药生物',/医药|创新药|医疗|生物|疫苗|器械|临床/i],
  ['消费与零售',/消费|零售|食品|饮料|白酒|家电|旅游|免税/i],
  // Avoid bare “证券”: brokerage names in research headlines would otherwise
  // misclassify every covered company as a financial-sector catalyst.
  ['金融与证券',/银行板块|银行股|券商板块|证券板块|保险板块|保险股|金融股|降息|降准|存贷款利率/i],
  ['资源与有色',/黄金|稀土|有色|铜|铝|锂矿|煤炭|石油|天然气/i],
  ['国防军工',/军工|国防|航空|航天|卫星|无人机|船舶/i],
  ['低空经济',/低空|飞行汽车|eVTOL|通航|无人机/i],
];

function rawStockCodes(raw){const ext=typeof raw?.ext==='string'?(()=>{try{return JSON.parse(raw.ext);}catch{return {};}})():raw?.ext||{};return (ext.stocks||raw?.stocks||[]).map(item=>String(item.symbol||item.code||'').match(/^(?:sh|sz)(\d{6})$/i)?.[1]).filter(Boolean);}
export function scoreSector({articles=[],stocks=[]},now=new Date()){
  const sentiments=articles.map(item=>Number(item.sentiment)).filter(Number.isFinite),changes=stocks.map(item=>Number(item.changePercent)).filter(Number.isFinite),sources=new Set(articles.map(item=>item.source?.name).filter(Boolean));
  const recent=articles.filter(item=>now-new Date(item.publishedAt)<=6*3600000).length,avgSentiment=sentiments.length?sentiments.reduce((a,b)=>a+b,0)/sentiments.length:0,avgChange=changes.length?changes.reduce((a,b)=>a+b,0)/changes.length:null,positive=changes.length?changes.filter(value=>value>0).length/changes.length:null;
  const components={news:clamp(articles.length*8+recent*4+sources.size*6),sentiment:clamp(50+avgSentiment*60),momentum:avgChange==null?null:clamp(50+avgChange*6),breadth:positive==null?null:positive*100,evidence:clamp(sources.size*20+Math.min(5,stocks.length)*12)};
  const weights={news:.25,sentiment:.1,momentum:.25,breadth:.25,evidence:.15},available=Object.entries(components).filter(([,value])=>Number.isFinite(value)),weight=available.reduce((sum,[key])=>sum+weights[key],0),score=weight>=.75?available.reduce((sum,[key,value])=>sum+value*weights[key],0)/weight:null;
  return{score:score==null?null:Number(score.toFixed(1)),components,metrics:{newsCount:articles.length,sourceCount:sources.size,linkedStocks:stocks.length,recentSixHours:recent,averageChange:avgChange==null?null:Number(avgChange.toFixed(2)),advanceRatio:positive==null?null:Number(positive.toFixed(3)),averageSentiment:Number(avgSentiment.toFixed(3))},evidenceCompleteness:Number(weight.toFixed(2))};
}

export async function getHotSectorRecommendations({limit=5}={}){
  const db=getPrisma(),since=new Date(Date.now()-24*3600000),articles=await db.newsArticle.findMany({where:{publishedAt:{gte:since}},take:600,orderBy:{publishedAt:'desc'},include:{source:true,stock:{select:{code:true,name:true}}}}),groups=new Map();
  for(const article of articles){const text=`${article.title} ${article.summary||''} ${article.content||''}`;for(const [name,regex] of THEMES){if(!regex.test(text))continue;const group=groups.get(name)||{name,articles:[],codes:new Set()};group.articles.push(article);if(article.stock?.code)group.codes.add(article.stock.code);for(const code of rawStockCodes(article.raw))group.codes.add(code);groups.set(name,group);}}
  const allCodes=[...new Set([...groups.values()].flatMap(group=>[...group.codes]))],stocks=allCodes.length?await db.stock.findMany({where:{code:{in:allCodes}},select:{code:true,name:true,prices:{take:1,orderBy:{tradeDate:'desc'},select:{close:true,changePercent:true,tradeDate:true,source:{select:{name:true}}}}}}):[],byCode=new Map(stocks.map(stock=>[stock.code,stock]));
  const items=[...groups.values()].map(group=>{const linked=[...group.codes].map(code=>byCode.get(code)).filter(Boolean).map(stock=>({code:stock.code,name:stock.name,price:stock.prices[0]?.close==null?null:Number(stock.prices[0].close),changePercent:stock.prices[0]?.changePercent==null?null:Number(stock.prices[0].changePercent),asOf:stock.prices[0]?.tradeDate,source:stock.prices[0]?.source?.name})),scored=scoreSector({articles:group.articles,stocks:linked});return{name:group.name,...scored,recommendation:scored.score==null?'insufficient-evidence':scored.score>=70?'priority-research':scored.score>=60?'watch':'neutral',reason:scored.score==null?'新闻或关联行情覆盖不足，不形成板块推荐。':`24小时新闻 ${scored.metrics.newsCount} 条、${scored.metrics.sourceCount} 个来源，关联 ${scored.metrics.linkedStocks} 只A股，平均涨跌 ${scored.metrics.averageChange??'不可验证'}%。`,leaders:linked.sort((a,b)=>(b.changePercent??-Infinity)-(a.changePercent??-Infinity)).slice(0,5),newsEvidence:group.articles.slice(0,5).map(article=>({id:String(article.id),title:article.title,url:article.url,publishedAt:article.publishedAt,source:article.source?.name,sentiment:article.sentiment==null?null:Number(article.sentiment)})),risks:['新闻热度不等同资金净流入；供应商主题归类为透明关键词代理。','板块分数用于研究排序，不构成买入建议；高开或拥挤时禁止追入。'],invalidationConditions:['关联股票上涨比例低于40%','新增重大负面公告或监管事件','新闻热度下降且领涨股跌破当日关键价位']};}).filter(item=>item.metrics.newsCount>=2).sort((a,b)=>(b.score??-1)-(a.score??-1)).slice(0,limit);
  return{items,coverage:{articlesScanned:articles.length,themesMatched:groups.size,linkedAStocks:stocks.length,windowHours:24,minimumEvidence:'至少2条主题新闻；总分还要求可验证组件权重≥75%'},method:{id:'audited-news-sector-score-v1',components:{news:'25%',sentiment:'10%',momentum:'25%',breadth:'25%',evidence:'15%'},gates:['新闻主题匹配','真实A股代码关联','最新入库行情扩散','多来源证据门槛']},asOf:new Date(),disclosure:'热点板块是多源新闻与关联行情的研究排序，不预测收益、不构成投资建议。'};
}
