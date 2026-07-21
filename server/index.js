import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { financeRouter } from './finance/routes.js';
import { portfolioRouter } from './finance/portfolio/routes.js';
import { experienceRouter } from './finance/experience/routes.js';
import { marketDashboardRouter } from './finance/market-dashboard.js';
import { dailyAgentRouter } from './finance/daily-agent/routes.js';
import { startScheduler } from './scheduler/index.js';
import { authRouter, sessionMiddleware } from './auth.js';
import { marketScanRouter } from './finance/market-scan.js';
import { dailySummaryRouter } from './finance/daily-summary.js';
import { bootstrapLiveUniverse } from './finance/bootstrap-live-universe.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);

// Prisma maps PostgreSQL BIGINT columns to JavaScript bigint.
// Serialize them as strings to preserve precision in API responses.
app.set('json replacer', (_key, value) => typeof value === 'bigint' ? value.toString() : value);
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(sessionMiddleware);

app.use('/api', authRouter);
app.use('/api', financeRouter);
app.use('/api', portfolioRouter);
app.use('/api', experienceRouter);
app.use('/api', marketDashboardRouter);
app.use('/api', dailyAgentRouter);
app.use('/api', marketScanRouter);
app.use('/api', dailySummaryRouter);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-a-share-research', time: new Date().toISOString() });
});

// API errors are explicit. Upstream failures never return mock data.
app.use('/api', (err, req, res, next) => {
  console.error('API error:', { method: req.method, path: req.path, code: err.code, message: err.message });
  if (res.headersSent) return next(err);
  const status=err.status || 500;
  res.status(status).json({
    success: false,
    error: { code: status >= 500 ? (err.code || 'INTERNAL_ERROR') : (err.code || 'REQUEST_FAILED'), message: status >= 500 ? 'The service could not complete the request' : err.message, provider: err.provider || undefined },
  });
});

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'API endpoint not found' } });
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`AI A-Share Research API listening on http://0.0.0.0:${PORT}`);
  const tasks = startScheduler();
  if (tasks.length) console.log(`Production scheduler started with ${tasks.length} jobs`);
  if(process.env.DATABASE_URL&&process.env.LIVE_UNIVERSE_BOOTSTRAP!=='false')setTimeout(()=>bootstrapLiveUniverse().then(result=>console.log('Live universe bootstrap completed',result)).catch(error=>console.error('Live universe bootstrap failed',{message:error.message})),5000);
});
