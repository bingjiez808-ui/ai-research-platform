import { startScheduler } from '../server/scheduler/index.js';
if (process.env.SCHEDULER_ENABLED !== 'true') throw new Error('SCHEDULER_ENABLED=true is required');
const tasks=startScheduler(); console.log(`Scheduler daemon started with ${tasks.length} jobs`);
const stop=()=>{for(const task of tasks) task.stop();process.exit(0);}; process.on('SIGTERM',stop);process.on('SIGINT',stop);
