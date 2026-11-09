
import { createHash, createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { CONFIG } from './config.js';

// ─── TIPOS ───────────────────────────────────────────────────
interface OpenOrderParams {
  instrument:  string;
  direction:   'buy' | 'sell';
  volume:      number;
  stopLoss?:   number;
  takeProfit?: number;
}

// ─── CLAVE ───────────────────────────────────────────────────
function loadPrivateKey(text: string): KeyObject {
  const input = text.trim();

  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const key = createPrivateKey(input);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('Debe ser Ed25519');
    }
    return key;
  }

  const raw = Buffer.from(input, 'hex');

  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw.subarray(0, 32),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  return key;
}

// ─── FIRMA GET (idempotency key vacío) ───────────────────────
function buildGetHeaders(
  apiKey:     string,
  privateKey: KeyObject,
  path:       string,
): Record<string, string> {
  const timestamp = Date.now();

  const bodyHash = createHash('sha256')
    .update(Buffer.alloc(0))
    .digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key:         apiKey,
    idempotency_key: '',
    timestamp,
    sign_version:    1,
    method:          'GET',
    path,
    body_hash:       bodyHash,
  }), 'utf8');

  return {
    'EXN-API-KEY':          apiKey,
    'EXN-IDEMPOTENCY-KEY':  '',
    'EXN-TIMESTAMP':        String(timestamp),
    'EXN-SIGN-VERSION':     '1',
    'EXN-DATA':             payload.toString('base64url'),
    'EXN-SIGN':             sign(null, payload, privateKey).toString('base64url'),
  };
}

// ─── FIRMA POST (con idempotency key) ────────────────────────
function buildPostHeaders(
  apiKey:     string,
  privateKey: KeyObject,
  path:       string,
  body:       string = '',
): Record<string, string> {
  const timestamp = Date.now();

  const idempotencyKey =
    `${timestamp}-${Math.random().toString(36).slice(2)}`;

  const bodyHash = createHash('sha256')
    .update(body ? Buffer.from(body, 'utf8') : Buffer.alloc(0))
    .digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key:         apiKey,
    idempotency_key: idempotencyKey,
    timestamp,
    sign_version:    1,
    method:          'POST',
    path,
    body_hash:       bodyHash,
  }), 'utf8');

  return {
    'Content-Type':         'application/json',
    'Accept':               'application/json',
    'EXN-API-KEY':          apiKey,
    'EXN-IDEMPOTENCY-KEY':  idempotencyKey,
    'EXN-TIMESTAMP':        String(timestamp),
    'EXN-SIGN-VERSION':     '1',
    'EXN-DATA':             payload.toString('base64url'),
    'EXN-SIGN':             sign(null, payload, privateKey).toString('base64url'),
  };
}

// ─── ACCESS POINT ────────────────────────────────────────────
async function getAccessPoint(privateKey: KeyObject): Promise<string> {
  const path =
    `/v1/trading/access-point?account_id=${CONFIG.accountId}`;

  const res = await fetch(CONFIG.gatewayBaseUrl + path, {
    method:   'GET',
    headers:  buildGetHeaders(CONFIG.apiKey, privateKey, path),
    redirect: 'error',
    signal:   AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discovery HTTP ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    access_point?: string;
  };

  if (!data.access_point) {
    throw new Error('Sin access_point');
  }

  return new URL(data.access_point).origin;
}

// ─── CONECTAR Y SUSCRIBIRSE A TRANSACTIONS ───────────────────
async function connectTransactionStream(
  accessPoint: string,
  privateKey:  KeyObject,
): Promise<WebSocket> {
  const wsPath =
    `/v1/server-events/accounts/${CONFIG.accountId}/ws/events`;

  const wsUrl =
    accessPoint.replace(/^https:/, 'wss:') + wsPath;

  const ws = new WebSocket(
    wsUrl,
    'exness-ws-protocol',
    {
      headers:          buildGetHeaders(CONFIG.apiKey, privateKey, wsPath),
      handshakeTimeout: 10000,
    },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout esperando trading_state_snapshot'));
      }, 15000);

      const cleanup = () => {
        clearTimeout(timer);
        ws.off('message', onMessage);
        ws.off('error', onError);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onMessage = (raw: WebSocket.RawData) => {
        let msg: any;

        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        if (msg.event_type === 'trading_state_snapshot') {
          cleanup();
          resolve();
        }
      };

      ws.on('message', onMessage);
      ws.once('error', onError);

      ws.once('open', () => {
        ws.send(JSON.stringify({
          id:        'trade-monitor',
          subscribe: { event: 'transactions' },
        }));
      });
    });

    console.log('✅ WebSocket suscrito a transactions');
    return ws;

  } catch (error) {
    ws.close();
    throw error;
  }
}

// ─── EXTRAER POSITION ID ─────────────────────────────────────
function findPositionId(data: any): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (data.position_id !== undefined) {
    return String(data.position_id);
  }

  for (const value of Object.values(data)) {
    const found = findPositionId(value);

    if (found !== null) {
      return found;
    }
  }

  return null;
}

// ─── ABRIR POSICIÓN ──────────────────────────────────────────
async function openPosition(
  accessPoint: string,
  privateKey:  KeyObject,
  params:      OpenOrderParams,
): Promise<any> {
  const path =
    `/v1/trading/accounts/${CONFIG.accountId}/positions`;

  const bodyObj: Record<string, string> = {
    instrument: params.instrument,
    side:       params.direction,
    volume:     String(params.volume),
  };

  if (params.stopLoss !== undefined) {
    bodyObj.stop_loss_price = String(params.stopLoss);
  }

  if (params.takeProfit !== undefined) {
    bodyObj.take_profit_price = String(params.takeProfit);
  }

  const body = JSON.stringify(bodyObj);

  const headers = buildPostHeaders(
    CONFIG.apiKey,
    privateKey,
    path,
    body,
  );

  const clientRequestId =
    headers['EXN-IDEMPOTENCY-KEY'];

  console.log('\n🔌 Conectando a Exness Server Events...');

  const ws = await connectTransactionStream(
    accessPoint,
    privateKey,
  );

  let operationId: string | undefined;

  let onMsg:
    | ((raw: WebSocket.RawData) => void)
    | undefined;

  const transactionPromise = new Promise<any>((resolve) => {
    onMsg = (raw: WebSocket.RawData) => {
      let msg: any;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.event_type !== 'transaction_event') {
        return;
      }

      const matches =
        msg.client_request_id === clientRequestId ||
        (operationId && String(msg.operation_id) === operationId);

      if (!matches) {
        return;
      }

      resolve(msg);
    };

    ws.on('message', onMsg);
  });

  try {
    console.log('\n📤 Enviando orden...');
    console.log('   Instrumento:', params.instrument);
    console.log('   Dirección  :', params.direction.toUpperCase());
    console.log('   Volumen    :', params.volume);

    if (params.stopLoss !== undefined) {
      console.log('   Stop Loss  :', params.stopLoss);
    }

    if (params.takeProfit !== undefined) {
      console.log('   Take Profit:', params.takeProfit);
    }

    const res = await fetch(accessPoint + path, {
      method:   'POST',
      headers,
      body,
      redirect: 'error',
      signal:   AbortSignal.timeout(15000),
    });

    const responseText = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${responseText}`);
    }

    const ack = JSON.parse(responseText);

    if (
      res.status !== 202 ||
      !ack.operation_id ||
      ack.status !== 'accepted'
    ) {
      throw new Error('ACK inesperado: ' + responseText);
    }

    operationId = String(ack.operation_id);

    console.log('\n✅ ACK ACEPTADO');
    console.log('   Operation ID     :', operationId);
    console.log('   Client Request ID:', clientRequestId);
    console.log('\n⏳ Esperando confirmación de Exness...');

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let transactionEvent: any;

    try {
      transactionEvent = await Promise.race([
        transactionPromise,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(
              new Error('Timeout esperando transaction_event'),
            ),
            20000,
          );
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }

    if (
      transactionEvent.status === 'rejected' ||
      transactionEvent.status === 'failed'
    ) {
      throw new Error(
        `Exness ${transactionEvent.status}: ` +
        JSON.stringify(transactionEvent),
      );
    }

    const positionId =
      findPositionId(transactionEvent.payload?.positions) ??
      findPositionId(transactionEvent.payload?.position) ??
      null;

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║           TRADE OPEN REPORT              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE LA POSICIÓN              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Instrument      : ${params.instrument}`);
    console.log(`  Position ID     : ${positionId ?? 'No disponible'}`);
    console.log(`  Direction       : ${params.direction.toUpperCase()}`);
    console.log(`  Volume          : ${params.volume}`);
    console.log(`  Stop Loss       : ${params.stopLoss ?? 'No configurado'}`);
    console.log(`  Take Profit     : ${params.takeProfit ?? 'No configurado'}`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE EJECUCIÓN                ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Operation ID    : ${operationId}`);
    console.log(`  Client Req ID   : ${clientRequestId}`);
    console.log(`  Final Status    : ${transactionEvent.status}`);
    console.log('╚══════════════════════════════════════════╝\n');

    return {
      operation_id:       operationId,
      client_request_id:  clientRequestId,
      position_id:        positionId,
      transaction_status: transactionEvent.status,
      transaction_event:  transactionEvent,
    };

  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Timeout esperando transaction_event')
    ) {
      console.error('\n⚠️ Exness aceptó la orden pero no llegó el evento a tiempo.');
      console.error('   Operation ID:', operationId);
      console.error('   No vuelvas a enviar la orden automáticamente.');
    }

    throw error;

  } finally {
    if (onMsg) {
      ws.off('message', onMsg);
    }

    ws.close();
  }
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🔑 Cargando clave...');

  const privateKey = loadPrivateKey(CONFIG.privateKey);

  console.log('✅ Clave OK\n');

  console.log('🌐 Resolviendo Access Point...');

  const accessPoint = await getAccessPoint(privateKey);

  console.log('✅ Access Point:', accessPoint, '\n');

  // ════════════════════════════════════════════════════════════
  // EJEMPLO 1: ABRIR POSICIÓN
  // ════════════════════════════════════════════════════════════

  await openPosition(accessPoint, privateKey, {
    instrument:  'BTCUSD',
    direction:   'buy',
    volume:      0.01,
    stopLoss:    70000,
    takeProfit:  77000,
  });
}

main().catch((err: unknown) => {
  console.error(
    '❌ Error:',
    err instanceof Error ? err.message : err,
  );

  process.exitCode = 1;
});
