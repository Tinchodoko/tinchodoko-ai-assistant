import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export function loadSigningKey(text: string): KeyObject {
  const input = text.trim();
  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    const key = createPrivateKey(input);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Expected Ed25519 key');
    return key;
  }
  if (!/^[0-9a-fA-F]{128}$/.test(input)) {
    throw new Error('Expected 128 hex chars or PKCS#8 PEM');
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
  const pub = createPublicKey(key).export({ format: 'jwk' });
  if (!Buffer.from(pub.x ?? '', 'base64url').equals(raw.subarray(32))) {
    throw new Error('Public half mismatch');
  }
  return key;
}

export function buildSignedHeaders(
  apiKey: string,
  privateKey: KeyObject,
  method: string,
  pathWithQuery: string,
  body = '',
  idempotencyKey = '',
): Record<string, string> {
  const timestamp = Date.now();
  const bodyHash = createHash('sha256').update(Buffer.from(body, 'utf8')).digest('base64url');
  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp,
    sign_version: 1,
    method,
    path: pathWithQuery,
    body_hash: bodyHash,
  }), 'utf8');
  return {
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': idempotencyKey,
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': payload.toString('base64url'),
    'EXN-SIGN': sign(null, payload, privateKey).toString('base64url'),
    'Content-Type': 'application/json',
  };
}
