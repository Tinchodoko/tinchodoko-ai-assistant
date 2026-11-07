import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export interface ExnessSignedHeaders {
  'EXN-API-KEY': string;
  'EXN-IDEMPOTENCY-KEY': string;
  'EXN-TIMESTAMP': string;
  'EXN-SIGN-VERSION': string;
  'EXN-DATA': string;
  'EXN-SIGN': string;
}

export function loadSigningKey(text: string): KeyObject {
  const input = text.trim();
  let key: KeyObject;
  if (input.startsWith('-----BEGIN PRIVATE KEY-----')) {
    key = createPrivateKey(input);
  } else {
    if (!/^[0-9a-fA-F]{128}$/.test(input)) {
      throw new Error('Expected 128 hex characters or unencrypted PKCS#8 PEM');
    }
    const raw = Buffer.from(input, 'hex');
    // RFC 8410 PKCS#8 DER wrapper for a 32-byte Ed25519 seed.
    key = createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        raw.subarray(0, 32),
      ]),
      format: 'der',
      type: 'pkcs8',
    });
    const publicJwk = createPublicKey(key).export({ format: 'jwk' });
    if (!Buffer.from(publicJwk.x ?? '', 'base64url').equals(raw.subarray(32))) {
      throw new Error('Private key public half does not match its seed');
    }
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new Error('Expected an Ed25519 private key');
  }
  return key;
}

export function buildSignedGetHeaders(
  apiKey: string,
  privateKeyText: string,
  pathWithQuery: string,
  timestampOverride?: number,
): ExnessSignedHeaders {
  const privateKey = loadSigningKey(privateKeyText);
  const timestamp = timestampOverride ?? Date.now();
  
  // Empty body hash for GET requests: SHA256 of empty buffer in base64url
  const bodyHash = createHash('sha256').update(Buffer.alloc(0)).digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey,
    idempotency_key: '',
    timestamp,
    sign_version: 1,
    method: 'GET',
    path: pathWithQuery,
    body_hash: bodyHash,
  }), 'utf8');

  return {
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': payload.toString('base64url'),
    'EXN-SIGN': sign(null, payload, privateKey).toString('base64url'),
  };
}

export function buildSignedPostHeaders(
  apiKey: string,
  privateKeyText: string,
  pathWithQuery: string,
  bodyObj: Record<string, unknown>,
  idempotencyKey: string,
  timestampOverride?: number,
): ExnessSignedHeaders {
  const privateKey = loadSigningKey(privateKeyText);
  const timestamp = timestampOverride ?? Date.now();
  const bodyBuffer = Buffer.from(JSON.stringify(bodyObj), 'utf8');
  const bodyHash = createHash('sha256').update(bodyBuffer).digest('base64url');

  const payload = Buffer.from(JSON.stringify({
    api_key: apiKey,
    idempotency_key: idempotencyKey,
    timestamp,
    sign_version: 1,
    method: 'POST',
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
  };
}
