import { ed25519 } from '@noble/curves/ed25519';

export type Credentials = {
  gatewayUrl: string;
  apiKey: string;
  secret: string;
  accountId: string;
};

export type AccountResult = {
  balance: string;
  accessPoint: string;
  raw: Record<string, unknown>;
};

function hexToBytes(hex: string): Uint8Array {
  const s = hex.trim();
  if (!/^[0-9a-fA-F]{128}$/.test(s)) {
    throw new Error('SECRET inválido: se esperan 128 caracteres hex.');
  }

  const out = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(b => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// SHA-256 Base64URL del cuerpo vacío; coincide con el cálculo de balance.ts.
// Para GET no hay body, así que no hace falta usar una API criptográfica del navegador.
const EMPTY_BODY_SHA256_BASE64URL =
  '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';

type SignedRequest = {
  headers: Record<string, string>;
  timestamp: number;
};

async function headers(c: Credentials, path: string): Promise<SignedRequest> {
  const timestamp = Date.now();
  const bodyHash = EMPTY_BODY_SHA256_BASE64URL;

  const payload = JSON.stringify({
    api_key: c.apiKey,
    idempotency_key: '',
    timestamp,
    sign_version: 1,
    method: 'GET',
    path,
    body_hash: bodyHash,
  });

  const data = new TextEncoder().encode(payload);
  const signature = ed25519.sign(
    data,
    hexToBytes(c.secret).slice(0, 32),
  );

  return {
    timestamp,
    headers: {
    'EXN-API-KEY': c.apiKey,
    'EXN-IDEMPOTENCY-KEY': '',
    'EXN-TIMESTAMP': String(timestamp),
    'EXN-SIGN-VERSION': '1',
    'EXN-DATA': b64url(data),
    'EXN-SIGN': b64url(signature),
    'Accept': 'application/json',
    },
  };
}

async function getJson<T>(
  host: string,
  path: string,
  c: Credentials,
): Promise<T> {
  const signed = await headers(c, path);
  const res = await fetch(host.replace(/\/$/, '') + path, {
    method: 'GET',
    headers: signed.headers,
  });

  const responseReceivedAt = Date.now();
  const serverDate = res.headers.get('date');
  const serverTime = serverDate ? Date.parse(serverDate) : Number.NaN;
  const text = await res.text();

  if (!res.ok) {
    const diagnostics = [
      `timestamp enviado=${signed.timestamp}`,
      `edad del timestamp al recibir respuesta=${responseReceivedAt - signed.timestamp} ms`,
      `hora local al recibir respuesta=${responseReceivedAt}`,
      serverDate ? `fecha del servidor=${serverDate}` : 'fecha del servidor=no disponible',
      Number.isFinite(serverTime)
        ? `diferencia servidor-local=${serverTime - responseReceivedAt} ms`
        : 'diferencia servidor-local=no calculable',
    ].join(' | ');

    throw new Error(`HTTP ${res.status}: ${text}\nDiagnóstico seguro: ${diagnostics}`);
  }

  return JSON.parse(text) as T;
}

export async function connectAndGetAccount(
  c: Credentials,
): Promise<AccountResult> {
  if (!c.gatewayUrl.trim()) {
    throw new Error('GATEWAY URL vacío.');
  }

  if (!c.apiKey.trim()) {
    throw new Error('API KEY vacía.');
  }

  if (!c.secret.trim()) {
    throw new Error('SECRET vacío.');
  }

  if (!/^\d+$/.test(c.accountId.trim())) {
    throw new Error('ACCOUNT inválido.');
  }

  const gateway = c.gatewayUrl.trim().replace(/\/$/, '');
  const accountId = c.accountId.trim();

  const discoveryPath =
    `/v1/trading/access-point?account_id=${encodeURIComponent(accountId)}`;

  const discovery = await getJson<{ access_point?: string }>(
    gateway,
    discoveryPath,
    c,
  );

  if (!discovery.access_point) {
    throw new Error('Exness no devolvió Access Point.');
  }

  const accessPoint = new URL(discovery.access_point).origin;
  const accountPath =
    `/v1/configuration/accounts/${encodeURIComponent(accountId)}/account`;

  const account = await getJson<Record<string, unknown>>(
    accessPoint,
    accountPath,
    c,
  );

  const value =
    account.balance ??
    (account.account as { balance?: unknown } | undefined)?.balance;

  if (value === undefined || value === null) {
    throw new Error('No se encontró balance en la respuesta de Exness.');
  }

  return {
    balance: String(value),
    accessPoint,
    raw: account,
  };
}
