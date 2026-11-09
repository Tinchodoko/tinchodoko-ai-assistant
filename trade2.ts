
import { createHash, createPrivateKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { CONFIG } from './config.js';

// ─── TIPOS ───────────────────────────────────────────────────

interface TradingSnapshot {
  positions: Array<{
    position_id: string;
    instrument: string;
    state: string;
    volume: string;
  }>;

  orders: Array<{
    order_id: string;
    instrument: string;
    order_type: string;
    state: string;
    direction?: string;
    volume?: string;
    price?: string;
  }>;
}

// ─── CLAVE PRIVADA ED25519 ───────────────────────────────────

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

  if (raw.length !== 32 && raw.length !== 64) {
    throw new Error(
      'La clave privada hexadecimal debe tener 32 o 64 bytes',
    );
  }

  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw.subarray(0, 32),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Debe ser Ed25519');
  }

  return key;
}

// ─── FIRMA GET ───────────────────────────────────────────────

function buildGetHeaders(
  apiKey: string,
  privateKey: KeyObject,
  path: string,
): Record<string, string> {
  const timestamp = Date.now();

  const bodyHash = createHash('sha256')
    .update(Buffer.alloc(0))
    .digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey,
    idempotency_key: '',
    timestamp,
    sign_version: 1,
    method: 'GET',
    path,
    body_hash: bodyHash,
  }), 'utf8');

  return {
    'Accept': 'application/json',
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': payload.toString('base64url'),
    'EXN-SIGN': sign(null, payload, privateKey).toString('base64url'),
  };
}

// ─── FIRMA DELETE ────────────────────────────────────────────

function buildMutHeaders(
  apiKey: string,
  privateKey: KeyObject,
  path: string,
): Record<string, string> {
  const timestamp = Date.now();

  const idempotencyKey =
    `${timestamp}-${Math.random().toString(36).slice(2)}`;

  const bodyHash = createHash('sha256')
    .update(Buffer.alloc(0))
    .digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp,
    sign_version: 1,
    method: 'DELETE',
    path,
    body_hash: bodyHash,
  }), 'utf8');

  return {
    'Accept': 'application/json',
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': idempotencyKey,
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': payload.toString('base64url'),
    'EXN-SIGN': sign(null, payload, privateKey).toString('base64url'),
  };
}

// ─── ACCESS POINT ────────────────────────────────────────────

async function getAccessPoint(
  privateKey: KeyObject,
): Promise<string> {
  const path =
    `/v1/trading/access-point?account_id=${CONFIG.accountId}`;

  const res = await fetch(CONFIG.gatewayBaseUrl + path, {
    method: 'GET',
    headers: buildGetHeaders(CONFIG.apiKey, privateKey, path),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
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

// ─── SNAPSHOT DE LA CUENTA ────────────────────────────────────

async function getTradingSnapshot(
  accessPoint: string,
  privateKey: KeyObject,
): Promise<TradingSnapshot> {
  const path =
    `/v1/trading/accounts/${CONFIG.accountId}/snapshot`;

  const res = await fetch(accessPoint + path, {
    method: 'GET',
    headers: buildGetHeaders(
      CONFIG.apiKey,
      privateKey,
      path,
    ),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });

  const responseText = await res.text();

  if (!res.ok) {
    throw new Error(
      `Snapshot HTTP ${res.status}: ${responseText}`,
    );
  }

  const data = JSON.parse(responseText) as TradingSnapshot;

  if (
    !data ||
    !Array.isArray(data.positions) ||
    !Array.isArray(data.orders)
  ) {
    throw new Error(
      'Respuesta Snapshot inesperada: faltan positions u orders',
    );
  }

  console.log('\n🔍 RAW SNAPSHOT:');
  console.log(JSON.stringify(data, null, 2));
  return data;
}

// ─── CONECTAR A TRANSACTIONS ──────────────────────────────────

async function connectTransactionStream(
  accessPoint: string,
  privateKey: KeyObject,
): Promise<WebSocket> {
  const wsPath =
    `/v1/server-events/accounts/${CONFIG.accountId}/ws/events`;

  const wsUrl =
    accessPoint.replace(/^https:/, 'wss:') + wsPath;

  const ws = new WebSocket(
    wsUrl,
    'exness-ws-protocol',
    {
      headers: buildGetHeaders(
        CONFIG.apiKey,
        privateKey,
        wsPath,
      ),
      handshakeTimeout: 10000,
    },
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(
          new Error('Timeout esperando trading_state_snapshot'),
        );
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
          id: 'trade-monitor',
          subscribe: {
            event: 'transactions',
          },
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

// ─── ESPERAR CONFIRMACIÓN DE TRANSACCIÓN ──────────────────────

function waitForTransaction(
  ws: WebSocket,
  clientRequestId: string,
  getOperationId: () => string | undefined,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error('Timeout esperando transaction_event'),
      );
    }, 20000);

    const cleanup = () => {
      clearTimeout(timer);
      ws.off('message', onMessage);
    };

    const onMessage = (raw: WebSocket.RawData) => {
      let msg: any;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.event_type !== 'transaction_event') return;

      const operationId = getOperationId();

      const matches =
        msg.client_request_id === clientRequestId ||
        (
          operationId &&
          String(msg.operation_id) === operationId
        );

      if (!matches) return;

      cleanup();
      resolve(msg);
    };

    ws.on('message', onMessage);
  });
}

// ─── CERRAR POSICIÓN ─────────────────────────────────────────

async function closePosition(
  accessPoint: string,
  privateKey: KeyObject,
  positionId: string,
  volume?: number,
): Promise<any> {
  let path =
    `/v1/trading/accounts/${CONFIG.accountId}/positions/${positionId}`;

  if (volume !== undefined) {
    if (!Number.isFinite(volume) || volume <= 0) {
      throw new Error(
        'El volumen parcial debe ser mayor que cero',
      );
    }

    path += `?volume=${volume}`;
  }

  const headers = buildMutHeaders(
    CONFIG.apiKey,
    privateKey,
    path,
  );

  const clientRequestId =
    headers['EXN-IDEMPOTENCY-KEY'];

  console.log('\n🔌 Conectando a Exness Server Events...');

  const ws = await connectTransactionStream(
    accessPoint,
    privateKey,
  );

  let operationId: string | undefined;

  try {
    const transactionPromise = waitForTransaction(
      ws,
      clientRequestId,
      () => operationId,
    );

    console.log(`\n📤 Cerrando posición ${positionId}...`);

    if (volume !== undefined) {
      console.log(`   Volumen parcial: ${volume}`);
    }

    const res = await fetch(accessPoint + path, {
      method: 'DELETE',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
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

    console.log('✅ ACK ACEPTADO');
    console.log('   Operation ID     :', operationId);
    console.log('   Client Request ID:', clientRequestId);
    console.log('\n⏳ Esperando confirmación de Exness...');

    const transactionEvent = await transactionPromise;

    if (
      transactionEvent.status === 'rejected' ||
      transactionEvent.status === 'failed'
    ) {
      throw new Error(
        `Exness ${transactionEvent.status}: ` +
        JSON.stringify(transactionEvent),
      );
    }

    const payload = transactionEvent.payload ?? {};
    const position = payload.positions?.[0] ?? {};
    const deal = payload.deals?.[0] ?? {};

    const closeOrderResult = payload.orders?.find(
      (o: any) =>
        o.order_type === 'market' &&
        o.state === 'filled',
    );

    const closeOrder = closeOrderResult ?? {};

    const instrument =
      position.instrument ?? deal.instrument ?? '-';

    const direction =
      position.direction ?? '-';

    const closedVolume =
      deal.volume ?? '-';

    const closeType =
      closeOrder.order_type ?? 'market';

    const closePrice =
      deal.price ?? '-';

    const openPrice =
      position.open_price ?? '-';

    const realizedPnl =
      deal.profit?.amount !== undefined
        ? `${deal.profit.amount} ${deal.profit.currency ?? 'USD'}`
        : '-';

    const commission =
      deal.commission ?? position.commission ?? '-';

    const swap =
      position.swap ?? '-';

    const closeTime =
      deal.create_time ??
      transactionEvent.event_time ??
      '-';

    const finalStatus =
      transactionEvent.status ?? '-';

    const parsedCloseTime =
      closeTime !== '-' ? new Date(closeTime) : null;

    const closeTimeFmt =
      parsedCloseTime &&
      !Number.isNaN(parsedCloseTime.getTime())
        ? parsedCloseTime.toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
          })
        : String(closeTime);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║           TRADE CLOSE REPORT             ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE LA POSICIÓN              ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Instrument      : ${instrument}`);
    console.log(`  Position ID     : ${positionId}`);
    console.log(`  Direction       : ${String(direction).toUpperCase()}`);
    console.log(`  Closed Volume   : ${closedVolume}`);
    console.log(`  Close Type      : ${closeType}`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE EJECUCIÓN                ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Close Price     : ${closePrice}`);
    console.log(`  Open Price      : ${openPrice}`);
    console.log(`  Realized P/L    : ${realizedPnl}`);
    console.log(`  Commission      : ${commission}`);
    console.log(`  Swap            : ${swap}`);
    console.log(`  Close Timestamp : ${closeTimeFmt}`);
    console.log(`  Operation ID    : ${operationId}`);
    console.log(`  Client Req ID   : ${clientRequestId}`);
    console.log(`  Final Status    : ${finalStatus}`);
    console.log('╚══════════════════════════════════════════╝\n');

    return {
      operation_id: operationId,
      client_request_id: clientRequestId,
      position_id: positionId,
      instrument,
      direction,
      closed_volume: closedVolume,
      close_type: closeType,
      close_price: closePrice,
      open_price: openPrice,
      realized_pnl: realizedPnl,
      commission,
      swap,
      close_time: closeTime,
      final_status: finalStatus,
      transaction_event: transactionEvent,
    };

  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Timeout esperando transaction_event')
    ) {
      console.error(
        '\n⚠️ Exness pudo aceptar el cierre, pero no llegó el evento.',
      );
      console.error('   Operation ID:', operationId);
      console.error(
        '   No vuelvas a cerrar automáticamente.',
      );
    }

    throw error;

  } finally {
    ws.close();
  }
}

// ─── CANCELAR ORDEN PENDIENTE ─────────────────────────────────

async function cancelPendingOrder(
  accessPoint: string,
  privateKey: KeyObject,
  orderId: string,
): Promise<any> {
  const path =
    `/v1/trading/accounts/${CONFIG.accountId}/orders/${orderId}`;

  const headers = buildMutHeaders(
    CONFIG.apiKey,
    privateKey,
    path,
  );

  const clientRequestId =
    headers['EXN-IDEMPOTENCY-KEY'];

  console.log('\n🔌 Conectando a Exness Server Events...');

  const ws = await connectTransactionStream(
    accessPoint,
    privateKey,
  );

  let operationId: string | undefined;

  try {
    const transactionPromise = waitForTransaction(
      ws,
      clientRequestId,
      () => operationId,
    );

    console.log(`\n📤 Cancelando orden pendiente ${orderId}...`);

    const res = await fetch(accessPoint + path, {
      method: 'DELETE',
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
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

    console.log('✅ ACK ACEPTADO');
    console.log('   Operation ID     :', operationId);
    console.log('   Client Request ID:', clientRequestId);
    console.log('\n⏳ Esperando confirmación de Exness...');

    const transactionEvent = await transactionPromise;

    if (
      transactionEvent.status === 'rejected' ||
      transactionEvent.status === 'failed'
    ) {
      throw new Error(
        `Exness ${transactionEvent.status}: ` +
        JSON.stringify(transactionEvent),
      );
    }

    const payload = transactionEvent.payload ?? {};

    const order =
      payload.orders?.find(
        (o: any) =>
          String(o.order_id) === orderId ||
          String(o.id) === orderId,
      ) ??
      payload.orders?.[0] ??
      {};

    const instrument =
      order.instrument ?? '-';

    const direction =
      order.direction ?? order.side ?? '-';

    const orderType =
      order.order_type ?? '-';

    const volume =
      order.volume ?? '-';

    const price =
      order.price ?? order.open_price ?? '-';

    const finalStatus =
      transactionEvent.status ?? '-';

    const eventTime =
      transactionEvent.event_time ?? '-';

    const parsedEventTime =
      eventTime !== '-' ? new Date(eventTime) : null;

    const eventTimeFmt =
      parsedEventTime &&
      !Number.isNaN(parsedEventTime.getTime())
        ? parsedEventTime.toLocaleString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
          })
        : String(eventTime);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║       PENDING ORDER CANCEL REPORT        ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE LA ORDEN                 ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Order ID        : ${orderId}`);
    console.log(`  Instrument      : ${instrument}`);
    console.log(`  Direction       : ${String(direction).toUpperCase()}`);
    console.log(`  Order Type      : ${orderType}`);
    console.log(`  Volume          : ${volume}`);
    console.log(`  Price           : ${price}`);
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  INFORMACIÓN DE EJECUCIÓN                ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`  Operation ID    : ${operationId}`);
    console.log(`  Client Req ID   : ${clientRequestId}`);
    console.log(`  Event Timestamp : ${eventTimeFmt}`);
    console.log(`  Final Status    : ${finalStatus}`);
    console.log('╚══════════════════════════════════════════╝\n');

    return {
      operation_id: operationId,
      client_request_id: clientRequestId,
      order_id: orderId,
      instrument,
      direction,
      order_type: orderType,
      volume,
      price,
      final_status: finalStatus,
      transaction_event: transactionEvent,
    };

  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Timeout esperando transaction_event')
    ) {
      console.error(
        '\n⚠️ Exness aceptó la solicitud, pero no llegó el evento.',
      );
      console.error('   Operation ID:', operationId);
      console.error(
        '   No vuelvas a cancelar automáticamente.',
      );
    }

    throw error;

  } finally {
    ws.close();
  }
}

// ─── CLOSE ALL POR SÍMBOLO ────────────────────────────────────

async function closeAllBySymbol(
  accessPoint: string,
  privateKey: KeyObject,
  symbol: string,
): Promise<void> {
  const instrument = symbol.trim().toUpperCase();

  if (!instrument) {
    throw new Error('Debés indicar un símbolo');
  }

  console.log('\n════════════════════════════════════');
  console.log('          CLOSE ALL ACTIVADO');
  console.log('════════════════════════════════════');
  console.log('Símbolo:', instrument);

  console.log('\n🔍 Consultando snapshot de Exness...');

  const snapshot = await getTradingSnapshot(
    accessPoint,
    privateKey,
  );

  // Posiciones abiertas del símbolo.
  const positions = snapshot.positions.filter(
    p =>
      p.instrument.toUpperCase() === instrument &&
      p.state === 'open',
  );

  // Órdenes pendientes de entrada del símbolo.
  // SLTP se excluye porque es protección vinculada a posiciones.
  const pendingOrders = snapshot.orders.filter(
    o =>
      o.instrument.toUpperCase() === instrument &&
      o.state === 'placed' &&
      ['stop', 'limit'].includes(o.order_type.toLowerCase()),
  );

  console.log('\n📊 RECURSOS ENCONTRADOS');
  console.log('Posiciones abiertas:', positions.length);
  console.log('Órdenes pendientes  :', pendingOrders.length);

  if (positions.length === 0 && pendingOrders.length === 0) {
    console.log('\n✅ No hay operaciones para procesar.');
    return;
  }

  const results: Array<{
    type: string;
    id: string;
    status: string;
    error?: string;
  }> = [];

  // 1. Cancelar órdenes pendientes.
  for (const order of pendingOrders) {
    console.log(`\n🗑️ Cancelando orden ${order.order_id}`);

    try {
      const result = await cancelPendingOrder(
        accessPoint,
        privateKey,
        String(order.order_id),
      );

      results.push({
        type: 'PENDING ORDER',
        id: String(order.order_id),
        status: result.final_status,
      });

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error('❌ Error:', message);

      results.push({
        type: 'PENDING ORDER',
        id: String(order.order_id),
        status: 'ERROR',
        error: message,
      });
    }
  }

  // 2. Cerrar posiciones abiertas.
  for (const position of positions) {
    console.log(`\n🔒 Cerrando posición ${position.position_id}`);

    try {
      const result = await closePosition(
        accessPoint,
        privateKey,
        String(position.position_id),
      );

      results.push({
        type: 'POSITION',
        id: String(position.position_id),
        status: result.final_status,
      });

    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error('❌ Error:', message);

      results.push({
        type: 'POSITION',
        id: String(position.position_id),
        status: 'ERROR',
        error: message,
      });
    }
  }

  // 3. Resumen final.
  const successful = results.filter(
    r =>
      r.status !== 'ERROR' &&
      r.status !== 'rejected' &&
      r.status !== 'failed',
  ).length;

  const failed = results.length - successful;

  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║             CLOSE ALL REPORT             ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`  Symbol             : ${instrument}`);
  console.log(`  Positions found    : ${positions.length}`);
  console.log(`  Pending orders     : ${pendingOrders.length}`);
  console.log('╠══════════════════════════════════════════╣');

  for (const result of results) {
    console.log(
      `  ${result.type} ${result.id}: ${result.status}`,
    );

    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
  }

  console.log('╠══════════════════════════════════════════╣');
  console.log(`  Successful         : ${successful}`);
  console.log(`  Failed             : ${failed}`);
  console.log('╚══════════════════════════════════════════╝\n');
}

// ─── EJECUCIÓN PRINCIPAL ──────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔑 Cargando clave...');

  const privateKey = loadPrivateKey(CONFIG.privateKey);

  console.log('✅ Clave OK\n');

  console.log('🌐 Resolviendo Access Point...');

  const accessPoint = await getAccessPoint(privateKey);

  console.log('✅ Access Point:', accessPoint, '\n');

  if (CLOSE_ALL) {
    await closeAllBySymbol(
      accessPoint,
      privateKey,
      SYMBOL,
    );

    return;
  }

  if (RESOURCE_TYPE === 'position') {
    if (!POSITION_ID.trim()) {
      throw new Error('POSITION_ID está vacío');
    }

    const result = await closePosition(
      accessPoint,
      privateKey,
      POSITION_ID,
    );

    console.log(
      '✅ Posición procesada:',
      result.final_status,
    );

  } else {
    if (!ORDER_ID.trim()) {
      throw new Error('ORDER_ID está vacío');
    }

    const result = await cancelPendingOrder(
      accessPoint,
      privateKey,
      ORDER_ID,
    );

    console.log(
      '✅ Orden procesada:',
      result.final_status,
    );
  }
}

// ══════════════════════════════════════════════════════════════
//                 CONFIGURACIÓN DEL USUARIO
//           ESTA ES LA ÚNICA SECCIÓN QUE DEBÉS EDITAR
// ══════════════════════════════════════════════════════════════

// CLOSE ALL:
// true  = Cierra todas las posiciones y cancela las órdenes
//         pendientes del símbolo seleccionado.
// false = Ejecuta una sola operación mediante un ID.

const CLOSE_ALL = true;

// Símbolo para CLOSE ALL.
const SYMBOL = 'BTCUSD';

// Operación individual cuando CLOSE_ALL = false.
const RESOURCE_TYPE: 'position' | 'pending_order' = 'pending_order';

// ID para cerrar una posición individual.
const POSITION_ID = '11269886';

// ID para cancelar una orden pendiente individual.
const ORDER_ID = '23523209';

// ══════════════════════════════════════════════════════════════
//                       INICIAR PROGRAMA
// ══════════════════════════════════════════════════════════════

main().catch((err: unknown) => {
  console.error(
    '❌ Error:',
    err instanceof Error ? err.message : err,
  );

  process.exitCode = 1;
});