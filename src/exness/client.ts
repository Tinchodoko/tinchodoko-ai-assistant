import { loadSigningKey, signedGetHeaders, baseUrl } from './signing.ts';
import type { KeyObject } from 'node:crypto';

export interface ExnessTraderConfig {
  apiKey: string;
  privateKey: string;
  accountId: string;
  discoveryBaseUrl: string;
  timeoutMs?: number;
}

export interface ExnessConnectionResult {
  accessPoint: string;
  account: Record<string, unknown>;
}

function validateAccountId(accountId: string): void {
  if (!/^[1-9][0-9]*$/.test(accountId) || BigInt(accountId) > 18446744073709551615n) {
    throw new Error('EXN_ACCOUNT_ID must be a positive uint64 decimal string');
  }
}

export class ExnessTraderClient {
  private readonly apiKey: string;
  private readonly accountId: string;
  private readonly gateway: string;
  private readonly privateKey: KeyObject;
  private readonly timeoutMs: number;

  constructor(config: ExnessTraderConfig) {
    if (!config.apiKey.trim()) throw new Error('EXN_API_KEY is required');
    validateAccountId(config.accountId.trim());

    this.apiKey = config.apiKey.trim();
    this.accountId = config.accountId.trim();
    this.gateway = baseUrl(config.discoveryBaseUrl);
    this.privateKey = loadSigningKey(config.privateKey);
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  private async getJson<T>(host: string, pathWithQuery: string): Promise<T> {
    const response = await fetch(host + pathWithQuery, {
      method: 'GET',
      headers: signedGetHeaders(this.apiKey, this.privateKey, pathWithQuery),
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await response.text();
    let data: unknown = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Exness returned non-JSON HTTP ${response.status}`);
    }

    if (!response.ok) {
      const message =
        typeof data === 'object' && data !== null && 'error_message' in data
          ? String((data as { error_message?: unknown }).error_message)
          : `HTTP ${response.status}`;
      throw new Error(`Exness request failed: ${message}`);
    }

    return data as T;
  }

  async discoverAccessPoint(): Promise<string> {
    const discovery = await this.getJson<{ access_point?: unknown }>(
      this.gateway,
      `/v1/trading/access-point?account_id=${this.accountId}`,
    );

    if (typeof discovery.access_point !== 'string' || !discovery.access_point) {
      throw new Error('Discovery response is missing access_point');
    }

    return baseUrl(discovery.access_point);
  }

  async getAccount(accessPoint: string): Promise<Record<string, unknown>> {
    return this.getJson<Record<string, unknown>>(
      baseUrl(accessPoint),
      `/v1/configuration/accounts/${this.accountId}/account`,
    );
  }

  async connect(): Promise<ExnessConnectionResult> {
    const accessPoint = await this.discoverAccessPoint();
    const account = await this.getAccount(accessPoint);
    return { accessPoint, account };
  }
}
