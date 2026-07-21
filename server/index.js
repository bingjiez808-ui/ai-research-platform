import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { financeRouter } from './finance/routes.js';
import { portfolioRouter } from './finance/portfolio/routes.js';
import { experienceRouter } from './finance/experience/routes.js';
import { marketDashboardRouter } from './finance/market-dashboard.js';
import { startScheduler } from './scheduler/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);

// Prisma maps PostgreSQL BIGINT columns to JavaScript bigint.
// Serialize them as strings to preserve precision in API responses.
app.set('json replacer', (_key, value) => typeof value === 'bigint' ? value.toString() : value);
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use(express.json({ limit: '1mb' }));

app.use('/api', financeRouter);
app.use('/api', portfolioRouter);
app.use('/api', experienceRouter);
app.use('/api', marketDashboardRouter);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-a-share-research', time: new Date().toISOString() });
});

// API errors are explicit. Upstream failures never return mock data.
app.use('/api', (err, req, res, next) => {
  console.error('API error:', { method: req.method, path: req.path, code: err.code, message: err.message });
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    success: false,
    error: { code: err.code || 'INTERNAL_ERROR', message: err.message, provider: err.provider || undefined },
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
});
