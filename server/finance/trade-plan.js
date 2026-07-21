const n=value=>value==null?null:Number(value);
const finite=value=>Number.isFinite(value);
const clamp=value=>Math.max(0,Math.min(100,value));
const round=value=>finite(value)?Number(value.toFixed(2)):null;
const mean=values=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;

function chronological(prices=[]){
  return [...prices].filter(row=>finite(n(row.close))).sort((a,b)=>new Date(a.tradeDate)-new Date(b.tradeDate));
}

export function buildTradePlan(prices=[],score=50,{evidenceSufficient=true}={}){
  const rows=chronological(prices),latest=rows.at(-1),close=n(latest?.close);
  if(!finite(close)||rows.length<20||!evidenceSufficient)return{status:'insufficient-evidence',asOf:latest?.tradeDate||null,observationPrice:round(close),reason:'至少需要20根有效日线及完整证据，当前不生成买卖价格。'};
  const closes=rows.map(row=>n(row.close)),ma=p=>mean(closes.slice(-p)),ma5=ma(5),ma10=ma(10),ma20=ma(20);
  const trueRanges=rows.slice(-15).map((row,index,tail)=>{const high=n(row.high),low=n(row.low),previous=index?n(tail[index-1].close):null;if(!finite(high)||!finite(low))return null;return Math.max(high-low,finite(previous)?Math.abs(high-previous):0,finite(previous)?Math.abs(low-previous):0);}).filter(finite),atr=mean(trueRanges.slice(-14))||close*.025;
  const recent=rows.slice(-20),support=Math.min(...recent.slice(-10).map(row=>n(row.low)).filter(finite)),resistance=Math.max(...recent.map(row=>n(row.high)).filter(finite));
  const trendUp=close>=ma20&&ma5>=ma10&&ma10>=ma20,buyCenter=trendUp?Math.max(ma10,support):Math.min(close,ma20),buyLow=Math.max(support,buyCenter-atr*.35),buyHigh=Math.min(close*1.015,buyCenter+atr*.35),confirmation=Math.max(close,resistance+Math.max(.01,atr*.08)),stop=Math.min(buyLow-atr*.65,ma20-atr*.35),risk=Math.max(.01,buyHigh-stop),target1=Math.max(resistance+atr*.5,confirmation+risk*.75,buyHigh+risk*1.5),target2=Math.max(target1+risk*.75,buyHigh+risk*2.3),riskReward=(target1-buyHigh)/risk;
  const action=!trendUp||score<58?'observe':score>=72&&riskReward>=1.5?'conditional-buy':'wait-confirmation';
  return{status:'ready',action,asOf:latest.tradeDate,observationPrice:round(close),buyZone:{low:round(buyLow),high:round(Math.max(buyLow,buyHigh))},confirmationPrice:round(confirmation),stopLoss:round(stop),sellTargets:[round(target1),round(Math.max(target1,target2))],riskReward:round(riskReward),holdingPeriod:'1–20个交易日',positionGuidance:action==='conditional-buy'?'首次确认仓位20%–30%，单票风险不超过账户1%':'未触发确认前保持观察',conditions:[`收盘站稳确认价 ${round(confirmation)} 且成交量不弱于5日均量`,`回踩买入区间 ${round(buyLow)}–${round(Math.max(buyLow,buyHigh))} 后出现止跌确认`,`跌破 ${round(stop)} 或重大负面公告则计划失效`],metrics:{ma5:round(ma5),ma10:round(ma10),ma20:round(ma20),atr14:round(atr),support:round(support),resistance:round(resistance)},disclosure:'价格为基于历史波动的条件研究计划，不是保证成交或收益的个性化投资指令。'};
}

export function decisionLabel(action){return({
  'conditional-buy':'条件买入','wait-confirmation':'等待确认',observe:'观察','consider-buy':'条件买入','consider-reduce':'考虑减仓','hold-and-observe':'持有观察','research-candidate':'积极观察',watch:'观察',avoid:'回避','avoid-for-now':'暂时回避','insufficient-evidence':'证据不足'
})[action]||'观察';}

export function weightedScore(parts={}){
  const weights={technical:.3,sentiment:.2,market:.2,fundamental:.3},available=Object.entries(weights).filter(([key])=>finite(n(parts[key]))),weight=available.reduce((sum,[,value])=>sum+value,0);
  return weight?clamp(available.reduce((sum,[key,value])=>sum+n(parts[key])*value,0)/weight):null;
}

export function buildRecommendationSummary(parts={},riskScore,plan,{evidenceSufficient=true}={}){
  const composite=weightedScore(parts),stars=value=>finite(value)?Math.max(1,Math.min(5,Math.round(value/20))):null,riskLevel=!finite(n(riskScore))?'不可验证':riskScore>=72?'较低':riskScore>=55?'中等':'较高';
  const reasons=[];
  if(finite(n(parts.technical)))reasons.push(`技术面 ${round(n(parts.technical))} 分：${parts.technical>=70?'均线与趋势结构较强':parts.technical>=55?'趋势处于观察区间':'趋势尚未形成优势'}`);
  if(finite(n(parts.sentiment)))reasons.push(`情绪面 ${round(n(parts.sentiment))} 分：${parts.sentiment>=65?'公告与新闻倾向偏正面':parts.sentiment<45?'负面事件需要重点核验':'消息面多空相对均衡'}`);
  if(finite(n(parts.market)))reasons.push(`市场面 ${round(n(parts.market))} 分：${parts.market>=65?'近期动量相对积极':parts.market<45?'市场环境或个股动量偏弱':'市场条件中性'}`);
  if(finite(n(parts.fundamental)))reasons.push(`基本面 ${round(n(parts.fundamental))} 分：${parts.fundamental>=70?'财务质量支持继续深研':parts.fundamental<50?'财务质量或估值存在压力':'基本面处于中性区间'}`);
  const risks=[];
  if(!evidenceSufficient)risks.push('核心证据覆盖不足，不能形成方向性建议。');
  if(!finite(n(parts.fundamental)))risks.push('财务与估值证据不足，长期持有评级不可验证。');
  if(finite(n(parts.sentiment))&&parts.sentiment<50)risks.push('新闻公告情绪偏弱，需核验减持、处罚、业绩下修等事件。');
  if(finite(n(riskScore))&&riskScore<55)risks.push('近期波动或负面事件使风险评分偏低。');
  if(plan?.status==='ready')risks.push(`跌破 ${plan.stopLoss} 或确认条件失效时应取消计划。`);
  risks.push('行情可能延迟，历史走势与模型评分不代表未来收益。');
  return{buySellRating:evidenceSufficient?stars(composite):null,riskRating:finite(n(riskScore))?Math.max(1,Math.min(5,6-stars(riskScore))):null,riskLevel,longTermRating:evidenceSufficient&&finite(n(parts.fundamental))?stars(n(parts.fundamental)*.7+n(riskScore||50)*.3):null,reasons,risks};
}
