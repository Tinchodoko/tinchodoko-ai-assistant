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
        serverClockOffsetMs = Math.round(serverTime - requestMidpoint);
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
  const signed = await headers(c, path);
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
    const page = await getJson<HistoryPage>(host, path, c);
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
    getJson<Record<string, unknown>>(
      accessPoint,
      `/v1/trading/accounts/${accountId}/snapshot`,
      c,
    ),
    getJson<{ limits?: { rest?: { methods?: HistoryLimit[] } } }>(
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

  const now = new Date();
  const start = new Date(now.getTime() - ageDays * 24 * 60 * 60 * 1000);
  const maxRangeMs = rangeDays * 24 * 60 * 60 * 1000;
  const pastOrders: Record<string, unknown>[] = [];
  const deals: Record<string, unknown>[] = [];

  for (let cursor = start.getTime(); cursor < now.getTime();) {
    const next = Math.min(cursor + maxRangeMs, now.getTime());
    const from = new Date(cursor);
    const to = new Date(next);
    const [ordersPage, dealsPage] = await Promise.all([
      fetchHistoryPages(accessPoint, c, 'orders', from, to),
      fetchHistoryPages(accessPoint, c, 'deals', from, to),
    ]);
    pastOrders.push(...ordersPage);
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
