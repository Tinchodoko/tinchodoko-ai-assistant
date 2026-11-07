import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { ExnessTraderClient } from './src/exness/client.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ExnessRequest = {
  apiKey?: string;
  privateKey?: string;
  accountId?: string;
  discoveryBaseUrl?: string;
};

function credentialsFrom(body: ExnessRequest) {
  const apiKey = body.apiKey?.trim();
  const privateKey = body.privateKey?.trim();
  const accountId = body.accountId?.trim();
  const discoveryBaseUrl = body.discoveryBaseUrl?.trim();

  if (!apiKey || !privateKey || !accountId || !discoveryBaseUrl) {
    throw new Error('Required: apiKey, privateKey, accountId and discoveryBaseUrl');
  }

  const gateway = new URL(discoveryBaseUrl);
  if (
    gateway.protocol !== 'https:' ||
    !['api.exness.com', 'api.exness-api.com'].includes(gateway.hostname) ||
    gateway.pathname !== '/' ||
    gateway.search ||
    gateway.hash ||
    gateway.username ||
    gateway.password
  ) {
    throw new Error('Gateway must be https://api.exness.com or https://api.exness-api.com');
  }

  return { apiKey, privateKey, accountId, discoveryBaseUrl };
}

function safeError(error: unknown): string {
  // Never serialize request objects, headers, or credentials into API responses.
  return error instanceof Error ? error.message.slice(0, 240) : 'Unexpected error';
}

async function startServer(): Promise<void> {
  const app = express();
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const requests = new Map<string, { count: number; resetAt: number }>();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  // Small per-instance abuse guard. Credentials are processed in memory only.
  app.use('/api/', (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const current = requests.get(key);
    if (!current || current.resetAt <= now) {
      requests.set(key, { count: 1, resetAt: now + 60_000 });
      return next();
    }
    current.count += 1;
    if (current.count > 20) {
      return res.status(429).json({ success: false, error: 'Rate limit exceeded. Try again in one minute.' });
    }
    return next();
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'tinchodoko-exness-readonly' }));

  app.post('/api/exness/connect', async (req, res) => {
    try {
      const client = new ExnessTraderClient(credentialsFrom(req.body));
      const result = await client.connect();
      return res.json({
        success: true,
        access_point: result.accessPoint,
        account: result.account,
      });
    } catch (error) {
      return res.status(502).json({ success: false, error: safeError(error) });
    }
  });

  // There are intentionally no order-placement or order-modification routes.
  // Position retrieval will be added only after its exact official endpoint/schema
  // is verified against Exness documentation.

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Tinchodoko read-only backend listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', safeError(error));
  process.exit(1);
});
