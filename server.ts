import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  buildSignedGetHeaders,
  buildSignedPostHeaders,
  loadSigningKey,
} from './src/utils/exnessSigner.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // ==================== REAL EXNESS API PROXY ROUTES ====================
  // Avoids browser CORS and keeps Ed25519 private key securely signed

  // 1. Verify Test Vector RFC 8032
  app.post('/api/exness/test-sign', (req, res) => {
    try {
      const privateKeyHex =
        '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
      const apiKey = 'exnsk-synthetic-example';
      const timestamp = 1773656070123;
      const pathWithQuery = '/v1/trading/access-point?account_id=123456';

      const headers = buildSignedGetHeaders(apiKey, privateKeyHex, pathWithQuery, timestamp);
      return res.json({
        success: true,
        headers,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Discover Access Point on Gateway
  app.post('/api/exness/discover', async (req, res) => {
    const { apiKey, privateKey, accountId, discoveryBaseUrl } = req.body;

    if (!apiKey || !privateKey || !accountId || !discoveryBaseUrl) {
      return res.status(400).json({
        error: 'Faltan parámetros requeridos: apiKey, privateKey, accountId, discoveryBaseUrl',
      });
    }

    try {
      // Validate accountId is positive uint64
      if (!/^[1-9][0-9]*$/.test(accountId)) {
        return res.status(400).json({ error: 'EXN_ACCOUNT_ID debe ser un número entero positivo.' });
      }

      const pathWithQuery = `/v1/trading/access-point?account_id=${accountId}`;
      const signedHeaders = buildSignedGetHeaders(apiKey, privateKey, pathWithQuery);

      // Check if synthetic test gateway
      if (discoveryBaseUrl.includes('gateway.example') || apiKey.includes('synthetic')) {
        return res.json({
          success: true,
          isSimulation: true,
          access_point: 'https://ap-eu1.exness.gateway',
          message: 'Firma Ed25519 generada correctamente. Simulación exitosa del Access Point.',
          signedHeaders: {
            'EXN-API-KEY': signedHeaders['EXN-API-KEY'],
            'EXN-TIMESTAMP': signedHeaders['EXN-TIMESTAMP'],
            'EXN-DATA': signedHeaders['EXN-DATA'],
            'EXN-SIGN': signedHeaders['EXN-SIGN'],
          },
        });
      }

      // Real HTTPS Request to Exness Gateway
      const cleanGateway = discoveryBaseUrl.replace(/\/$/, '');
      const targetUrl = `${cleanGateway}${pathWithQuery}`;

      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: signedHeaders as unknown as Record<string, string>,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });

      const responseData = await response.json();

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Exness Gateway respondió con código ${response.status}`,
          details: responseData,
        });
      }

      return res.json({
        success: true,
        isSimulation: false,
        access_point: responseData.access_point,
        data: responseData,
      });
    } catch (err: any) {
      return res.status(502).json({
        error: `Error de red al conectar con el Gateway de Exness (${discoveryBaseUrl}): ${err.message}`,
        hint: 'Verifica que la URL del Gateway sea accesible y que el par de claves Ed25519 sea válido.',
      });
    }
  });

  // 3. Read Account Details from Access Point
  app.post('/api/exness/account', async (req, res) => {
    const { apiKey, privateKey, accountId, accessPoint } = req.body;

    if (!apiKey || !privateKey || !accountId || !accessPoint) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    try {
      const pathWithQuery = `/v1/configuration/accounts/${accountId}/account`;
      const signedHeaders = buildSignedGetHeaders(apiKey, privateKey, pathWithQuery);

      if (accessPoint.includes('.example') || accessPoint.includes('.gateway')) {
        return res.json({
          success: true,
          isSimulation: true,
          account: {
            account_id: accountId,
            currency: 'USD',
            balance: '12450.00',
            equity: '12720.50',
            free_margin: '12350.00',
            leverage: '1:2000',
            status: 'active',
          },
        });
      }

      const cleanAp = accessPoint.replace(/\/$/, '');
      const response = await fetch(`${cleanAp}${pathWithQuery}`, {
        method: 'GET',
        headers: signedHeaders as unknown as Record<string, string>,
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });

      const responseData = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Exness Access Point respondió con error ${response.status}`,
          details: responseData,
        });
      }

      return res.json({
        success: true,
        account: responseData,
      });
    } catch (err: any) {
      return res.status(502).json({
        error: `Error al leer detalles de cuenta Exness: ${err.message}`,
      });
    }
  });

  // 4. Place New Order / Position on Access Point
  app.post('/api/exness/positions', async (req, res) => {
    const { apiKey, privateKey, accountId, accessPoint, instrument, side, volume } = req.body;

    if (!apiKey || !privateKey || !accountId || !accessPoint || !instrument || !side || !volume) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos para la orden.' });
    }

    try {
      const idempotencyKey = `ord-${Date.now()}`;
      const pathWithQuery = `/v1/trading/accounts/${accountId}/positions`;
      const bodyObj = {
        instrument,
        side: String(side).toLowerCase(),
        volume: Number(volume),
      };

      const signedHeaders = buildSignedPostHeaders(
        apiKey,
        privateKey,
        pathWithQuery,
        bodyObj,
        idempotencyKey
      );

      if (accessPoint.includes('.example') || accessPoint.includes('.gateway')) {
        return res.json({
          status: 'confirmed',
          operation_id: `op_${Date.now()}`,
          client_request_id: idempotencyKey,
          instrument,
          side,
          volume,
          isSimulation: true,
        });
      }

      const cleanAp = accessPoint.replace(/\/$/, '');
      const response = await fetch(`${cleanAp}${pathWithQuery}`, {
        method: 'POST',
        headers: {
          ...(signedHeaders as unknown as Record<string, string>),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(bodyObj),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });

      const responseData = await response.json();
      return res.status(response.status).json(responseData);
    } catch (err: any) {
      return res.status(502).json({ error: `Error al emitir orden en Exness: ${err.message}` });
    }
  });

  // ==================== VITE MIDDLEWARE (DEV) / STATIC (PROD) ====================
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
