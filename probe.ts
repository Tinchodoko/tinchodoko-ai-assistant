import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
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

function buildHeaders(apiKey: string, privateKey: KeyObject, path: string): Record<string, string> {
  const timestamp = Date.now();
  const bodyHash = createHash('sha256').update(Buffer.alloc(0)).digest('base64url');
  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey, idempotency_key: '',
    timestamp, sign_version: 1,
    method: 'GET', path, body_hash: bodyHash,
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

async function probe(host: string, path: string, apiKey: string, privateKey: KeyObject) {
  try {
    const res = await fetch(host + path, {
      method: 'GET',
      headers: buildHeaders(apiKey, privateKey, path),
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.text();
    const icon = res.ok ? '✅' : res.status === 404 ? '🔍' : '⚠️';
    console.log(`${icon} [${res.status}] ${path}`);
    if (res.ok) console.log('   →', body.slice(0, 200));
  } catch (e: any) {
    console.log(`❌ [ERR] ${path} — ${e.message}`);
  }
}

async function main() {
  const privateKey = loadPrivateKey(CONFIG.privateKey);

  // Access Point
  const discPath = `/v1/trading/access-point?account_id=${CONFIG.accountId}`;
  const discRes  = await fetch(CONFIG.gatewayBaseUrl + discPath, {
    method: 'GET',
    headers: buildHeaders(CONFIG.apiKey, privateKey, discPath),
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  const disc = await discRes.json() as { access_point?: string };
  const ap = new URL(disc.access_point!).origin;
  console.log('✅ Access Point:', ap, '\n');

  const id = CONFIG.accountId;
  const paths = [
    `/v1/trading/accounts/${id}/positions`,
    `/v1/trading/accounts/${id}/open-positions`,
    `/v1/trading/accounts/${id}/trades`,
    `/v1/trading/accounts/${id}/orders`,
    `/v1/trading/accounts/${id}/open-orders`,
    `/v1/configuration/accounts/${id}/positions`,
    `/v1/trading/accounts/${id}`,
    `/v1/trading/accounts/${id}/state`,
  ];

  console.log('🔍 Probando endpoints...\n');
  for (const path of paths) {
    await probe(ap, path, CONFIG.apiKey, privateKey);
  }
}

main().catch(console.error);