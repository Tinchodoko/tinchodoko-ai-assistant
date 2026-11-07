import type { KeyObject } from 'node:crypto';
import { loadSigningKey, buildSignedHeaders } from './signing.js';

interface Config { apiKey: string; privateKey: KeyObject; accountId: string; discoveryBaseUrl: string; }

let cachedAP: string | null = null;
let cacheExpiry = 0;

function getConfig(): Config {
  const apiKey = process.env.EXN_API_KEY;
  const pk = process.env.EXN_PRIVATE_KEY;
  const accountId = process.env.EXN_ACCOUNT_ID;
  const discoveryBaseUrl = process.env.EXN_DISCOVERY_BASE_URL;
  if (!apiKey || !pk || !accountId || !discoveryBaseUrl) {
    throw new Error('Missing Exness env vars (EXN_API_KEY, EXN_PRIVATE_KEY, EXN_ACCOUNT_ID, EXN_DISCOVERY_BASE_URL)');
  }
  return { apiKey, privateKey: loadSigningKey(pk), accountId, discoveryBaseUrl };
}

async function getAccessPoint(cfg: Config): Promise<string> {
  if (cachedAP && Date.now() < cacheExpiry) return cachedAP;
  const path = `/v1/trading/access-point?account_id=${cfg.accountId}`;
  const headers = buildSignedHeaders(cfg.apiKey, cfg.privateKey, 'GET', path);
  const res = await fetch(cfg.discoveryBaseUrl + path, {
    method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Discovery failed: HTTP ${res.status}`);
  const data = await res.json() as { access_point?: string };
  if (!data.access_point) throw new Error('No access_point in response');
  cachedAP = new URL(data.access_point).origin;
  cacheExpiry = Date.now() + 5 * 60 * 1000; // cache 5 min
  return cachedAP;
}

export async function exnessRequest<T>(
  method: string,
  path: string,
  body?: object,
  idempotencyKey = '',
): Promise<T> {
  const cfg = getConfig();
  const ap = await getAccessPoint(cfg);
  const bodyStr = body ? JSON.stringify(body) : '';
  const headers = buildSignedHeaders(cfg.apiKey, cfg.privateKey, method, path, bodyStr, idempotencyKey);
  const res = await fetch(ap + path, {
    method, headers,
    body: body ? bodyStr : undefined,
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Exness ${method} ${path} → HTTP ${res.status}: ${msg}`);
  }
  return res.json() as Promise<T>;
}

export const getAccountId = () => process.env.EXN_ACCOUNT_ID!;
