import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { authenticate } from './auth.js';
import { HttpError } from './errors.js';
import { createNotifier } from './realtime.js';
import authRoutes from './routes/auth.js';
import addressRoutes from './routes/addresses.js';
import orderRoutes from './routes/orders.js';
import agentRoutes from './routes/agents.js';
import statsRoutes from './routes/stats.js';

export function createApp(db, notifier = createNotifier(null), { staticDir } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  const auth = authenticate(db);
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(db));
  app.use('/api/addresses', auth, addressRoutes(db));
  app.use('/api/orders', auth, orderRoutes(db, notifier));
  app.use('/api/agents', auth, agentRoutes(db, notifier));
  app.use('/api/stats', auth, statsRoutes(db));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // In production the built React app is served from here.
  if (staticDir && fs.existsSync(staticDir)) {
    app.use(express.static(staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on our side' });
  });

  return app;
}
