// backend/src/server.ts
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { Server } from 'http';
import { createRoutes } from './routes';
import { connectDB } from './config';
import path from 'path';

const PORT = Number(process.env.PORT || 8080);

async function main() {
  // 1) Connect to Mongo first
  await connectDB();

  // 2) App
  const app = express();

  // 3) Core middleware
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: '1mb' })); // parse JSON bodies

  // 4) Health
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // 5) Routes (mount everything under /api/v1)
  createRoutes(app);

  // 5.5) Restore functionality for serving static files
  // Serve static files from /public (adjust if your build directory is elsewhere)
  app.use(express.static(path.join(__dirname, '../public')));

  // Serve index.html for the root
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  });

  // Optional: SPA fallback for client-side routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
  });

  // 6) Central error handler (last)
  //   - Don’t leak stack traces to clients
  //   - Ensure all thrown errors get a consistent shape
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = Number(err?.statusCode || err?.status || 500);
    const message = typeof err?.message === 'string' ? err.message : 'Internal Server Error';
    if (status >= 500) {
      // Log server errors
      console.error('[ERROR]', err);
    }
    res.status(status).json({ error: message });
  });

  // 7) Listen + graceful shutdown
  const server: Server = app.listen(PORT, () => {
    console.log(`✅ API listening on http://localhost:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} received: closing server...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    // Force exit if not closed in time
    setTimeout(() => process.exit(1), 5000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('❌ Failed to start server', err);
  process.exit(1);
});
