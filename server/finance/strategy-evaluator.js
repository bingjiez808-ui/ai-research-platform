import { getPrisma } from '../research/prisma.js';

const clamp=value=>Math.max(0,Math.min(100,value));
const number=(value,fallback=null)=>value==null||value===''?fallback:Number(value);
const RULES={
  minRoe:{label:'ROE 下限',field:'roe',mode:'min'},maxPe:{label:'PE 上限',field:'pe',mode:'max'},maxPb:{label:'PB 上限',field:'pb',mode:'max'},
  minMarketCapYi:{label:'总市值下限（亿元）',field:'marketCapYi',mode:'min'},maxMarketCapYi:{label:'总市值上限（亿元）',field:'marketCapYi',mode:'max'},
  minChangePercent:{label:'当日涨幅下限',field:'changePercent',mode:'min'},maxChangePercent:{label:'当日涨幅上限',field:'changePercent',mode:'max'},minTurnoverRate:{label:'换手率下限',field:'turnoverRate',mode:'min'},
};

export function normalizeStrategy(input={}){const rules={};for(const key of Object.keys(RULES)){const value=number(input.rules?.[key]??input[key]);if(Number.isFinite(value))rules[key]=value;}const industries=[...new Set((input.industries||[]).map(String).map(x=>x.trim()).filter(Boolean))].slice(0,20);return{name:String(input.name||'我的选股策略').trim().slice(0,80),rules,industries,limit:Math.min(30,Math.max(1,Number(input.limit)||10))};}

function evaluate(stock,strategy){
  const p=stock.prices[0],f=stock.statements[0],marketCap=number(p?.marketCap),values={roe:number(f?.roe),pe:number(p?.pe),pb:number(p?.pb),marketCapYi:marketCap==null?null:marketCap/1e8,changePercent:number(p?.changePercent),turnoverRate:number(p?.turnoverRate)},gaps=[];
  let sum=0,weight=0;
  for(const [key,target] of Object.entries(strategy.rules)){const def=RULES[key],actual=values[def.field];weight++;if(!Number.isFinite(actual)){gaps.push({rule:key,label:def.label,target,actual:null,status:'missing',gap:null});continue;}const pass=def.mode==='min'?actual>=target:actual<=target,den=Math.max(Math.abs(target),1),distance=pass?0:Math.abs(actual-target)/den,score=clamp(100-distance*100);sum+=score;gaps.push({rule:key,label:def.label,target,actual:Number(actual.toFixed(2)),status:pass?'pass':'near',gap:Number(Math.abs(actual-target).toFixed(2))});}
  if(strategy.industries.length){weight++;const pass=strategy.industries.some(x=>stock.industry?.name?.includes(x));sum+=pass?100:0;gaps.push({rule:'industries',label:'行业范围',target:strategy.industries.join('、'),actual:stock.industry?.name||null,status:pass?'pass':'near',gap:null});}
  const completeness=weight?gaps.filter(x=>x.status!=='missing').length/weight:0,match=weight?sum/weight*completeness:0;
  return{code:stock.code,name:stock.name,industry:stock.industry?.name||'未分类',matchScore:Number(match.toFixed(1)),evidenceCompleteness:Number(completeness.toFixed(2)),quote:{close:number(p?.close),changePercent:values.changePercent,pe:values.pe,pb:values.pb,marketCapYi:Number.isFinite(values.marketCapYi)?Number(values.marketCapYi.toFixed(2)):null,turnoverRate:values.turnoverRate,asOf:p?.tradeDate,source:p?.source?.name},fundamentals:{roe:values.roe,periodEnd:f?.periodEnd,source:f?.source?.name},gaps:gaps.sort((a,b)=>({near:0,missing:1,pass:2}[a.status]-({near:0,missing:1,pass:2}[b.status])))};
}

export async function evaluateStrategy(input){
  const strategy=normalizeStrategy(input);if(!Object.keys(strategy.rules).length&&!strategy.industries.length)throw Object.assign(new Error('至少设置一条选股规则或行业范围'),{status:400,code:'STRATEGY_RULE_REQUIRED'});
  const stocks=await getPrisma().stock.findMany({where:{status:'listed',prices:{some:{interval:'1d'}}},take:6000,include:{industry:true,prices:{where:{interval:'1d'},take:1,orderBy:{tradeDate:'desc'},include:{source:true}},statements:{take:1,orderBy:{periodEnd:'desc'},include:{source:true}}}});
  const ranked=stocks.map(x=>evaluate(x,strategy)).sort((a,b)=>b.matchScore-a.matchScore),items=ranked.slice(0,strategy.limit),missing=items.flatMap(x=>x.gaps.filter(g=>g.status==='missing').map(g=>g.label));
  const suggestions=[];if(missing.length)suggestions.push(`Top 候选仍有 ${new Set(missing).size} 类字段缺失；建议补齐财务和估值后再提高门槛。`);if(items[0]?.matchScore<70)suggestions.push('当前规则与可用股票匹配度偏低，可适度放宽差距最大的条件。');if(!suggestions.length)suggestions.push('当前规则区分度有效；建议保留前 10 名并用次日价格与公告做人工复核。');
  return{strategy,items,optimization:{suggestions,method:'按规则距离、数据完整度排序；不修改用户硬约束，不执行用户代码。'},coverage:{listedWithPrice:stocks.length,evaluated:ranked.length,returned:items.length},asOf:new Date(),disclosure:'候选仅表示最接近用户规则，不是买入建议；接口不承诺次日表现。'};
}
