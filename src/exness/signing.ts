import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

export type ExnessSignedHeaders = Record<string, string>;

const EMPTY_BODY_HASH = createHash('sha256').update(Buffer.alloc(0)).digest('base64url');

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

export function baseUrl(value: string): string {
  const url = new URL(value.trim());

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Expected an HTTPS base URL without credentials, path, query or fragment',
    );
  }

  return url.origin;
}

export function signedGetHeaders(
  apiKey: string,
  privateKey: KeyObject,
  pathWithQuery: string,
): ExnessSignedHeaders {
  const timestamp = Date.now();

  // Serialize once and sign exactly those UTF-8 bytes.
  const payload = Buffer.from(
    JSON.stringify({
      api_key: apiKey,
      idempotency_key: '',
      timestamp,
      sign_version: 1,
      method: 'GET',
      path: pathWithQuery,
      body_hash: EMPTY_BODY_HASH,
    }),
    'utf8',
  );

  return {
    'EXN-API-KEY': apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': payload.toString('base64url'),
    'EXN-SIGN': sign(null, payload, privateKey).toString('base64url'),
  };
}
