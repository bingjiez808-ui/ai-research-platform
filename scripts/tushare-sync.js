import { ingestTushareBasic, ingestTushareDaily, ingestTushareFinancials, ingestTushareTopList } from '../server/finance/providers/ingest-tushare.js';
import { getPrisma } from '../server/research/prisma.js';
const [job,arg]=process.argv.slice(2); let result;
try{if(job==='basic')result=await ingestTushareBasic();else if(job==='daily')result=await ingestTushareDaily(arg);else if(job==='financials')result=await ingestTushareFinancials(arg);else if(job==='top-list')result=await ingestTushareTopList(arg);else throw new Error('Usage: tushare-sync <basic|daily YYYYMMDD|financials 000001.SZ|top-list YYYYMMDD>');console.log(JSON.stringify(result,null,2));}finally{await getPrisma().$disconnect();}
