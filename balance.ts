import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { CONFIG } from './config.js';

// ─── CARGA DE CLAVE PRIVADA ──────────────────────────────────
function loadPrivateKey(text: string): KeyObject {
  const input = text.trim();

  // Formato PEM
  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const key = createPrivateKey(input);
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new Error('La clave debe ser Ed25519');
    }
    return key;
  }

  // Formato hex (128 caracteres)
  if (!/^[0-9a-fA-F]{128}$/.test(input)) {
    throw new Error('Se esperan 128 caracteres hex o un PEM Ed25519');
  }

  const raw = Buffer.from(input, 'hex');

  // Envolver los 32 bytes del seed en PKCS#8 DER
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      raw.subarray(0, 32),
    ]),
    format: 'der',
    type: 'pkcs8',
  });

  // Verificar que la parte pública coincida
  const publicJwk = createPublicKey(key).export({ format: 'jwk' });
  if (!Buffer.from((publicJwk as any).x ?? '', 'base64url').equals(raw.subarray(32))) {
    throw new Error('La parte pública de la clave no coincide con el seed');
  }

  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('La clave debe ser Ed25519');
  }

  return key;
}

// ─── FIRMA DE REQUESTS ───────────────────────────────────────
function buildSignedHeaders(
  apiKey: string,
  privateKey: KeyObject,
  method: string,
  pathWithQuery: string,
): Record<string, string> {
  const timestamp = Date.now();

  // Hash del body vacío (para GET no hay body)
  const bodyHash = createHash('sha256')
    .update(Buffer.alloc(0))
    .digest('base64url');

  // Payload que se firma — se serializa UNA SOLA VEZ
  const payload = Buffer.from(
    JSON.stringify({
      api_key:        apiKey,
      idempotency_key: '',
      timestamp,
      sign_version:   1,
      method,
      path:           pathWithQuery,
      body_hash:      bodyHash,
    }),
    'utf8',
  );

  const signature = sign(null, payload, privateKey);

  return {
    'EXN-API-KEY':        apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP':      String(timestamp),
    'EXN-SIGN-VERSION':   '1',
    'EXN-DATA':           payload.toString('base64url'),
    'EXN-SIGN':           signature.toString('base64url'),
  };
}

// ─── REQUEST HELPER ──────────────────────────────────────────
async function getJson<T>(
  host: string,
  pathWithQuery: string,
  apiKey: string,
  privateKey: KeyObject,
): Promise<T> {
  const headers = buildSignedHeaders(apiKey, privateKey, 'GET', pathWithQuery);

  const response = await fetch(host + pathWithQuery, {
    method:   'GET',
    headers,
    redirect: 'error',
    signal:   AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

// ─── MAIN ────────────────────────────────────────────────────
async function main() {
  console.log('🔑 Cargando clave privada...');
  const privateKey = loadPrivateKey(CONFIG.privateKey);
  console.log('✅ Clave cargada correctamente\n');

  // PASO 1: Descubrir el Access Point
  console.log('🌐 Conectando al Gateway:', CONFIG.gatewayBaseUrl);
  const discoveryPath = `/v1/trading/access-point?account_id=${CONFIG.accountId}`;

  const discovery = await getJson<{ access_point?: string }>(
    CONFIG.gatewayBaseUrl,
    discoveryPath,
    CONFIG.apiKey,
    privateKey,
  );

  if (typeof discovery.access_point !== 'string' || !discovery.access_point) {
    throw new Error('No se pudo obtener el Access Point');
  }

  // Limpiar la URL (sacar trailing slash si tiene)
  const accessPoint = new URL(discovery.access_point).origin;
  console.log('✅ Access Point obtenido:', accessPoint, '\n');

  // PASO 2: Obtener datos de la cuenta (balance, equity, etc.)
  console.log('💰 Obteniendo balance de cuenta...');
  const accountPath = `/v1/configuration/accounts/${CONFIG.accountId}/account`;

  const account = await getJson<Record<string, unknown>>(
    accessPoint,
    accountPath,
    CONFIG.apiKey,
    privateKey,
  );

  // Mostrar resultado completo
  console.log('─'.repeat(40));
  console.log('📊 DATOS DE CUENTA:');
  console.log('─'.repeat(40));
  console.log(JSON.stringify(account, null, 2));
  console.log('─'.repeat(40));
}

main().catch((err: unknown) => {
  console.error('❌ Error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});