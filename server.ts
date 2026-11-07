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
  accessPoint?: string;
};

function credentialsFrom(body: ExnessRequest): {
  apiKey: string;
  privateKey: string;
  accountId: string;
  discoveryBaseUrl: string;
} {
  const apiKey = body.apiKey?.trim();
  const privateKey = body.privateKey?.trim();
  const accountId = body.accountId?.trim();
  const discoveryBaseUrl = body.discoveryBaseUrl?.trim();

  if (!apiKey || !privateKey || !accountId || !discoveryBaseUrl) {
    throw new Error(
      'Required: apiKey, privateKey, accountId and discoveryBaseUrl',
    );
  }

  return { apiKey, privateKey, accountId, discoveryBaseUrl };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

async function startServer(): Promise<void> {
  const app = express();
  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '32kb' }));

  // Exness Trader API: read-only connection flow.
  // Private keys stay on the server and are never returned to the browser.
  app.post('/api/exness/discover', async (req, res) => {
    try {
      const client = new ExnessTraderClient(credentialsFrom(req.body));
      const accessPoint = await client.discoverAccessPoint();
      return res.json({ success: true, access_point: accessPoint });
    } catch (error) {
      return res.status(502).json({ success: false, error: errorMessage(error) });
    }
  });

  app.post('/api/exness/account', async (req, res) => {
    try {
      const credentials = credentialsFrom(req.body);
      const client = new ExnessTraderClient(credentials);

      const accessPoint = req.body.accessPoint?.trim();
      const resolvedAccessPoint = accessPoint
        ? accessPoint
        : await client.discoverAccessPoint();

      const account = await client.getAccount(resolvedAccessPoint);

      return res.json({
        success: true,
        access_point: resolvedAccessPoint,
        account,
      });
    } catch (error) {
      return res.status(502).json({ success: false, error: errorMessage(error) });
    }
  });

  // Trading execution is intentionally disabled in this clean rebuild.
  // It will only be enabled after the read-only connection is validated end-to-end.
  app.post('/api/exness/positions', (_req, res) => {
    return res.status(403).json({
      success: false,
      error: 'Trading execution is disabled. This build is read-only.',
    });
  });

  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', errorMessage(error));
  process.exit(1);
});
