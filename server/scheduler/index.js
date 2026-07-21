import cron from 'node-cron';
import { runScheduledJob } from './runner.js';

const timezone=process.env.SCHEDULER_TIMEZONE||'Asia/Shanghai';
const tasks=[
  ['0 8 * * 1-5','trade-calendar-refresh'],
  ['30 9 * * 1-5','market-open'],
  ['30 15 * * 1-5','market-close'],
  ['0 20 * * 1-5','nightly'],
  ['0 2 * * 0','stock-basic-weekly'],
  ['0 3 * * 6','financial-weekly'],
];
export function startScheduler(){ if(process.env.SCHEDULER_ENABLED!=='true') return []; return tasks.map(([expression,name])=>cron.schedule(expression,()=>runScheduledJob(name).catch(error=>console.error('scheduled job failed',{name,message:error.message})),{timezone,noOverlap:true,name})); }
