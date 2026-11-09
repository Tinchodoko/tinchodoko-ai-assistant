import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import WebSocket from 'ws';
import { CONFIG } from './config.js';

// ─── CARGA DE CLAVE ──────────────────────────────────────────
function loadPrivateKey(text: string): KeyObject {
  const input = text.trim();
  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const key = createPrivateKey(input);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Debe ser Ed25519');
    return key;
  }
  if (!/^[0-9a-fA-F]{128}$/.test(input)) throw new Error('Se esperan 128 hex o PEM');
  const raw = Buffer.from(input, 'hex');
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw.subarray(0, 32),
    ]),
    format: 'der', type: 'pkcs8',
  });
  const pub = createPublicKey(key).export({ format: 'jwk' });
  if (!Buffer.from((pub as any).x ?? '', 'base64url').equals(raw.subarray(32))) {
    throw new Error('Clave pública no coincide');
  }
  return key;
}

// ─── FIRMA ───────────────────────────────────────────────────
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

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🔑 Cargando clave...');
  const privateKey = loadPrivateKey(CONFIG.privateKey);
  console.log('✅ Clave OK\n');

  // Paso 1: Access Point
  console.log('🌐 Resolviendo Access Point...');
  const discPath = `/v1/trading/access-point?account_id=${CONFIG.accountId}`;
  const headers  = buildHeaders(CONFIG.apiKey, privateKey, discPath);
  const discRes  = await fetch(CONFIG.gatewayBaseUrl + discPath, {
    method: 'GET', headers, redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!discRes.ok) throw new Error(`Discovery HTTP ${discRes.status}`);
  const disc = await discRes.json() as { access_point?: string };
  if (!disc.access_point) throw new Error('Sin access_point');
  const accessPoint = new URL(disc.access_point).origin;
  console.log('✅ Access Point:', accessPoint, '\n');

  // Paso 2: WebSocket al endpoint de eventos
  const wsPath = `/v1/server-events/accounts/${CONFIG.accountId}/ws/events`;
  const wsHeaders = buildHeaders(CONFIG.apiKey, privateKey, wsPath);
  const wsUrl = accessPoint.replace('https://', 'wss://') + wsPath;

  console.log('🔌 Conectando WebSocket...');
  const ws = new WebSocket(wsUrl, 'exness-ws-protocol', {
    headers: wsHeaders,
    handshakeTimeout: 10000,
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open',  () => resolve());
    ws.once('error', (e) => reject(e));
  });
  console.log('✅ WebSocket conectado\n');

  // Paso 3: Suscribirse a account_state
  ws.send(JSON.stringify({
    id: 'equity-monitor',
    subscribe: { event: 'account_state' },
  }));
  console.log('📡 Suscripto a account_state. Esperando datos...\n');
  console.log('─'.repeat(45));

  // Paso 4: Escuchar eventos (Ctrl+C para salir)
  process.on('SIGINT', () => { ws.close(); process.exit(0); });

  ws.on('message', (raw) => {
    const text = raw.toString();
    let msg: any;
    try { msg = JSON.parse(text); } catch { return; }

    if (msg.event_type === 'account_state_event') {
      const state = msg.payload?.account_state;
      console.log('📊 EQUITY UPDATE:', msg.event_time);
      console.log(`   💰 Balance    : ${state?.balance}`);
      console.log(`   📈 Equity     : ${state?.equity}`);
      console.log(`   📉 Used Margin: ${state?.used_margin}`);
      console.log('─'.repeat(45));
    } else {
      // Mostrar cualquier otro mensaje que llegue
      console.log('📨 Evento:', msg.event_type ?? JSON.stringify(msg));
    }
  });

  ws.on('error', (e) => console.error('❌ WS Error:', e.message));
  ws.on('close', ()  => console.log('\n🔌 WebSocket cerrado.'));
}

main().catch((err: unknown) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});