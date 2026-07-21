import cron from 'node-cron';
import { runScheduledJob } from './runner.js';

const timezone=process.env.SCHEDULER_TIMEZONE||'Asia/Shanghai';
const tasks=[
  ['*/15 * * * *','free-news-refresh'],
  ['0 8 * * 1-5','trade-calendar-refresh'],
  ['30 9 * * 1-5','market-open'],
  ['30 15 * * 1-5','market-close'],
  ['0 20 * * 1-5','nightly'],
  ['0 2 * * 0','stock-basic-weekly'],
  ['0 3 * * 6','financial-weekly'],
];
export function startScheduler(){
  if(process.env.SCHEDULER_ENABLED!=='true')return[];
  const scheduled=tasks.map(([expression,name])=>cron.schedule(expression,()=>runScheduledJob(name).catch(error=>console.error('scheduled job failed',{name,message:error.message})),{timezone,noOverlap:true,name}));
  const initial=setTimeout(()=>runScheduledJob('free-news-refresh').catch(error=>console.error('initial free news refresh failed',{message:error.message})),Number(process.env.FREE_DASHBOARD_INITIAL_DELAY_MS||12000));
  initial.unref?.();
  return scheduled;
}
