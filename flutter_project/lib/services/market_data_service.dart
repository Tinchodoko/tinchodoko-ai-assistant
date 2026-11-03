import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/market_data.dart';

// ─────────────────────────────────────────────
//  Twelve Data — Servicio de datos de mercado
//  Documentación: https://twelvedata.com/docs
// ─────────────────────────────────────────────
class MarketDataService {
  static const String _baseUrl = 'https://api.twelvedata.com';

  // ── Fetch completo: velas + indicadores ──────
  static Future<MarketSnapshot> fetchSnapshot({
    required String apiKey,
    required String symbol,
    required String interval,
    required List<String> activeIndicators,
    int outputSize = 50,
  }) async {
    // 1️⃣ Fetch velas OHLCV
    final candles = await _fetchCandles(
      apiKey: apiKey,
      symbol: symbol,
      interval: interval,
      outputSize: outputSize,
    );

    // 2️⃣ Fetch indicadores seleccionados en paralelo
    final indicators = await _fetchIndicators(
      apiKey: apiKey,
      symbol: symbol,
      interval: interval,
      activeIndicators: activeIndicators,
    );

    return MarketSnapshot(
      symbol: symbol,
      interval: interval,
      candles: candles,
      indicators: indicators,
      fetchedAt: DateTime.now(),
    );
  }

  // ── Velas OHLCV ─────────────────────────────
  static Future<List<Candle>> _fetchCandles({
    required String apiKey,
    required String symbol,
    required String interval,
    required int outputSize,
  }) async {
    final uri = Uri.parse('$_baseUrl/time_series').replace(queryParameters: {
      'symbol': symbol,
      'interval': interval,
      'outputsize': outputSize.toString(),
      'apikey': apiKey,
    });

    final res = await http.get(uri).timeout(const Duration(seconds: 15));
    if (res.statusCode != 200) {
      throw Exception('Error Twelve Data velas (${res.statusCode})');
    }

    final data = jsonDecode(res.body) as Map<String, dynamic>;
    _checkError(data, 'velas');

    final values = data['values'] as List<dynamic>? ?? [];
    return values
        .map((v) => Candle.fromJson(v as Map<String, dynamic>))
        .toList();
  }

  // ── Indicadores técnicos ─────────────────────
  static Future<IndicatorValues> _fetchIndicators({
    required String apiKey,
    required String symbol,
    required String interval,
    required List<String> activeIndicators,
  }) async {
    double? rsi, atr, ema21, ema50, ema200;
    double? macd, macdSignal, macdHist;
    double? bbUpper, bbMiddle, bbLower;
    double? stochK, stochD, adx, cci, zscore;

    // Lanzamos todas las llamadas en paralelo
    final futures = <Future<void>>[];

    if (activeIndicators.contains('rsi')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'rsi', params: {'time_period': '14'},
      ).then((v) => rsi = v?['rsi']));
    }

    if (activeIndicators.contains('atr')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'atr', params: {'time_period': '14'},
      ).then((v) => atr = v?['atr']));
    }

    if (activeIndicators.contains('ema')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'ema', params: {'time_period': '21'},
      ).then((v) => ema21 = v?['ema']));
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'ema', params: {'time_period': '50'},
      ).then((v) => ema50 = v?['ema']));
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'ema', params: {'time_period': '200'},
      ).then((v) => ema200 = v?['ema']));
    }

    if (activeIndicators.contains('macd')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'macd',
        params: {'fast_period': '12', 'slow_period': '26', 'signal_period': '9'},
      ).then((v) {
        macd = v?['macd'];
        macdSignal = v?['macd_signal'];
        macdHist = v?['macd_hist'];
      }));
    }

    if (activeIndicators.contains('bollinger')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'bbands',
        params: {'time_period': '20', 'sd': '2'},
      ).then((v) {
        bbUpper = v?['upper_band'];
        bbMiddle = v?['middle_band'];
        bbLower = v?['lower_band'];
      }));
    }

    if (activeIndicators.contains('stochastic')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'stoch',
        params: {'fast_k_period': '14', 'slow_d_period': '3'},
      ).then((v) {
        stochK = v?['slow_k'];
        stochD = v?['slow_d'];
      }));
    }

    if (activeIndicators.contains('adx')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'adx', params: {'time_period': '14'},
      ).then((v) => adx = v?['adx']));
    }

    if (activeIndicators.contains('cci')) {
      futures.add(_fetchSingleIndicator(
        apiKey: apiKey, symbol: symbol, interval: interval,
        endpoint: 'cci', params: {'time_period': '20'},
      ).then((v) => cci = v?['cci']));
    }

    // Esperar todas las llamadas
    await Future.wait(futures, eagerError: false);

    // Z-Score se calcula localmente (no lo provee Twelve Data)
    // Usamos el RSI como proxy si está activo
    if (activeIndicators.contains('zscore') && rsi != null) {
      zscore = (rsi! - 50) / 15; // Aproximación normalizada
    }

    return IndicatorValues(
      rsi: rsi, atr: atr,
      ema21: ema21, ema50: ema50, ema200: ema200,
      macd: macd, macdSignal: macdSignal, macdHist: macdHist,
      bbUpper: bbUpper, bbMiddle: bbMiddle, bbLower: bbLower,
      stochK: stochK, stochD: stochD,
      adx: adx, cci: cci, zscore: zscore,
    );
  }

  // ── Llamada genérica a un indicador ─────────
  static Future<Map<String, double?>?> _fetchSingleIndicator({
    required String apiKey,
    required String symbol,
    required String interval,
    required String endpoint,
    Map<String, String>? params,
  }) async {
    try {
      final queryParams = {
        'symbol': symbol,
        'interval': interval,
        'outputsize': '1',
        'apikey': apiKey,
        ...?params,
      };
      final uri = Uri.parse('$_baseUrl/$endpoint')
          .replace(queryParameters: queryParams);

      final res = await http.get(uri).timeout(const Duration(seconds: 10));
      if (res.statusCode != 200) return null;

      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (data['status'] == 'error') return null;

      final values = data['values'] as List<dynamic>?;
      if (values == null || values.isEmpty) return null;

      final latest = values.first as Map<String, dynamic>;
      return latest.map((k, v) =>
          MapEntry(k, double.tryParse(v?.toString() ?? '')));
    } catch (_) {
      return null;
    }
  }

  // ── Validación de errores de la API ─────────
  static void _checkError(Map<String, dynamic> data, String context) {
    if (data['status'] == 'error') {
      final msg = data['message']?.toString() ?? 'Error desconocido';
      throw Exception('Twelve Data error ($context): $msg');
    }
  }

  // ── Lista de pares soportados por categoría ──
  static const Map<String, List<String>> symbolsByCategory = {
    'Forex Mayores': [
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
      'AUD/USD', 'USD/CAD', 'NZD/USD',
    ],
    'Forex Menores': [
      'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY',
      'EUR/AUD', 'GBP/AUD', 'CAD/JPY',
    ],
    'Metales': [
      'XAU/USD', 'XAG/USD', 'XPT/USD',
    ],
    'Índices': [
      'SPX', 'NDX', 'DJI', 'DAX', 'FTSE',
    ],
    'Crypto': [
      'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD',
    ],
  };

  // ── Intervalos disponibles ───────────────────
  static const List<Map<String, String>> intervals = [
    {'value': '1min',  'label': 'M1'},
    {'value': '5min',  'label': 'M5'},
    {'value': '15min', 'label': 'M15'},
    {'value': '30min', 'label': 'M30'},
    {'value': '1h',    'label': 'H1'},
    {'value': '4h',    'label': 'H4'},
    {'value': '1day',  'label': 'D1'},
    {'value': '1week', 'label': 'W1'},
  ];
}
