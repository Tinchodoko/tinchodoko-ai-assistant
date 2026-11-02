import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isKeyConfigured,
  getModelsForProvider,
  calculateAccountEquity,
  parseTradeSignal,
  AI_PROVIDERS
} from './tradeLogic.ts';

test('isKeyConfigured validates API key minimum length and trimmed state', () => {
  assert.equal(isKeyConfigured(''), false);
  assert.equal(isKeyConfigured(null), false);
  assert.equal(isKeyConfigured(undefined), false);
  assert.equal(isKeyConfigured('   12345  '), false);
  assert.equal(isKeyConfigured('gsk_valid_api_key_test_123'), true);
  assert.equal(isKeyConfigured('AIzaSy123456789'), true);
});

test('getModelsForProvider returns correct models for each provider', () => {
  const geminiModels = getModelsForProvider('gemini');
  assert.ok(geminiModels.includes('gemini-2.5-flash'));
  assert.ok(geminiModels.length >= 3);

  const groqModels = getModelsForProvider('groq');
  assert.ok(groqModels.includes('llama-3.3-70b-versatile'));

  const unknownModels = getModelsForProvider('non_existent');
  assert.deepEqual(unknownModels, []);
});

test('calculateAccountEquity correctly sums balance and open positions PnL', () => {
  const balance = 10000;
  const positions = [
    {
      id: '1',
      pair: 'EURUSD',
      direction: 'BUY' as const,
      lots: 0.5,
      entryPrice: 1.0850,
      currentPrice: 1.0870,
      pnl: 100.50,
      stopLoss: 1.0800,
      takeProfit: 1.0950,
      openTime: '2026-11-01 10:00'
    },
    {
      id: '2',
      pair: 'XAUUSD',
      direction: 'SELL' as const,
      lots: 0.2,
      entryPrice: 2740.00,
      currentPrice: 2745.00,
      pnl: -50.25,
      stopLoss: 2760.00,
      takeProfit: 2710.00,
      openTime: '2026-11-01 11:30'
    }
  ];

  const equity = calculateAccountEquity(balance, positions);
  assert.equal(equity, 10050.25);
});

test('parseTradeSignal detects BUY and SELL directives and asset pairs', () => {
  const buySignal = parseTradeSignal('Señal de COMPRA fuerte en EURUSD por ruptura de resistencia.');
  assert.equal(buySignal.direction, 'BUY');
  assert.equal(buySignal.pair, 'EURUSD');

  const sellSignal = parseTradeSignal('Alerta SELL para XAUUSD tras patrón de vela envolvente.');
  assert.equal(sellSignal.direction, 'SELL');
  assert.equal(sellSignal.pair, 'XAUUSD');
});
