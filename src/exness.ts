import { ed25519 } from '@noble/curves/ed25519';

export type Credentials = {
  gatewayUrl: string;
  apiKey: string;
  secret: string;
  accountId: string;
};

export type ConnectionResult = {
  accessPoint: string;
};

export type AccountSnapshot = {
  balance?: string;
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

// Calibrated from Exness' HTTP Date header after a timestamp-window rejection.
// HTTP Date is rounded to whole seconds, so the midpoint estimate adds 500 ms.
let serverClockOffsetMs = 0;
let hasServerClockOffset = false;

async function headers(c: Credentials, path: string): Promise<SignedRequest> {
  const timestamp = Date.now() + (hasServerClockOffset ? serverClockOffsetMs : 0);
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
  const url = host.replace(/\/$/, '') + path;

  // This helper performs read-only GET requests only. A timestamp-window
  // rejection can therefore be retried once with a newly signed timestamp.
  for (let attempt = 0; attempt < 2; attempt++) {
    const signed = await headers(c, path);
    const requestStartedAt = Date.now();
    const res = await fetch(url, {
      method: 'GET',
      headers: signed.headers,
      // Never forward signed headers through an HTTP redirect.
      redirect: 'error',
    });

    const responseReceivedAt = Date.now();
    const serverDate = res.headers.get('date');
    const serverTime = serverDate ? Date.parse(serverDate) : Number.NaN;
    const text = await res.text();

    if (!res.ok) {
      const timestampRejected =
        res.status === 401 &&
        /timestamp outside allowed window/i.test(text);

      if (timestampRejected && attempt === 0 && Number.isFinite(serverTime)) {
        // HTTP Date describes server response time (rounded down to whole seconds).
        // Estimate clock offset against local response-receive time, not request midpoint.
        serverClockOffsetMs = Math.round(serverTime + 500 - responseReceivedAt);
        hasServerClockOffset = true;
        continue;
      }

      const roundTripMs = responseReceivedAt - requestStartedAt;
      const diagnostics = [
        `tiempo de solicitud hasta respuesta=${roundTripMs} ms`,
        `timestamp enviado=${signed.timestamp}`,
        `edad del timestamp al recibir respuesta=${responseReceivedAt - signed.timestamp} ms`,
        `hora local al recibir respuesta=${responseReceivedAt}`,
        serverDate ? `fecha del servidor=${serverDate}` : 'fecha del servidor=no disponible',
        Number.isFinite(serverTime)
          ? `diferencia servidor-local (Date HTTP, precisión 1 s)=${serverTime - responseReceivedAt} ms`
          : 'diferencia servidor-local=no calculable',
        `desfase aplicado=${hasServerClockOffset ? serverClockOffsetMs : 0} ms`,
      ].join(' | ');

      throw new Error(`HTTP ${res.status}: ${text}\\nDiagnóstico seguro: ${diagnostics}`);
    }

    return JSON.parse(text) as T;
  }

  throw new Error('No se pudo completar la consulta firmada después de sincronizar el timestamp.');
}

export async function connectToExness(
  c: Credentials,
): Promise<ConnectionResult> {
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

  // CONNECT only authenticates the API key and discovers the account's
  // Access Point. It deliberately does not request or require a balance.
  const discovery = await getJson<{ access_point?: string }>(
    gateway,
    discoveryPath,
    c,
  );

  if (typeof discovery.access_point !== 'string' || !discovery.access_point) {
    throw new Error('Exness no devolvió Access Point.');
  }

  return { accessPoint: new URL(discovery.access_point).origin };
}

function findBalanceValue(value: unknown, depth = 0): string | undefined {
  if (depth > 8 || value === null || typeof value !== 'object') {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBalanceValue(item, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;

  // Exness puede envolver los detalles de cuenta en objetos intermedios.
  // Buscamos la propiedad "balance" sin asumir una ruta fija como
  // response.account.balance o response.data.account.balance.
  for (const [key, candidate] of Object.entries(record)) {
    if (key.toLowerCase().replace(/[_-]/g, '') === 'balance') {
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        return String(candidate);
      }
    }
  }

  for (const candidate of Object.values(record)) {
    const found = findBalanceValue(candidate, depth + 1);
    if (found !== undefined) return found;
  }

  return undefined;
}

export async function getAccountSnapshot(
  c: Credentials,
  accessPoint: string,
): Promise<AccountSnapshot> {
  if (!accessPoint.trim()) {
    throw new Error('No hay Access Point. Conectá la cuenta primero.');
  }

  const accountPath =
    `/v1/configuration/accounts/${encodeURIComponent(c.accountId.trim())}/account`;
  const account = await getJson<Record<string, unknown>>(
    accessPoint,
    accountPath,
    c,
  );

  // The response may contain nested wrappers (for example data/account).
  // Resolve the balance recursively instead of relying on one guessed JSON path.
  // This request remains read-only and does not affect the separate CONNECT flow.
  return {
    balance: findBalanceValue(account),
    raw: account,
  };
}
