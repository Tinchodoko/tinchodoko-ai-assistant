import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { CONFIG } from './config.js';

function loadPrivateKey(text: string): KeyObject {
  const input = text.trim();
  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const key = createPrivateKey(input);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Debe ser Ed25519');
    return key;
  }
  const raw = Buffer.from(input, 'hex');
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw.subarray(0, 32),
    ]),
    format: 'der', type: 'pkcs8',
  });
  return key;
}

function buildHeaders(
  apiKey: string,
  privateKey: KeyObject,
  pathWithQuery: string,
): Record<string, string> {
  const timestamp = Date.now();
  const bodyHash = createHash('sha256').update(Buffer.alloc(0)).digest('base64url');
  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey, idempotency_key: '',
    timestamp, sign_version: 1,
    method: 'GET', path: pathWithQuery, body_hash: bodyHash,
  }), 'utf8');
  return {
    'EXN-API-KEY':         apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP':       String(timestamp),
    'EXN-SIGN-VERSION':    '1',
    'EXN-DATA':            payload.toString('base64url'),
    'EXN-SIGN':            sign(null, payload, privateKey).toString('base64url'),
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

async function main() {
  console.log('🔑 Cargando clave...');
  const privateKey = loadPrivateKey(CONFIG.privateKey);
  console.log('✅ Clave OK\n');

  // Paso 1: Access Point
  console.log('🌐 Resolviendo Access Point...');
  const discPath = `/v1/trading/access-point?account_id=${CONFIG.accountId}`;
  const discRes  = await fetch(CONFIG.gatewayBaseUrl + discPath, {
    method: 'GET',
    headers: buildHeaders(CONFIG.apiKey, privateKey, discPath),
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!discRes.ok) throw new Error(`Discovery HTTP ${discRes.status}`);
  const disc = await discRes.json() as { access_point?: string };
  if (!disc.access_point) throw new Error('Sin access_point');
  const accessPoint = new URL(disc.access_point).origin;
  console.log('✅ Access Point:', accessPoint, '\n');

  // Paso 2: WebSocket
  const wsPath    = `/v1/server-events/accounts/${CONFIG.accountId}/ws/events`;
  const wsHeaders = buildHeaders(CONFIG.apiKey, privateKey, wsPath);
  const wsUrl     = accessPoint.replace('https://', 'wss://') + wsPath;

  console.log('🔌 Conectando WebSocket...');
  const ws = new WebSocket(wsUrl, 'exness-ws-protocol', {
    headers: wsHeaders, handshakeTimeout: 10000,
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open',  () => resolve());
    ws.once('error', (e) => reject(e));
  });
  console.log('✅ WebSocket conectado\n');

  ws.send(JSON.stringify({
    id: 'positions-monitor',
    subscribe: { event: 'transactions' },
  }));
  console.log('📡 Esperando snapshot...\n');

  process.on('SIGINT', () => { ws.close(); process.exit(0); });

  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.event_type !== 'trading_state_snapshot') return;

    const { account_state, positions, orders } = msg.payload ?? {};

    // ── CUENTA ───────────────────────────────────────────────
    console.log('═'.repeat(50));
    console.log('💼 RESUMEN DE CUENTA');
    console.log('═'.repeat(50));
    console.log(`   Balance     : $${account_state?.balance ?? '-'} USD`);
    console.log(`   Equity      : $${account_state?.equity  ?? '-'} USD`);
    console.log(`   Margen usado: $${account_state?.used_margin ?? '-'} USD`);
    console.log(`   Apalancam.  : 1:${account_state?.leverage ?? '-'}`);

    // ── POSICIONES ───────────────────────────────────────────
    console.log('\n' + '═'.repeat(50));
    console.log(`📊 POSICIONES ABIERTAS: ${positions?.length ?? 0}`);
    console.log('═'.repeat(50));

    if (!positions?.length) {
      console.log('   📭 No hay posiciones abiertas.');
    } else {
      positions.forEach((pos: any, i: number) => {
        // Buscar SL y TP en orders relacionadas
        const sltp = orders?.find((o: any) =>
          o.position_id === pos.position_id && o.order_type === 'sltp'
        );

        const direccion = pos.direction === 'buy' ? '🟢 BUY' : '🔴 SELL';

        console.log(`\n📌 Posición #${i + 1}`);
        console.log(`   ID          : ${pos.position_id}`);
        console.log(`   Instrumento : ${pos.instrument}`);
        console.log(`   Dirección   : ${direccion}`);
        console.log(`   Volumen     : ${pos.volume} lotes`);
        console.log(`   Precio      : $${pos.open_price}`);
        console.log(`   Estado      : ${pos.state}`);
        console.log(`   Comisión    : $${pos.commission}`);
        console.log(`   Swap        : $${pos.swap}`);
        console.log(`   Apertura    : ${formatDate(pos.create_time)}`);

        if (sltp) {
          console.log(`   Stop Loss   : $${sltp.stop_loss_price  || '-'}`);
          console.log(`   Take Profit : $${sltp.take_profit_price || '-'}`);
        }
      });
    }

    // ── ÓRDENES PENDIENTES ───────────────────────────────────
    const pendingOrders = orders?.filter((o: any) => o.order_type !== 'sltp') ?? [];
    if (pendingOrders.length > 0) {
      console.log('\n' + '═'.repeat(50));
      console.log(`⏳ ÓRDENES PENDIENTES: ${pendingOrders.length}`);
      console.log('═'.repeat(50));
      pendingOrders.forEach((ord: any, i: number) => {
        console.log(`\n📋 Orden #${i + 1}`);
        console.log(`   ID          : ${ord.order_id}`);
        console.log(`   Instrumento : ${ord.instrument}`);
        console.log(`   Tipo        : ${ord.order_type}`);
        console.log(`   Volumen     : ${ord.volume}`);
        console.log(`   Precio      : $${ord.price}`);
        console.log(`   Creada      : ${formatDate(ord.create_time)}`);
      });
    }

    console.log('\n' + '═'.repeat(50));
    console.log('✅ Consulta completada.');
    console.log('═'.repeat(50));

    ws.close();
    process.exit(0);
  });

  ws.on('error', (e) => console.error('❌ WS Error:', e.message));
  ws.on('close', ()  => console.log('\n🔌 WebSocket cerrado.'));
}

main().catch((err: unknown) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});