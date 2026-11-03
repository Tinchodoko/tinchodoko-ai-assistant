// ─────────────────────────────────────────────
//  Modelos de datos de mercado e indicadores
// ─────────────────────────────────────────────

class Candle {
  final String datetime;
  final double open;
  final double high;
  final double low;
  final double close;
  final double volume;

  const Candle({
    required this.datetime,
    required this.open,
    required this.high,
    required this.low,
    required this.close,
    required this.volume,
  });

  factory Candle.fromJson(Map<String, dynamic> j) => Candle(
        datetime: j['datetime']?.toString() ?? '',
        open: _d(j['open']),
        high: _d(j['high']),
        low: _d(j['low']),
        close: _d(j['close']),
        volume: _d(j['volume']),
      );

  static double _d(dynamic v) =>
      v == null ? 0.0 : double.tryParse(v.toString()) ?? 0.0;
}

// ── Indicadores calculados ────────────────────
class IndicatorValues {
  final double? rsi;
  final double? atr;
  final double? ema21;
  final double? ema50;
  final double? ema200;
  final double? macd;
  final double? macdSignal;
  final double? macdHist;
  final double? bbUpper;
  final double? bbMiddle;
  final double? bbLower;
  final double? stochK;
  final double? stochD;
  final double? zscore;
  final double? adx;
  final double? cci;

  const IndicatorValues({
    this.rsi,
    this.atr,
    this.ema21,
    this.ema50,
    this.ema200,
    this.macd,
    this.macdSignal,
    this.macdHist,
    this.bbUpper,
    this.bbMiddle,
    this.bbLower,
    this.stochK,
    this.stochD,
    this.zscore,
    this.adx,
    this.cci,
  });
}

// ── Snapshot completo de un par/TF ───────────
class MarketSnapshot {
  final String symbol;
  final String interval;
  final List<Candle> candles;
  final IndicatorValues indicators;
  final DateTime fetchedAt;

  const MarketSnapshot({
    required this.symbol,
    required this.interval,
    required this.candles,
    required this.indicators,
    required this.fetchedAt,
  });

  Candle? get latest => candles.isNotEmpty ? candles.first : null;

  /// Genera un resumen de texto para enviar a las IAs
  String toPromptContext({required List<String> activeIndicators}) {
    final c = latest;
    if (c == null) return 'Sin datos disponibles.';

    final sb = StringBuffer();
    sb.writeln('=== DATOS DE MERCADO EN TIEMPO REAL ===');
    sb.writeln('Par: $symbol | Temporalidad: $interval');
    sb.writeln('Última vela: ${c.datetime}');
    sb.writeln('Open: ${c.open.toStringAsFixed(5)} | '
        'High: ${c.high.toStringAsFixed(5)} | '
        'Low: ${c.low.toStringAsFixed(5)} | '
        'Close: ${c.close.toStringAsFixed(5)}');
    sb.writeln('');
    sb.writeln('=== INDICADORES TÉCNICOS ===');

    final ind = indicators;
    if (activeIndicators.contains('rsi') && ind.rsi != null) {
      sb.writeln('RSI(14): ${ind.rsi!.toStringAsFixed(2)}'
          '${ind.rsi! > 70 ? " ⚠️ Sobrecomprado" : ind.rsi! < 30 ? " ⚠️ Sobrevendido" : " (Neutral)"}');
    }
    if (activeIndicators.contains('atr') && ind.atr != null) {
      sb.writeln('ATR(14): ${ind.atr!.toStringAsFixed(5)} (volatilidad actual)');
    }
    if (activeIndicators.contains('ema') && ind.ema21 != null) {
      sb.writeln('EMA21: ${ind.ema21!.toStringAsFixed(5)}');
      if (ind.ema50 != null) sb.writeln('EMA50: ${ind.ema50!.toStringAsFixed(5)}');
      if (ind.ema200 != null) sb.writeln('EMA200: ${ind.ema200!.toStringAsFixed(5)}');
      if (ind.ema21 != null && ind.ema50 != null) {
        sb.writeln(ind.ema21! > ind.ema50!
            ? '→ EMA21 > EMA50: Tendencia ALCISTA'
            : '→ EMA21 < EMA50: Tendencia BAJISTA');
      }
    }
    if (activeIndicators.contains('macd') && ind.macd != null) {
      sb.writeln('MACD: ${ind.macd!.toStringAsFixed(5)} | '
          'Signal: ${ind.macdSignal?.toStringAsFixed(5) ?? "N/A"} | '
          'Hist: ${ind.macdHist?.toStringAsFixed(5) ?? "N/A"}');
      if (ind.macdHist != null) {
        sb.writeln(ind.macdHist! > 0
            ? '→ Histograma positivo: momentum ALCISTA'
            : '→ Histograma negativo: momentum BAJISTA');
      }
    }
    if (activeIndicators.contains('bollinger') && ind.bbUpper != null) {
      sb.writeln('Bollinger: Upper ${ind.bbUpper!.toStringAsFixed(5)} | '
          'Middle ${ind.bbMiddle?.toStringAsFixed(5) ?? "N/A"} | '
          'Lower ${ind.bbLower?.toStringAsFixed(5) ?? "N/A"}');
    }
    if (activeIndicators.contains('stochastic') && ind.stochK != null) {
      sb.writeln('Stochastic: K=${ind.stochK!.toStringAsFixed(2)} D=${ind.stochD?.toStringAsFixed(2) ?? "N/A"}');
    }
    if (activeIndicators.contains('adx') && ind.adx != null) {
      sb.writeln('ADX(14): ${ind.adx!.toStringAsFixed(2)}'
          '${ind.adx! > 25 ? " (Tendencia fuerte)" : " (Tendencia débil)"}');
    }
    if (activeIndicators.contains('cci') && ind.cci != null) {
      sb.writeln('CCI(20): ${ind.cci!.toStringAsFixed(2)}');
    }
    if (activeIndicators.contains('zscore') && ind.zscore != null) {
      sb.writeln('Z-Score: ${ind.zscore!.toStringAsFixed(2)}'
          '${ind.zscore!.abs() > 2 ? " ⚠️ Desviación extrema" : ""}');
    }

    // Últimas 5 velas para contexto
    sb.writeln('');
    sb.writeln('=== ÚLTIMAS 5 VELAS ===');
    for (final candle in candles.take(5)) {
      sb.writeln('${candle.datetime}: '
          'O=${candle.open.toStringAsFixed(5)} '
          'H=${candle.high.toStringAsFixed(5)} '
          'L=${candle.low.toStringAsFixed(5)} '
          'C=${candle.close.toStringAsFixed(5)}');
    }

    sb.writeln('');
    sb.writeln('=== FIN DE DATOS ===');
    return sb.toString();
  }
}

// ── Resultado del Panel Multi-IA ─────────────
class PanelResult {
  final String providerId;
  final String providerName;
  final String response;
  final String? signal;      // BUY / SELL / WAIT
  final double? entryPrice;
  final double? stopLoss;
  final double? takeProfit;
  final bool isLoading;
  final String? error;

  const PanelResult({
    required this.providerId,
    required this.providerName,
    required this.response,
    this.signal,
    this.entryPrice,
    this.stopLoss,
    this.takeProfit,
    this.isLoading = false,
    this.error,
  });

  PanelResult copyWith({
    String? response,
    String? signal,
    double? entryPrice,
    double? stopLoss,
    double? takeProfit,
    bool? isLoading,
    String? error,
  }) =>
      PanelResult(
        providerId: providerId,
        providerName: providerName,
        response: response ?? this.response,
        signal: signal ?? this.signal,
        entryPrice: entryPrice ?? this.entryPrice,
        stopLoss: stopLoss ?? this.stopLoss,
        takeProfit: takeProfit ?? this.takeProfit,
        isLoading: isLoading ?? this.isLoading,
        error: error ?? this.error,
      );
}

// ── Consenso final del ejecutor ───────────────
class ConsensusResult {
  final String signal;        // BUY / SELL / WAIT
  final double? entryPrice;
  final double? stopLoss;
  final double? takeProfit;
  final int agreementCount;
  final int totalCount;
  final int confidencePercent;
  final String reasoning;
  final String executorResponse;

  const ConsensusResult({
    required this.signal,
    this.entryPrice,
    this.stopLoss,
    this.takeProfit,
    required this.agreementCount,
    required this.totalCount,
    required this.confidencePercent,
    required this.reasoning,
    required this.executorResponse,
  });

  String get agreementLabel => '$agreementCount/$totalCount IAs de acuerdo';

  String get statusLabel {
    if (confidencePercent >= 85) return '✅ Señal fuerte — entrada recomendada';
    if (confidencePercent >= 65) return '🟡 Señal moderada — operar con precaución';
    if (confidencePercent >= 50) return '🟠 Señal mixta — mejor esperar';
    return '🔴 Sin consenso — NO operar';
  }
}
