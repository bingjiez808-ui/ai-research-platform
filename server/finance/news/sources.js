import crypto from 'crypto';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';
import { fetchCninfoAnnouncements } from './cninfo.js';

const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const value = (row, keys) => keys.map(k => row[k]).find(v => v !== undefined && v !== null && v !== '');
const toDate = input => { const date=new Date(input); return Number.isNaN(date.getTime())?null:date; };

async function upsertSource(db,key,name,baseUrl){return db.dataSource.upsert({where:{key},create:{key,name,baseUrl,kind:'news'},update:{name,baseUrl,enabled:true}});}
async function persist(db,source,rows){let written=0;for(const row of rows){const title=String(value(row,['标题','title','content','内容'])||'').trim();const url=value(row,['链接','url','link']);const publishedAt=toDate(value(row,['发布时间','时间','publish_time','ctime','date']));if(!title||!publishedAt)continue;const providerKey=String(value(row,['id','article_id','链接','url'])||hash([title,publishedAt]));const canonicalKey=`${source.key}:${providerKey}`;await db.newsArticle.upsert({where:{canonicalKey},create:{canonicalKey,title,summary:value(row,['摘要','summary']),content:value(row,['内容','content']),category:'financial-news',publishedAt,url,sourceId:source.id,providerKey,payloadHash:hash(row),raw:row},update:{title,summary:value(row,['摘要','summary']),content:value(row,['内容','content']),publishedAt,url,fetchedAt:new Date(),payloadHash:hash(row),raw:row}});written++;}return written;}

export async function collectLicensedNews(){
  const db=getPrisma();const results=[];
  if(process.env.CNINFO_ENABLED!=='false'){try{const rows=await fetchCninfoAnnouncements({size:Number(process.env.CNINFO_PAGE_SIZE||50),days:Number(process.env.CNINFO_LOOKBACK_DAYS||7)}),source=await upsertSource(db,'cninfo-announcements','巨潮资讯公告','https://www.cninfo.com.cn/');results.push({provider:'cninfo-announcements',read:rows.length,written:await persist(db,source,rows)});}catch(error){results.push({provider:'cninfo-announcements',read:0,written:0,status:'degraded',error:error.message});}}
  if(process.env.AKSHARE_WORKER_URL){for(const [path,key,name,url] of [['/v1/news/eastmoney','eastmoney-news','东方财富新闻','https://finance.eastmoney.com/'],['/v1/news/sina','sina-news','新浪财经','https://finance.sina.com.cn/']]){const {data}=await axios.get(`${process.env.AKSHARE_WORKER_URL}${path}`,{timeout:Number(process.env.AKSHARE_TIMEOUT_MS||60000)});const source=await upsertSource(db,key,name,url);results.push({provider:key,read:data.data?.length||0,written:await persist(db,source,data.data||[])});}}
  if(process.env.CLS_API_URL&&process.env.CLS_API_KEY){const {data}=await axios.get(process.env.CLS_API_URL,{headers:{Authorization:`Bearer ${process.env.CLS_API_KEY}`},timeout:30000});const source=await upsertSource(db,'cls-licensed','财联社授权API','https://www.cls.cn/');const rows=data.data||data.items||[];results.push({provider:'cls-licensed',read:rows.length,written:await persist(db,source,rows)});}
  return {results,cninfoEnabled:process.env.CNINFO_ENABLED!=='false',clsConfigured:Boolean(process.env.CLS_API_URL&&process.env.CLS_API_KEY),akshareConfigured:Boolean(process.env.AKSHARE_WORKER_URL)};
}
