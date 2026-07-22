import { collectMajorEvents } from '../events/collector.js';
import { processNews } from './pipeline.js';
import { collectLicensedNews } from './sources.js';

let running=false;

export async function refreshFreeDashboardData(){
  if(running)return{skipped:true,reason:'refresh-already-running'};
  running=true;
  try{
    const collection=await collectLicensedNews();
    const news=await processNews({limit:Number(process.env.FREE_NEWS_PROCESS_LIMIT||300)});
    const majorEvents=await collectMajorEvents();
    return{collection,news,majorEvents:{status:majorEvents.status,coverage:majorEvents.coverage}};
  }finally{running=false;}
}

export function startFreeDashboardRefresh(){
  if(process.env.FREE_DASHBOARD_REFRESH_ENABLED==='false')return null;
  const refresh=()=>refreshFreeDashboardData().then(result=>console.log('Free dashboard data refreshed',result)).catch(error=>console.error('Free dashboard refresh failed',{message:error.message}));
  const initial=setTimeout(refresh,Number(process.env.FREE_DASHBOARD_INITIAL_DELAY_MS||12000));
  const timer=setInterval(refresh,Math.max(300000,Number(process.env.FREE_DASHBOARD_REFRESH_MS||900000)));
  initial.unref?.();timer.unref?.();
  return{initial,timer};
}
