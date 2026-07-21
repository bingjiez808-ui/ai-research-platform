import axios from 'axios';

const http=axios.create({timeout:Number(process.env.FINANCE_HTTP_TIMEOUT_MS||20000),headers:{'User-Agent':'Mozilla/5.0'}});
const numeric=value=>{if(value==null||value===''||value==='--')return null;const n=Number(String(value).replaceAll(',',''));return Number.isFinite(n)?n:null;};
const pick=(row,patterns)=>{for(const [key,value] of Object.entries(row))if(patterns.some(pattern=>pattern.test(key))){const n=numeric(value);if(n!=null)return n;}return null;};

async function report(code,source){
  const paperCode=`${String(code).startsWith('6')?'sh':'sz'}${code}`;
  const {data}=await http.get('https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022',{params:{paperCode,source,type:'0',page:'1',num:'8'}});
  const list=data?.result?.data?.report_list||{};
  return Object.keys(list).sort().reverse().slice(0,8).map(period=>{const row={periodEnd:`${period.slice(0,4)}-${period.slice(4,6)}-${period.slice(6,8)}`};for(const item of list[period]?.data||[])if(item.item_title&&item.item_value!=null)row[item.item_title]=item.item_value;return row;});
}

export async function getSinaFinancials(code){
  const [income,balance,cash]=await Promise.all([report(code,'lrb'),report(code,'fzb'),report(code,'llb')]),periods=new Map();
  for(const row of [...income,...balance,...cash])periods.set(row.periodEnd,{...(periods.get(row.periodEnd)||{}),...row});
  return [...periods.values()].sort((a,b)=>b.periodEnd.localeCompare(a.periodEnd)).map(row=>({periodEnd:row.periodEnd,revenue:pick(row,[/^营业总收入$/, /^营业收入$/]),netProfit:pick(row,[/^归属于母公司所有者的净利润$/, /^归母净利润$/, /^净利润$/]),totalAssets:pick(row,[/^资产总计$/]),totalEquity:pick(row,[/^所有者权益.*合计$/, /^股东权益.*合计$/]),totalLiabilities:pick(row,[/^负债合计$/]),operatingCashFlow:pick(row,[/^经营活动产生的现金流量净额$/]),source:{name:'新浪财经财报三表'},sourceUrl:`https://finance.sina.com.cn/realstock/company/${code.startsWith('6')?'sh':'sz'}${code}/nc.shtml`}));
}
