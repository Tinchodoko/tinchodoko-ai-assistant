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
  equity?: string;
  usedMargin?: string;
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
// HTTP Date has whole-second precision, so the request/response midpoint is
// the least-biased estimate of the server clock at request time.
let serverClockOffsetMs = 0;
let hasServerClockOffset = false;

function sha256(bytes: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bitLen=bytes.length*8, paddedLen=((bytes.length+9+63)>>6)<<6;
  const data=new Uint8Array(paddedLen); data.set(bytes); data[bytes.length]=0x80;
  const view=new DataView(data.buffer);
  view.setUint32(paddedLen-8,Math.floor(bitLen/0x100000000),false);
  view.setUint32(paddedLen-4,bitLen>>>0,false);
  const w=new Uint32Array(64);
  for(let off=0;off<paddedLen;off+=64){
    for(let i=0;i<16;i++) w[i]=view.getUint32(off+i*4,false);
    for(let i=16;i<64;i++){
      const x=w[i-15], y=w[i-2];
      const s0=((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3);
      const s1=((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10);
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const S1=((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7));
      const ch=(e&f)^((~e)&g);
      const temp1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10));
      const maj=(a&b)^(a&c)^(b&c);
      const temp2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  const out=new Uint8Array(32);
  const outView=new DataView(out.buffer);
  for(let i=0;i<8;i++) outView.setUint32(i*4,H[i],false);
  return out;
}

function buildSignedHeadersAtTimestamp(
  c: Credentials,
  path: string,
  timestamp: number,
  method: string = 'GET',
  body: string = '',
  idempotencyKey: string = '',
): SignedRequest {
  const bodyBytes = new TextEncoder().encode(body);
  const bodyHash = body
    ? b64url(sha256(bodyBytes))
    : EMPTY_BODY_SHA256_BASE64URL;
  const payload = JSON.stringify({
    api_key: c.apiKey,
    idempotency_key: idempotencyKey,
    timestamp,
    sign_version: 1,
    method,
    path,
    body_hash: bodyHash,
  });

  const data = new TextEncoder().encode(payload);
  const signature = ed25519.sign(data, hexToBytes(c.secret).slice(0, 32));

  return {
    timestamp,
    headers: {
      'EXN-API-KEY': c.apiKey,
      'EXN-IDEMPOTENCY-KEY': idempotencyKey,
      'EXN-TIMESTAMP': String(timestamp),
      'EXN-SIGN-VERSION': '1',
      'EXN-DATA': b64url(data),
      'EXN-SIGN': b64url(signature),
      'Accept': 'application/json',
    },
  };
}

async function headers(c: Credentials, path: string): Promise<SignedRequest> {
  const timestamp = Date.now() + (hasServerClockOffset ? serverClockOffsetMs : 0);
  return buildSignedHeadersAtTimestamp(c, path, timestamp);
}

async function getJson<T>(
  host: string,
  path: string,
  c: Credentials,
): Promise<T> {
  const url = host.replace(/\/$/, '') + path;

  // This helper performs read-only GET requests only. A timestamp-window
  // rejection can therefore be retried with a newly signed timestamp after
  // recalibrating against the server's HTTP Date header. Multiple retries are
  // intentionally allowed because HTTP Date is rounded to whole seconds and
  // one sample can sit near a rounding boundary.
  for (let attempt = 0; attempt < 4; attempt++) {
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
        (res.status === 401 &&
          /timestamp outside allowed window/i.test(text)) ||
        (res.status === 400 &&
          /REQUEST_INVALID_TIME_RANGE|code["\\s:]*3004/i.test(text));

      if (timestampRejected && Number.isFinite(serverTime) && attempt < 3) {
        // Exness' HTTP Date has whole-second precision. Use the server Date
        // observed at response time and compensate by half the round trip so
        // the calibrated offset represents the clock at the moment the
        // request was signed. Never accumulate old Date samples: doing so can
        // combine adjacent seconds and produce an invalid ~2 s offset.
        const requestMidpoint = requestStartedAt + (
          responseReceivedAt - requestStartedAt
        ) / 2;
        // HTTP Date has whole-second precision and represents the server's current second.
        // Center that one-second interval (+500 ms) before estimating the offset.
        // This avoids signing requests ~500 ms early when the Date header is
        // interpreted as the exact start of the second.
        serverClockOffsetMs = Math.round(serverTime + 500 - requestMidpoint);
        hasServerClockOffset = true;
        continue;
      }

      if (res.status === 429 && attempt < 3) {
        const retryAfterHeader = res.headers.get('retry-after');
        const retryAfterSeconds = retryAfterHeader
          ? Number(retryAfterHeader)
          : Number.NaN;
        const delayMs = Number.isFinite(retryAfterSeconds)
          ? Math.max(250, Math.min(retryAfterSeconds * 1000, 10000))
          : 1500 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
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

  throw new Error('No se pudo completar la consulta firmada después de sincronizar el timestamp con Exness.');
}

async function requestJson<T>(
  host: string,
  path: string,
  c: Credentials,
  method: 'POST' | 'PATCH' | 'DELETE',
  bodyObject?: Record<string, unknown>,
): Promise<T> {
  const url = host.replace(/\/$/, '') + path;
  const body = bodyObject ? JSON.stringify(bodyObject) : '';
  const idempotencyKey = `tinchodoko-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const timestamp = Date.now() + (hasServerClockOffset ? serverClockOffsetMs : 0);
    const signed = buildSignedHeadersAtTimestamp(c, path, timestamp, method, body, idempotencyKey);
    const requestStartedAt = Date.now();
    const res = await fetch(url, {
      method,
      headers: {
        ...signed.headers,
        'Content-Type': 'application/json',
      },
      body: body || undefined,
      redirect: 'error',
    });
    const responseReceivedAt = Date.now();
    const serverDate = res.headers.get('date');
    const serverTime = serverDate ? Date.parse(serverDate) : Number.NaN;
    const text = await res.text();

    if (res.ok) return (text ? JSON.parse(text) : {}) as T;

    const timestampRejected =
      (res.status === 401 && /timestamp outside allowed window/i.test(text)) ||
      (res.status === 400 && /REQUEST_INVALID_TIME_RANGE|code["\\s:]*3004/i.test(text));

    if (timestampRejected && Number.isFinite(serverTime) && attempt < 2) {
      const midpoint = requestStartedAt + (responseReceivedAt - requestStartedAt) / 2;
      // Same half-second centering used by read-only GET retries.
      serverClockOffsetMs = Math.round(serverTime + 500 - midpoint);
      hasServerClockOffset = true;
      continue;
    }

    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  throw new Error('No se pudo completar la operación de trading.');
}

export async function modifyActiveOrder(
  c: Credentials,
  accessPoint: string,
  orderId: string,
  changes: { price?: string; stop_loss_price?: string | null; take_profit_price?: string | null },
): Promise<{ operation_id?: string; status?: string }> {
  const cleanOrderId = orderId.trim();
  if (!/^\d{1,20}$/.test(cleanOrderId)) {
    throw new Error('ID de orden inválido para modificar.');
  }
  const cleanChanges = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as { price?: string; stop_loss_price?: string | null; take_profit_price?: string | null };
  if (!Object.keys(cleanChanges).length) {
    throw new Error('No hay ningún valor para modificar.');
  }
  for (const value of Object.values(cleanChanges)) {
    if (value !== null && (typeof value !== 'string' || !/^[+]?(?:(?:0*[1-9][0-9]*)(?:\.[0-9]+)?|0+\.[0-9]*[1-9][0-9]*)$/.test(value))) {
      throw new Error('El precio enviado no tiene un formato válido para Exness.');
    }
  }
  const path = `/v1/trading/accounts/${encodeURIComponent(c.accountId.trim())}/orders/${encodeURIComponent(cleanOrderId)}`;
  return requestJson(accessPoint, path, c, 'PATCH', cleanChanges);
}

export async function createPositionSltp(
  c: Credentials,
  accessPoint: string,
  positionId: string,
  changes: { stop_loss_price?: string; take_profit_price?: string },
): Promise<{ operation_id?: string; status?: string }> {
  const cleanPositionId=positionId.trim();
  if (!/^\d{1,20}$/.test(cleanPositionId)) throw new Error('ID de posición inválido para configurar SL/TP.');
  const cleanChanges=Object.fromEntries(Object.entries(changes).filter(([,value])=>value!==undefined));
  if (!Object.keys(cleanChanges).length) throw new Error('Ingresá un Stop Loss o Take Profit.');
  const path = `/v1/trading/accounts/${encodeURIComponent(c.accountId.trim())}/orders`;
  return requestJson(accessPoint,path,c,'POST',{type:'sltp',position_id:cleanPositionId,...cleanChanges});
}

export async function cancelActiveOrder(
  c: Credentials,
  accessPoint: string,
  orderId: string,
): Promise<{ operation_id?: string; status?: string }> {
  const path = `/v1/trading/accounts/${encodeURIComponent(c.accountId.trim())}/orders/${encodeURIComponent(orderId)}`;
  return requestJson(accessPoint, path, c, 'DELETE');
}

export async function closePosition(
  c: Credentials,
  accessPoint: string,
  positionId: string,
): Promise<{ operation_id?: string; status?: string }> {
  const path = `/v1/trading/accounts/${encodeURIComponent(c.accountId.trim())}/positions/${encodeURIComponent(positionId)}`;
  return requestJson(accessPoint, path, c, 'DELETE');
}

function extractFloatingPnl(item: Record<string, unknown>): number | null {
  for (const key of ['profit', 'pnl', 'floating_profit', 'floating_pnl', 'profit_loss']) {
    const value = item[key];
    const n = typeof value === 'number' ? value : Number(typeof value === 'string' ? value : NaN);
    if (Number.isFinite(n)) return n;
  }
  return null;
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

function normalizeScalar(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  return undefined;
}

function findBalanceValue(value: unknown, depth = 0): string | undefined {
  if (depth > 12 || value === null || value === undefined) {
    return undefined;
  }

  // A plain string encountered during recursive traversal is NOT assumed
  // to be a balance: account_id is also commonly a numeric string.
  // Only parse it when it contains a JSON-encoded object/array.
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed !== value && typeof parsed === 'object' && parsed !== null) {
        return findBalanceValue(parsed, depth + 1);
      }
    } catch {
      // Not JSON; ignore it during recursive traversal.
    }
    return undefined;
  }

  if (typeof value !== 'object') {
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

  // First pass: the API's actual account response uses the field name
  // "balance". Accept numeric/string scalar values and common wrapper
  // objects such as { amount: ... } without changing the HTTP request.
  for (const [key, candidate] of Object.entries(record)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (normalizedKey === 'balance' || normalizedKey === 'accountbalance') {
      const scalar = normalizeScalar(candidate);
      if (scalar !== undefined) return scalar;

      if (candidate && typeof candidate === 'object') {
        const nested = candidate as Record<string, unknown>;
        for (const nestedKey of ['amount', 'value', 'balance']) {
          const nestedScalar = normalizeScalar(nested[nestedKey]);
          if (nestedScalar !== undefined) return nestedScalar;
        }
      }
    }
  }

  // Second pass: preserve compatibility with wrapped responses such as
  // { data: { account: { balance: ... } } }.
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

  // IMPORTANT: /v1/configuration/accounts/{account_id}/account returns
  // account configuration/settings. It does NOT contain the live balance.
  // Exness exposes the current balance in the trading state snapshot:
  // /v1/trading/accounts/{account_id}/snapshot -> account_state.balance
  const snapshotPath =
    `/v1/trading/accounts/${encodeURIComponent(c.accountId.trim())}/snapshot`;

  const snapshot = await getJson<Record<string, unknown>>(
    accessPoint,
    snapshotPath,
    c,
  );

  const accountState =
    snapshot.account_state &&
    typeof snapshot.account_state === 'object'
      ? snapshot.account_state as Record<string, unknown>
      : undefined;

  const balance = accountState
    ? normalizeScalar(accountState.balance)
    : undefined;
  const equity = accountState
    ? normalizeScalar(accountState.equity)
    : undefined;
  const usedMargin = accountState
    ? normalizeScalar(accountState.used_margin)
    : undefined;

  return {
    balance,
    equity,
    usedMargin,
    raw: snapshot,
  };
}


export type TradingHistoryMode = 'active' | 'past';

async function getLiveTradingState(
  c: Credentials,
  accessPoint: string,
): Promise<{ positions: Record<string, unknown>[]; activeOrders: Record<string, unknown>[] }> {
  const path = `/v1/server-events/accounts/${encodeURIComponent(c.accountId.trim())}/ws/events`;
  // Match the proven positions.ts implementation: the WebSocket handshake
  // uses the phone's current timestamp directly, without REST clock offset.
  const signed = buildSignedHeadersAtTimestamp(c, path, Date.now());
  const wsUrl = accessPoint.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '') + path;

  return await new Promise((resolve, reject) => {
    const ws = new (WebSocket as unknown as {
      new (url: string, protocols?: string | string[], options?: { headers: Record<string, string> }): WebSocket;
    })(wsUrl, 'exness-ws-protocol', { headers: signed.headers });

    let settled = false;
    const finish = (result: { positions: Record<string, unknown>[]; activeOrders: Record<string, unknown>[] }) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve(result);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timeout = setTimeout(() => fail(new Error('Tiempo agotado esperando el snapshot de posiciones de Exness.')), 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 'tinchodoko-history-positions',
        subscribe: { event: 'transactions' },
      }));
    };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.event_type !== 'trading_state_snapshot') return;
        const payload = message.payload && typeof message.payload === 'object'
          ? message.payload as Record<string, unknown>
          : {};
        const positions = asRecords(payload.positions);
        const orders = asRecords(payload.orders);
        clearTimeout(timeout);
        finish({ positions, activeOrders: orders });
      } catch {
        // Ignore non-JSON or unrelated frames until the trading snapshot arrives.
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      fail(new Error('No se pudo abrir el flujo de posiciones de Exness.'));
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      if (!settled) fail(new Error('Exness cerró el flujo de posiciones antes de entregar el snapshot.'));
    };
  });
}

export function getFloatingPnl(item: Record<string, unknown>): number | null {
  return extractFloatingPnl(item);
}

export type TradingHistoryData = {
  positions: Record<string, unknown>[];
  activeOrders: Record<string, unknown>[];
  pastOrders: Record<string, unknown>[];
  deals: Record<string, unknown>[];
};

type HistoryPage = {
  items?: Array<Record<string, unknown>>;
  next_cursor?: string;
  has_more?: boolean;
};

type HistoryLimit = {
  api_operation_id?: string;
  limits?: { history_age_days?: number; history_range_days?: number };
};

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> =>
        !!item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

async function getHistoryJson<T>(
  host: string,
  path: string,
  c: Credentials,
): Promise<T> {
  const url = host.replace(/\/$/, '') + path;
  // HISTORIAL signs exactly like the proven balance.ts/positions.ts code.
  // Keep the server-clock calibration out of this stricter history flow.
  const signed = buildSignedHeadersAtTimestamp(c, path, Date.now());
  const requestStartedAt = Date.now();
  const res = await fetch(url, {
    method: 'GET',
    headers: signed.headers,
    redirect: 'error',
  });
  const responseReceivedAt = Date.now();
  const serverDate = res.headers.get('date');
  const text = await res.text();
  if (!res.ok) {
    const roundTripMs = responseReceivedAt - requestStartedAt;
    const query = path.includes('?') ? path.slice(path.indexOf('?') + 1) : '';
    const params = new URLSearchParams(query);
    const range = params.has('from') || params.has('to')
      ? ` | from=${params.get('from') ?? 'no enviado'} | to=${params.get('to') ?? 'no enviado'}`
      : '';
    const diagnostics = [
      `endpoint=${path.split('?')[0]}`,
      `timestamp enviado=${signed.timestamp}`,
      `hora local al enviar=${requestStartedAt}`,
      `hora local al recibir=${responseReceivedAt}`,
      `tiempo de solicitud=${roundTripMs} ms`,
      serverDate ? `fecha del servidor=${serverDate}` : 'fecha del servidor=no disponible',
    ].join(' | ');
    throw new Error(`HTTP ${res.status}: ${text}\\nDiagnóstico HISTORIAL: ${diagnostics}${range}`);
  }
  return JSON.parse(text) as T;
}
async function fetchHistoryPages(
  host: string,
  c: Credentials,
  endpoint: 'orders' | 'deals',
  from: Date,
  to: Date,
): Promise<Record<string, unknown>[]> {
  const result: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  do {
    const params = cursor
      ? new URLSearchParams({ cursor, limit: '200' })
      : new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), limit: '200' });
    const path = `/v1/history/accounts/${encodeURIComponent(c.accountId.trim())}/${endpoint}?${params.toString()}`;
    // History endpoints must use the proven direct Date.now() timestamp.
    // Do not reuse the generic calibrated GET helper here.
    const page = await getHistoryJson<HistoryPage>(host, path, c);
    result.push(...(page.items ?? []));
    cursor = page.next_cursor;
  } while (cursor);
  return result;
}

/**
 * Read-only history loader. Current open positions and pending orders come
 * from the same trading snapshot used by positions.ts. Closed orders/deals
 * are fetched only within the account-specific history limits returned by Exness.
 */
export async function getTradingHistory(
  c: Credentials,
  accessPoint: string,
  mode: TradingHistoryMode = 'active',
): Promise<TradingHistoryData> {
  if (!accessPoint.trim()) throw new Error('No hay Access Point. Conectá la cuenta primero.');

  // ACTIVAS: use the same signed WebSocket snapshot proven by positions.ts.
  // This avoids the stricter REST timestamp window used by history endpoints.
  if (mode === 'active') {
    const live = await getLiveTradingState(c, accessPoint);
    return {
      positions: live.positions,
      activeOrders: live.activeOrders,
      pastOrders: [],
      deals: [],
    };
  }

  const accountId = encodeURIComponent(c.accountId.trim());
  const [snapshot, limitsResponse] = await Promise.all([
    getHistoryJson<Record<string, unknown>>(
      accessPoint,
      `/v1/trading/accounts/${accountId}/snapshot`,
      c,
    ),
    getHistoryJson<{ limits?: { rest?: { methods?: HistoryLimit[] } } }>(
      accessPoint,
      `/v1/configuration/accounts/${accountId}/limits`,
      c,
    ),
  ]);

  const methods = limitsResponse.limits?.rest?.methods ?? [];
  const ordersLimits = methods.find(item => item.api_operation_id === 'getOrdersHistory')?.limits;
  const dealsLimits = methods.find(item => item.api_operation_id === 'getDealsHistory')?.limits;
  const ageDays = Math.min(
    ordersLimits?.history_age_days ?? 0,
    dealsLimits?.history_age_days ?? 0,
  );
  const rangeDays = Math.min(
    ordersLimits?.history_range_days ?? 0,
    dealsLimits?.history_range_days ?? 0,
  );

  if (!Number.isFinite(ageDays) || ageDays < 1 || !Number.isFinite(rangeDays) || rangeDays < 1) {
    throw new Error('Exness no informó los límites de antigüedad y rango del historial. No se enviaron consultas históricas.');
  }

  // Exness can reject a history window whose upper bound is ahead of its
  // server clock. The phone's clock can differ by a few seconds even when
  // signed GET requests work, so end the requested range 5 seconds in the past.
  // This is only a history-query boundary; signed timestamps remain Date.now().
  const historyEndMs = Date.now() - 5000;
  const start = new Date(historyEndMs - ageDays * 24 * 60 * 60 * 1000);
  const historyEnd = new Date(historyEndMs);
  const maxRangeMs = rangeDays * 24 * 60 * 60 * 1000;
  const pastOrders: Record<string, unknown>[] = [];
  const deals: Record<string, unknown>[] = [];

  for (let cursor = start.getTime(); cursor < historyEnd.getTime();) {
    const next = Math.min(cursor + maxRangeMs, historyEnd.getTime());
    const from = new Date(cursor);
    const to = new Date(next);
    // Keep the two history endpoints sequential. Exness can return
    // REQUEST_RATE_LIMIT when orders and deals are requested simultaneously.
    const ordersPage = await fetchHistoryPages(accessPoint, c, 'orders', from, to);
    pastOrders.push(...ordersPage);
    const dealsPage = await fetchHistoryPages(accessPoint, c, 'deals', from, to);
    deals.push(...dealsPage);
    cursor = next;
  }

  const payload = snapshot.payload && typeof snapshot.payload === 'object'
    ? snapshot.payload as Record<string, unknown>
    : snapshot;
  const positions = asRecords(payload.positions ?? snapshot.positions);
  const orders = asRecords(payload.orders ?? snapshot.orders);
  return {
    positions,
    activeOrders: orders,
    pastOrders,
    deals: deals.filter(item => {
      const deal = item.deal && typeof item.deal === 'object'
        ? item.deal as Record<string, unknown>
        : item;
      const type = String(deal.type ?? '').toLowerCase();
      return type === 'open' || type === 'close';
    }),
  };
}


export type AccountStreamEvent = {
  event_type?: string;
  event_time?: string;
  payload?: {
    account_state?: {
      balance?: unknown;
      equity?: unknown;
      used_margin?: unknown;
    };
  };
};

/**
 * Opens Exness' signed Server Events WebSocket.
 * Authentication signs the GET handshake path, never the subscription JSON.
 * All subscriptions are read-only.
 */
export async function openExnessAccountStream(
  c: Credentials,
  accessPoint: string,
  onAccountState: (state: { balance?: string; equity?: string; usedMargin?: string; at: Date }) => void,
  onStatus?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void,
): Promise<WebSocket> {
  if (!accessPoint.trim()) throw new Error('No hay Access Point para el flujo en tiempo real.');

  const path = `/v1/server-events/accounts/${encodeURIComponent(c.accountId.trim())}/ws/events`;
  const signed = await headers(c, path);
  const wsUrl = accessPoint.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:').replace(/\/$/, '') + path;

  // React Native supports custom headers in the third WebSocket constructor argument.
  const ws = new (WebSocket as unknown as {
    new (url: string, protocols?: string | string[], options?: { headers: Record<string, string> }): WebSocket;
  })(wsUrl, 'exness-ws-protocol', { headers: signed.headers });

  onStatus?.('connecting');
  ws.onopen = () => {
    onStatus?.('connected');
    ws.send(JSON.stringify({
      id: 'tinchodoko-account-state',
      subscribe: { event: 'account_state' },
    }));
    ws.send(JSON.stringify({
      id: 'tinchodoko-transactions',
      subscribe: { event: 'transactions' },
    }));
  };

  ws.onmessage = event => {
    try {
      const message = JSON.parse(String(event.data)) as AccountStreamEvent;
      const state = message.payload?.account_state;
      if (
        (message.event_type === 'account_state_event' ||
          message.event_type === 'trading_state_snapshot' ||
          message.event_type === 'transaction_event') &&
        state
      ) {
        onAccountState({
          balance: normalizeScalar(state.balance),
          equity: normalizeScalar(state.equity),
          usedMargin: normalizeScalar(state.used_margin),
          at: message.event_time ? new Date(message.event_time) : new Date(),
        });
      }
    } catch {
      // Ignore malformed/non-JSON frames; never log credentials or signed headers.
    }
  };
  ws.onerror = () => onStatus?.('error');
  ws.onclose = () => onStatus?.('disconnected');
  return ws;
}
