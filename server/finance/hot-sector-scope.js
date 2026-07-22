import { getHotSectorRecommendations } from './hot-sectors.js';

const ALIASES={
  '半导体与算力':['半导体','电子','元器件','软件服务','互联网','通信设备','IT设备'],
  '机器人与智能制造':['机器人','工业机械','专用机械','机械基件','电气设备','自动化'],
  '新能源与储能':['电气设备','新能源','电池','光伏','风电','锂电'],
  '汽车与智能驾驶':['汽车整车','汽车配件','汽车零部件','摩托车'],
  '医药生物':['医药商业','化学制药','生物制药','医疗保健','中成药'],
  '消费与零售':['商贸代理','百货','食品饮料','酿酒','家用电器','旅游'],
  '金融与证券':['证券','银行','保险','多元金融'],
  '资源与有色':['有色','黄金','煤炭','石油','矿物制品','钢铁'],
  '国防军工':['航空','航天','船舶','军工','运输设备'],
  '低空经济':['航空','运输设备','通信设备','软件服务'],
};

export function sectorAliases(name){return ALIASES[name]||[name];}
export function stockMatchesSector(stock,sector){const industry=stock.industry?.name||stock.industry||'',codes=new Set((sector.leaders||[]).map(item=>item.code));return codes.has(stock.code)||sectorAliases(sector.name).some(alias=>industry.includes(alias));}
export async function getTopSectorScope(limit=3){
  const hot=await getHotSectorRecommendations({limit:Math.max(limit,5)}),sectors=hot.items.filter(item=>item.score!=null).slice(0,limit),leaderCodes=[...new Set(sectors.flatMap(item=>(item.leaders||[]).map(stock=>stock.code)))],aliases=[...new Set(sectors.flatMap(item=>sectorAliases(item.name)))],where=sectors.length?{OR:[...(leaderCodes.length?[{code:{in:leaderCodes}}]:[]),...aliases.map(name=>({industry:{name:{contains:name}}}))]}:{id:{equals:-1n}};
  return{sectors,where,aliases,leaderCodes,metadata:sectors.map((sector,index)=>({rank:index+1,name:sector.name,score:sector.score,recommendation:sector.recommendation,linkedStocks:sector.metrics?.linkedStocks??0,evidenceCompleteness:sector.evidenceCompleteness}))};
}
