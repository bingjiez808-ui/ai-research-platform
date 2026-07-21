import crypto from 'node:crypto';
import { getPrisma } from '../research/prisma.js';
import { getAllMarketQuotes } from '../market.js';

let active=null;
const market=code=>String(code).startsWith('6')?'SSE':'SZSE';
const tradeDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function run(){
  const db=getPrisma(),quotes=await getAllMarketQuotes();
  if(quotes.length<1000)throw new Error(`Live universe bootstrap received only ${quotes.length} quotes`);
  const source=await db.dataSource.upsert({where:{key:'tencent-live'},create:{key:'tencent-live',name:'腾讯公开行情',kind:'market-data',baseUrl:'https://gu.qq.com/'},update:{enabled:true}});
  await db.stock.createMany({skipDuplicates:true,data:quotes.map(row=>({code:String(row.code),name:row.name,market:market(row.code),exchange:market(row.code),status:'listed',raw:{provider:'tencent-live'}}))});
  const stocks=await db.stock.findMany({where:{code:{in:quotes.map(row=>String(row.code))}},select:{id:true,code:true}}),byCode=new Map(stocks.map(row=>[row.code,row.id])),day=tradeDay(),tradeDate=new Date(`${day}T00:00:00.000Z`);
  const prices=quotes.flatMap(row=>{const stockId=byCode.get(String(row.code));if(!stockId||!(Number(row.price)>0))return[];return[{stockId,tradeDate,interval:'1d',open:row.open,high:row.high,low:row.low,close:row.price,previousClose:row.yestClose,changePercent:row.change,volume:row.volume==null?null:BigInt(Math.trunc(Number(row.volume)*100)),turnover:row.turnover,turnoverRate:row.turnoverRate,marketCap:row.marketCap,pe:row.pe,pb:row.pb,sourceId:source.id,providerKey:`${row.code}:${day}`,sourceUrl:`https://gu.qq.com/${market(row.code)==='SSE'?'sh':'sz'}${row.code}`,payloadHash:hash(row),raw:row}];});
  await db.stockPrice.createMany({skipDuplicates:true,data:prices});
  return{universe:stocks.length,prices:prices.length,tradeDate:day,source:'tencent-live'};
}
export function bootstrapLiveUniverse(){if(!active)active=run().finally(()=>{active=null;});return active;}
