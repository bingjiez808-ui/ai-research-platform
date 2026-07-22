import crypto from 'crypto';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';
import { fetchCninfoAnnouncements } from './cninfo.js';

const UA=process.env.FINANCE_USER_AGENT||'Mozilla/5.0 (compatible; ARGUS-A-Share-Research/1.0)';
const timeout=()=>Number(process.env.NEWS_HTTP_TIMEOUT_MS||20000);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const value=(row,keys)=>keys.map(key=>row[key]).find(item=>item!==undefined&&item!==null&&item!=='');
const toDate=input=>{if(input==null)return null;const numeric=Number(input);const date=Number.isFinite(numeric)&&String(input).length>=10?new Date(numeric<1e12?numeric*1000:numeric):new Date(input);return Number.isNaN(date.getTime())?null:date;};
const clean=text=>String(text||'').replace(/<[^>]+>/g,' ').replace(/&(?:nbsp|amp|lt|gt);/g,' ').replace(/\s+/g,' ').trim();

export function clsSignature(params){const query=Object.keys(params).sort().map(key=>`${key}=${params[key]}`).join('&');return crypto.createHash('md5').update(crypto.createHash('sha1').update(query).digest('hex')).digest('hex');}

export async function fetchClsTelegraph({size=50,requester=axios.get}={}){
  const params={appName:'CailianpressWeb',os:'web',sv:'7.7.5',last_time:'',refresh_type:'1',rn:String(size)};
  const sign=clsSignature(params),query=new URLSearchParams({...params,sign}).toString();
  const {data}=await requester(`https://www.cls.cn/v1/roll/get_roll_list?${query}`,{timeout:timeout(),headers:{'User-Agent':UA,Referer:'https://www.cls.cn/'}});
  return (data?.data?.roll_data||[]).map(item=>({id:item.id||item.telegraph_id,title:clean(item.title||item.brief||item.content),summary:clean(item.brief||item.content).slice(0,500),content:clean(item.content||item.brief),publish_time:item.ctime,url:item.shareurl||item.url||'https://www.cls.cn/telegraph',raw:item})).filter(item=>item.title&&item.publish_time);
}

export async function fetchSinaFinancialNews({size=50,requester=axios.get}={}){
  const {data}=await requester('https://zhibo.sina.com.cn/api/zhibo/feed',{params:{zhibo_id:'152',page_size:String(size),dire:'f'},timeout:timeout(),headers:{'User-Agent':UA,Referer:'https://finance.sina.com.cn/7x24/'}});
  const rows=data?.result?.data?.feed?.list||data?.result?.data?.feed||data?.result?.data||data?.data?.list||[];
  return (Array.isArray(rows)?rows:[]).map(item=>{const ext=typeof item.ext==='string'?(()=>{try{return JSON.parse(item.ext);}catch{return {};}})():item.ext||{};const stocks=ext.stocks||item.stocks||[];const code=String(value(stocks[0]||{},['code','symbol','stock_code'])||'').replace(/^(?:sh|sz|bj)/i,'').match(/\d{6}/)?.[0];return{id:item.id||item.docid,title:clean(item.title||item.rich_text||item.content),summary:clean(item.content||item.rich_text).slice(0,500),content:clean(item.content||item.rich_text),publish_time:item.create_time||item.ctime||item.update_time,url:item.url||item.link||'https://finance.sina.com.cn/7x24/',stockCode:code,raw:item};}).filter(item=>item.title&&item.publish_time);
}

async function upsertSource(db,key,name,baseUrl){return db.dataSource.upsert({where:{key},create:{key,name,baseUrl,kind:'news'},update:{name,baseUrl,enabled:true}});}
async function persist(db,source,rows){
  let written=0;const codes=[...new Set(rows.map(row=>String(value(row,['stockCode','证券代码','code'])||'').match(/\d{6}/)?.[0]).filter(Boolean))],stocks=codes.length?await db.stock.findMany({where:{code:{in:codes}},select:{id:true,code:true}}):[],stockIds=new Map(stocks.map(stock=>[stock.code,stock.id]));
  for(const row of rows){const title=clean(value(row,['标题','title','content','内容'])),url=value(row,['链接','url','link']),publishedAt=toDate(value(row,['发布时间','时间','publish_time','ctime','date']));if(!title||!publishedAt)continue;const providerKey=String(value(row,['id','article_id','链接','url'])||hash([title,publishedAt])),canonicalKey=`${source.key}:${providerKey}`,code=String(value(row,['stockCode','证券代码','code'])||'').match(/\d{6}/)?.[0],stockId=stockIds.get(code)||null,summary=clean(value(row,['摘要','summary'])),content=clean(value(row,['内容','content']));await db.newsArticle.upsert({where:{canonicalKey},create:{canonicalKey,stockId,title,summary:summary||null,content:content||null,category:'financial-news',publishedAt,url,sourceId:source.id,providerKey,payloadHash:hash(row),raw:row.raw||row},update:{stockId:stockId||undefined,title,summary:summary||null,content:content||null,publishedAt,url,fetchedAt:new Date(),payloadHash:hash(row),raw:row.raw||row}});written++;}
  return written;
}

async function collectOne(db,{key,name,url,fetcher}){try{const rows=await fetcher(),source=await upsertSource(db,key,name,url);return{provider:key,read:rows.length,written:await persist(db,source,rows),status:'live'};}catch(error){return{provider:key,read:0,written:0,status:'degraded',error:error.message};}}

export async function collectLicensedNews(){
  const db=getPrisma(),size=Math.min(100,Math.max(10,Number(process.env.FREE_NEWS_PAGE_SIZE||50))),sources=[];
  if(process.env.CLS_FREE_NEWS_ENABLED!=='false')sources.push({key:'cls-telegraph',name:'财联社免费电报',url:'https://www.cls.cn/',fetcher:()=>fetchClsTelegraph({size})});
  if(process.env.SINA_FREE_NEWS_ENABLED!=='false')sources.push({key:'sina-7x24',name:'新浪财经 7×24',url:'https://finance.sina.com.cn/7x24/',fetcher:()=>fetchSinaFinancialNews({size})});
  if(process.env.CNINFO_ENABLED!=='false')sources.push({key:'cninfo-announcements',name:'巨潮资讯公告',url:'https://www.cninfo.com.cn/',fetcher:()=>fetchCninfoAnnouncements({size,days:Number(process.env.CNINFO_LOOKBACK_DAYS||7)})});
  const results=[];for(const source of sources)results.push(await collectOne(db,source));
  if(process.env.AKSHARE_WORKER_URL){for(const [path,key,name,url] of [['/v1/news/eastmoney','eastmoney-news','东方财富新闻','https://finance.eastmoney.com/'],['/v1/news/sina','sina-news','新浪财经','https://finance.sina.com.cn/']])results.push(await collectOne(db,{key,name,url,fetcher:async()=>{const {data}=await axios.get(`${process.env.AKSHARE_WORKER_URL}${path}`,{timeout:Number(process.env.AKSHARE_TIMEOUT_MS||60000)});return data.data||[];}}));}
  if(process.env.CLS_API_URL&&process.env.CLS_API_KEY)results.push(await collectOne(db,{key:'cls-licensed',name:'财联社授权 API',url:'https://www.cls.cn/',fetcher:async()=>{const {data}=await axios.get(process.env.CLS_API_URL,{headers:{Authorization:`Bearer ${process.env.CLS_API_KEY}`},timeout:30000});return data.data||data.items||[];}}));
  const live=results.filter(result=>result.status==='live').length;return{results,status:live===results.length?'live':live?'degraded':'unavailable',coverage:{configured:results.length,live,written:results.reduce((sum,result)=>sum+result.written,0)},cninfoEnabled:process.env.CNINFO_ENABLED!=='false',freeSources:['财联社免费电报','新浪财经 7×24','巨潮资讯公告'],akshareConfigured:Boolean(process.env.AKSHARE_WORKER_URL)};
}
