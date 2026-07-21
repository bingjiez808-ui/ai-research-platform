import { runScheduledJob } from '../server/scheduler/runner.js';
import { getPrisma } from '../server/research/prisma.js';
const job=process.argv[2]; if(!job) throw new Error('Usage: npm run production:job -- <market-open|market-close|nightly>');
try{console.log(JSON.stringify(await runScheduledJob(job),null,2));}finally{await getPrisma().$disconnect();}
