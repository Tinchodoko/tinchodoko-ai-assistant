// config.ts — plantilla local. NO guardar credenciales reales en Git.
export const CONFIG = {
  apiKey: process.env.EXNESS_API_KEY ?? '',
  privateKey: process.env.EXNESS_PRIVATE_KEY ?? '',
  accountId: process.env.EXNESS_ACCOUNT_ID ?? '',
  gatewayBaseUrl: process.env.EXNESS_GATEWAY_URL ?? 'https://api.exness.com',
};