import 'dart:math' as math;

import '../models/market_data.dart';
import 'exness_service.dart';

class ExnessMarketDataService {
  static const List<Map<String, String>> intervals = [
    {'value': 'M1', 'label': 'M1'},
    {'value': 'M5', 'label': 'M5'},
    {'value': 'M15', 'label': 'M15'},
    {'value': 'M30', 'label': 'M30'},
    {'value': 'H1', 'label': 'H1'},
    {'value': 'H4', 'label': 'H4'},
    {'value': 'D1', 'label': 'D1'},
    {'value': 'W1', 'label': 'W1'},
  ];

  static Future<MarketSnapshot> fetchSnapshot({
    required ExnessService exnessService,
    required String instrument,
    required String timeframe,
    required List<String> activeIndicators,
  }) async {
    final candles = await exnessService.fetchMarketCandles(
      instrument: instrument,
      timeframe: timeframe,
    );
    if (candles.length < 20) {
      throw StateError('Exness returned fewer than 20 candles; technical indicators cannot be calculated reliably.');
    }
    return MarketSnapshot(
      symbol: instrument,
      interval: timeframe,
      candles: candles,
      indicators: _calculateIndicators(candles, activeIndicators),
      fetchedAt: DateTime.now(),
    );
  }

  static IndicatorValues _calculateIndicators(List<Candle> candles, List<String> active) {
    final closes = candles.map((c) => c.close).toList();
    final highs = candles.map((c) => c.high).toList();
    final lows = candles.map((c) => c.low).toList();
    double? rsi, atr, ema21, ema50, ema200, macd, macdSignal, macdHist;
    double? bbUpper, bbMiddle, bbLower, stochK, stochD, adx, cci, zscore;

    if (active.contains('rsi')) rsi = _rsi(closes, 14);
    if (active.contains('atr')) atr = _atr(candles, 14);
    if (active.contains('ema')) {
      ema21 = _ema(closes, 21);
      ema50 = _ema(closes, 50);
      ema200 = closes.length >= 200 ? _ema(closes, 200) : null;
    }
    if (active.contains('macd')) {
      final fast = _emaSeries(closes, 12);
      final slow = _emaSeries(closes, 26);
      final line = List<double>.generate(closes.length, (i) => fast[i] - slow[i]);
      final signal = _emaSeries(line, 9);
      macd = line.last;
      macdSignal = signal.last;
      macdHist = macd - macdSignal;
    }
    if (active.contains('bollinger')) {
      final window = closes.sublist(closes.length - 20);
      final mean = _mean(window);
      final deviation = _stdDev(window, mean);
      bbMiddle = mean;
      bbUpper = mean + 2 * deviation;
      bbLower = mean - 2 * deviation;
    }
    if (active.contains('stochastic')) {
      final kValues = <double>[];
      final start = closes.length > 3 ? closes.length - 3 : 13;
      for (var i = start; i < closes.length; i++) {
        final high = highs.sublist(i - 13, i + 1).reduce((a, b) => a > b ? a : b);
        final low = lows.sublist(i - 13, i + 1).reduce((a, b) => a < b ? a : b);
        kValues.add(high == low ? 50 : ((closes[i] - low) / (high - low)) * 100);
      }
      stochK = kValues.last;
      stochD = _mean(kValues);
    }
    if (active.contains('adx')) adx = _adx(candles, 14);
    if (active.contains('cci')) {
      final typical = List<double>.generate(candles.length, (i) => (highs[i] + lows[i] + closes[i]) / 3);
      final window = typical.sublist(typical.length - 20);
      final mean = _mean(window);
      final deviation = window.map((v) => (v - mean).abs()).reduce((a, b) => a + b) / 20;
      cci = deviation == 0 ? 0 : (window.last - mean) / (0.015 * deviation);
    }
    if (active.contains('zscore')) {
      final window = closes.sublist(closes.length - 20);
      final mean = _mean(window);
      final deviation = _stdDev(window, mean);
      zscore = deviation == 0 ? 0 : (closes.last - mean) / deviation;
    }

    return IndicatorValues(
      rsi: rsi, atr: atr, ema21: ema21, ema50: ema50, ema200: ema200,
      macd: macd, macdSignal: macdSignal, macdHist: macdHist,
      bbUpper: bbUpper, bbMiddle: bbMiddle, bbLower: bbLower,
      stochK: stochK, stochD: stochD, adx: adx, cci: cci, zscore: zscore,
    );
  }

  static double _mean(List<double> values) =>
      values.reduce((a, b) => a + b) / values.length;

  static double _stdDev(List<double> values, double mean) {
    final variance = values.map((v) => math.pow(v - mean, 2).toDouble())
        .reduce((a, b) => a + b) / values.length;
    return math.sqrt(variance);
  }

  static List<double> _emaSeries(List<double> values, int period) {
    final multiplier = 2 / (period + 1);
    final result = <double>[];
    var current = values.first;
    for (final value in values) {
      current = (value * multiplier) + (current * (1 - multiplier));
      result.add(current);
    }
    return result;
  }

  static double _ema(List<double> values, int period) =>
      _emaSeries(values, period).last;

  static double _rsi(List<double> values, int period) {
    var averageGain = 0.0;
    var averageLoss = 0.0;
    for (var i = 1; i <= period; i++) {
      final change = values[i] - values[i - 1];
      if (change >= 0) {
        averageGain += change;
      } else {
        averageLoss -= change;
      }
    }
    averageGain /= period;
    averageLoss /= period;
    for (var i = period + 1; i < values.length; i++) {
      final change = values[i] - values[i - 1];
      final gain = change > 0 ? change : 0.0;
      final loss = change < 0 ? -change : 0.0;
      averageGain = ((averageGain * (period - 1)) + gain) / period;
      averageLoss = ((averageLoss * (period - 1)) + loss) / period;
    }
    if (averageLoss == 0) return averageGain == 0 ? 50 : 100;
    final relativeStrength = averageGain / averageLoss;
    return 100 - (100 / (1 + relativeStrength));
  }

  static double _atr(List<Candle> candles, int period) {
    final ranges = <double>[];
    for (var i = 1; i < candles.length; i++) {
      final previousClose = candles[i - 1].close;
      ranges.add(math.max(
        candles[i].high - candles[i].low,
        math.max(
          (candles[i].high - previousClose).abs(),
          (candles[i].low - previousClose).abs(),
        ),
      ).toDouble());
    }
    var average = _mean(ranges.take(period).toList());
    for (var i = period; i < ranges.length; i++) {
      average = ((average * (period - 1)) + ranges[i]) / period;
    }
    return average;
  }

  static double _adx(List<Candle> candles, int period) {
    final trueRanges = <double>[];
    final positiveMoves = <double>[];
    final negativeMoves = <double>[];
    for (var i = 1; i < candles.length; i++) {
      final current = candles[i];
      final previous = candles[i - 1];
      final upwardMove = current.high - previous.high;
      final downwardMove = previous.low - current.low;
      positiveMoves.add(upwardMove > downwardMove && upwardMove > 0 ? upwardMove : 0);
      negativeMoves.add(downwardMove > upwardMove && downwardMove > 0 ? downwardMove : 0);
      trueRanges.add(math.max(
        current.high - current.low,
        math.max(
          (current.high - previous.close).abs(),
          (current.low - previous.close).abs(),
        ),
      ).toDouble());
    }

    var smoothedTr = trueRanges.take(period).reduce((a, b) => a + b);
    var smoothedPlus = positiveMoves.take(period).reduce((a, b) => a + b);
    var smoothedMinus = negativeMoves.take(period).reduce((a, b) => a + b);
    final dxValues = <double>[];

    for (var i = period - 1; i < trueRanges.length; i++) {
      if (i >= period) {
        smoothedTr = smoothedTr - (smoothedTr / period) + trueRanges[i];
        smoothedPlus = smoothedPlus - (smoothedPlus / period) + positiveMoves[i];
        smoothedMinus = smoothedMinus - (smoothedMinus / period) + negativeMoves[i];
      }
      if (smoothedTr == 0) {
        dxValues.add(0);
        continue;
      }
      final plusDi = 100 * smoothedPlus / smoothedTr;
      final minusDi = 100 * smoothedMinus / smoothedTr;
      final denominator = plusDi + minusDi;
      dxValues.add(denominator == 0 ? 0 : 100 * (plusDi - minusDi).abs() / denominator);
    }

    if (dxValues.isEmpty) return 0;
    var adx = _mean(dxValues.take(period).toList());
    for (var i = period; i < dxValues.length; i++) {
      adx = ((adx * (period - 1)) + dxValues[i]) / period;
    }
    return adx;
  }
}
