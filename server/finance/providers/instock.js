const DEFAULT_BASE_URL = 'http://localhost:9988';
const TABLE = 'cn_stock_selection';
const clamp = value => Math.max(0, Math.min(100, value));
const numeric = value => {
  if (value == null || value === '' || value === '-' || value === '--') return null;
  const parsed = Number(String(value).replaceAll(',', '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
};
const first = (row, keys) => keys.map(key => row?.[key]).find(value => value != null && value !== '') ?? null;
const dateText = value => String(value || '').slice(0, 10);

export function unwrapInStockRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.data, payload?.rows, payload?.items, payload?.result?.data, payload?.data?.data]) if (Array.isArray(candidate)) return candidate;
  return [];
}
function point(value, { good, bad }) { if (!Number.isFinite(value)) return null; return clamp(((value - bad) / (good - bad || .001)) * 100); }
function mean(values) { const available = values.filter(Number.isFinite); return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null; }
function flag(row, keys) { const value = first(row, keys); if (value == null) return null; return ['1', 'true', 'yes', '是', 'Y'].includes(String(value).trim()) ? 100 : 35; }

export function normalizeSelectionRow(row) {
  const code=String(first(row,['code','ts_code','stock_code','symbol'])||'').replace(/\D/g,'').slice(0,6),price=numeric(first(row,['new_price','close','price'])),roe=numeric(first(row,['roe_weight','roe'])),roic=numeric(first(row,['roic'])),grossMargin=numeric(first(row,['sale_gpr','gross_margin'])),netMargin=numeric(first(row,['sale_npr','net_margin'])),revenueGrowth=numeric(first(row,['toi_yoy_ratio','income_growthrate_3y','revenue_growth'])),profitGrowth=numeric(first(row,['netprofit_yoy_ratio','deduct_netprofit_growthrate','netprofit_growthrate_3y'])),cashFlow=numeric(first(row,['per_netcash_operate','operate_cash_flow'])),debtRatio=numeric(first(row,['debt_asset_ratio'])),pe=numeric(first(row,['pe9','pe_ttm','pe'])),pb=numeric(first(row,['pbnewmrq','pb'])),peg=numeric(first(row,['ycpeg','peg'])),predictedGrowth=numeric(first(row,['predict_netprofit_ratio','predict_income_ratio'])),changePercent=numeric(first(row,['change_rate','change_percent','pct_chg'])),turnoverRate=numeric(first(row,['turnoverrate','turnover_rate'])),volumeRatio=numeric(first(row,['volume_ratio','vol_ratio'])),holderChange=numeric(first(row,['holdnum_growthrate_3q','holdnum_growthrate_hy']));
  const quality=mean([point(roe,{bad:0,good:20}),point(roic,{bad:0,good:15}),point(grossMargin,{bad:10,good:50}),point(netMargin,{bad:0,good:20}),cashFlow==null?null:cashFlow>0?75:25,point(debtRatio,{bad:80,good:25,invert:true})]);
  const growthValuation=mean([point(revenueGrowth,{bad:-10,good:30}),point(profitGrowth,{bad:-15,good:35}),point(predictedGrowth,{bad:-10,good:30}),point(pe,{bad:80,good:15,invert:true}),point(pb,{bad:10,good:1.5,invert:true}),point(peg,{bad:3,good:.8,invert:true})]);
  const technical=mean([flag(row,['macd_golden_fork']),flag(row,['macd_golden_fork_week']),flag(row,['macd_golden_fork_month']),flag(row,['break_through']),flag(row,['breakup_ma_20days']),flag(row,['long_avg_array']),flag(row,['upper_large_volume']),flag(row,['down_narrow_volume'])]);
  const marketChip=mean([point(turnoverRate,{bad:.2,good:5}),point(volumeRatio,{bad:.5,good:2}),point(changePercent,{bad:-5,good:5}),holderChange==null?null:point(holderChange,{bad:20,good:-15,invert:true}),flag(row,['low_funds_inflow'])]);
  const risk=mean([point(debtRatio,{bad:35,good:80}),changePercent==null?null:clamp(Math.max(0,Math.abs(changePercent)-3)*10),flag(row,['high_funds_outflow']),flag(row,['down_7days'])]);
  const factorScores={quality,growthValuation,technical,marketChip,risk},positive=mean([quality,growthValuation,technical,marketChip]),totalScore=positive==null?null:clamp(positive*.95-(risk??40)*.15+8),evidenceCount=Object.values({roe,roic,grossMargin,netMargin,revenueGrowth,profitGrowth,pe,pb,turnoverRate,volumeRatio}).filter(Number.isFinite).length;
  return {code,name:first(row,['name','stock_name'])||code,date:dateText(first(row,['date','trade_date'])),industry:first(row,['industry']),concept:first(row,['concept']),style:first(row,['style']),quote:{price,changePercent,turnoverRate,volumeRatio,pe,pb},fundamentals:{roe,roic,grossMargin,netMargin,revenueGrowth,profitGrowth,cashFlow,debtRatio,peg,predictedGrowth},factorScores:Object.fromEntries(Object.entries(factorScores).map(([key,value])=>[key,value==null?null:Number(value.toFixed(1))])),totalScore:totalScore==null?null:Number(totalScore.toFixed(1)),evidenceCompleteness:Number((evidenceCount/10).toFixed(2))};
}
function previousDate(date){const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()-1);return next.toISOString().slice(0,10);}
async function fetchJson(url,timeoutMs=12000){const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'AI-Research-Platform/1.0'},signal:AbortSignal.timeout(timeoutMs)});if(!response.ok)throw new Error(`InStock HTTP ${response.status}`);return response.json();}
export async function getInStockSelection({date=new Date().toISOString().slice(0,10),lookback=10,limit=100}={}){
  const baseUrl=String(process.env.INSTOCK_BASE_URL||DEFAULT_BASE_URL).replace(/\/$/,''),safeLimit=Math.min(500,Math.max(1,limit));let cursor=date,lastError=null;
  for(let attempt=0;attempt<=lookback;attempt+=1){try{const url=new URL('/instock/api_data',baseUrl);url.searchParams.set('name',TABLE);url.searchParams.set('date',cursor);const rows=unwrapInStockRows(await fetchJson(url));if(rows.length){const normalized=rows.map(normalizeSelectionRow).filter(item=>item.code),ranked=normalized.filter(item=>item.totalScore!=null).sort((a,b)=>b.totalScore-a.totalScore),fields=['quality','growthValuation','technical','marketChip','risk'];return{status:'live',requestedDate:date,dataDate:cursor,fallbackDays:attempt,items:ranked.slice(0,safeLimit),coverage:{rawRows:rows.length,normalized:normalized.length,scored:ranked.length,averageCompleteness:ranked.length?Number((ranked.reduce((sum,item)=>sum+item.evidenceCompleteness,0)/ranked.length).toFixed(2)):0,factors:Object.fromEntries(fields.map(field=>[field,normalized.filter(item=>item.factorScores[field]!=null).length]))},source:`${baseUrl} · ${TABLE}`};}}catch(error){lastError=error;}cursor=previousDate(cursor);}
  return{status:'unavailable',requestedDate:date,dataDate:null,fallbackDays:lookback,items:[],coverage:{rawRows:0,normalized:0,scored:0,averageCompleteness:0,factors:{}},source:`${baseUrl} · ${TABLE}`,reason:lastError?lastError.message:`最近 ${lookback+1} 个自然日均无记录`};
}
