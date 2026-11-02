export interface AIProviderConfig {
  id: string;
  name: string;
  keyPrefix: string;
  models: string[];
  defaultModel: string;
}

export const AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: 'groq',
    name: 'Groq',
    keyPrefix: 'gsk_',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'deepseek-r1-distill-llama-70b'
    ],
    defaultModel: 'llama-3.3-70b-versatile'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    keyPrefix: 'AIzaSy',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ],
    defaultModel: 'gemini-2.5-flash'
  },
  {
    id: 'claude',
    name: 'Claude',
    keyPrefix: 'sk-ant-',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229'
    ],
    defaultModel: 'claude-3-5-sonnet-20241022'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: 'sk-',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'o3-mini'
    ],
    defaultModel: 'gpt-4o'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: 'sk-or-',
    models: [
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.5-flash'
    ],
    defaultModel: 'anthropic/claude-3.5-sonnet'
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keyPrefix: '',
    models: [
      'mistral-large-latest',
      'mistral-small-latest',
      'codestral-latest'
    ],
    defaultModel: 'mistral-large-latest'
  }
];

export interface TradeOperation {
  id: string;
  date: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  result: string;
  pnl: number;
  status: 'Confirmada' | 'Rechazada';
  notes?: string;
}

export interface Position {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  lots: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  stopLoss: number;
  takeProfit: number;
  openTime: string;
}

export function isKeyConfigured(key: string | undefined | null): boolean {
  if (!key) return false;
  return key.trim().length >= 8;
}

export function getModelsForProvider(providerId: string): string[] {
  const provider = AI_PROVIDERS.find(p => p.id.toLowerCase() === providerId.toLowerCase());
  return provider ? provider.models : [];
}

export function calculateAccountEquity(balance: number, positions: Position[]): number {
  const openPnL = positions.reduce((acc, pos) => acc + pos.pnl, 0);
  return Number((balance + openPnL).toFixed(2));
}

export function parseTradeSignal(text: string): Partial<TradeOperation> {
  const upper = text.toUpperCase();
  const direction: 'BUY' | 'SELL' = upper.includes('COMPRA') || upper.includes('BUY') ? 'BUY' : 'SELL';
  
  // Extract pair
  const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'NAS100', 'US30'];
  let pair = 'EURUSD';
  for (const p of pairs) {
    if (upper.includes(p)) {
      pair = p;
      break;
    }
  }

  // Extract prices if present or default
  const priceRegex = /ENTRADA|ENTRY[:\s]+([0-9]+\.?[0-9]*)/i;
  const matchPrice = text.match(priceRegex);
  const entryPrice = matchPrice ? parseFloat(matchPrice[1]) : (pair.includes('JPY') ? 152.40 : pair.includes('XAU') ? 2735.50 : 1.0850);

  return {
    pair,
    direction,
    entryPrice,
    lots: 0.20,
    stopLoss: direction === 'BUY' ? Number((entryPrice * 0.995).toFixed(4)) : Number((entryPrice * 1.005).toFixed(4)),
    takeProfit: direction === 'BUY' ? Number((entryPrice * 1.01).toFixed(4)) : Number((entryPrice * 0.99).toFixed(4)),
  };
}
