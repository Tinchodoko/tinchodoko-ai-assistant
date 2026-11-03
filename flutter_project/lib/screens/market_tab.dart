import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/market_data.dart';
import '../services/market_data_service.dart';
import '../theme/app_theme.dart';

class MarketTab extends StatefulWidget {
  final List<AIProvider> providers;
  final Function(MarketSnapshot) onSnapshotReady;

  const MarketTab({
    super.key,
    required this.providers,
    required this.onSnapshotReady,
  });

  @override
  State<MarketTab> createState() => _MarketTabState();
}

class _MarketTabState extends State<MarketTab> {
  // ── Estado ────────────────────────────────────
  String _selectedCategory = 'Forex Mayores';
  String _selectedSymbol   = 'EUR/USD';
  String _selectedInterval = '15min';
  MarketSnapshot? _snapshot;
  bool _isLoading = false;
  String _error = '';

  // Indicadores activos (por defecto RSI + ATR + EMA)
  final Map<String, bool> _indicators = {
    'rsi':        true,
    'atr':        true,
    'ema':        true,
    'macd':       false,
    'bollinger':  false,
    'stochastic': false,
    'adx':        false,
    'cci':        false,
    'zscore':     false,
  };

  final Map<String, String> _indicatorLabels = {
    'rsi':        'RSI (14)',
    'atr':        'ATR (14)',
    'ema':        'EMA 21/50/200',
    'macd':       'MACD (12/26/9)',
    'bollinger':  'Bollinger Bands',
    'stochastic': 'Stochastic',
    'adx':        'ADX (14)',
    'cci':        'CCI (20)',
    'zscore':     'Z-Score',
  };

  // ── API Key de Twelve Data ────────────────────
  String get _twelveDataKey {
    // Busca en los proveedores si el usuario guardó una key específica
    // o usa la del provider 'twelvedata' si existe
    final p = widget.providers.where((x) => x.id == 'twelvedata').firstOrNull;
    return p?.apiKey ?? '';
  }

  List<String> get _activeIndicatorIds =>
      _indicators.entries.where((e) => e.value).map((e) => e.key).toList();

  // ── Fetch de datos ────────────────────────────
  Future<void> _fetchMarketData() async {
    if (_twelveDataKey.isEmpty) {
      setState(() => _error =
          '⚠️ Agregá tu API Key de Twelve Data en el Tab APIs primero.');
      return;
    }
    if (_activeIndicatorIds.isEmpty) {
      setState(() => _error = '⚠️ Seleccioná al menos un indicador.');
      return;
    }

    setState(() {
      _isLoading = true;
      _error = '';
      _snapshot = null;
    });

    try {
      final snapshot = await MarketDataService.fetchSnapshot(
        apiKey: _twelveDataKey,
        symbol: _selectedSymbol,
        interval: _selectedInterval,
        activeIndicators: _activeIndicatorIds,
      );
      setState(() {
        _snapshot = snapshot;
        _isLoading = false;
      });
      widget.onSnapshotReady(snapshot);
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  // ── UI ────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 16),
            _buildSymbolSelector(),
            const SizedBox(height: 12),
            _buildIntervalSelector(),
            const SizedBox(height: 16),
            _buildIndicatorsCard(),
            const SizedBox(height: 16),
            _buildFetchButton(),
            if (_error.isNotEmpty) ...[
              const SizedBox(height: 12),
              _buildError(),
            ],
            if (_isLoading) ...[
              const SizedBox(height: 24),
              _buildLoading(),
            ],
            if (_snapshot != null) ...[
              const SizedBox(height: 16),
              _buildSnapshotCard(),
            ],
          ],
        ),
      ),
    );
  }

  // ── Header ────────────────────────────────────
  Widget _buildHeader() => Row(
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppTheme.primaryGreen.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.show_chart,
                color: AppTheme.primaryGreen, size: 22),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Datos de Mercado',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.bold,
                      color: AppTheme.textPrimary)),
              Text('Tiempo real vía Twelve Data',
                  style: TextStyle(
                      fontSize: 12, color: AppTheme.textSecondary)),
            ],
          ),
        ],
      );

  // ── Selector de par ───────────────────────────
  Widget _buildSymbolSelector() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.surfaceBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Categoría', style: _labelStyle),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedCategory,
              dropdownColor: AppTheme.surfaceCard,
              decoration: _dropdownDecoration,
              items: MarketDataService.symbolsByCategory.keys
                  .map((c) => DropdownMenuItem(
                        value: c,
                        child: Text(c, style: const TextStyle(color: AppTheme.textPrimary)),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v == null) return;
                setState(() {
                  _selectedCategory = v;
                  _selectedSymbol =
                      MarketDataService.symbolsByCategory[v]!.first;
                });
              },
            ),
            const SizedBox(height: 12),
            Text('Par de divisas / Activo', style: _labelStyle),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              value: _selectedSymbol,
              dropdownColor: AppTheme.surfaceCard,
              decoration: _dropdownDecoration,
              items: (MarketDataService.symbolsByCategory[_selectedCategory] ?? [])
                  .map((s) => DropdownMenuItem(
                        value: s,
                        child: Text(s,
                            style: const TextStyle(
                                color: AppTheme.textPrimary,
                                fontFamily: 'monospace')),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _selectedSymbol = v ?? _selectedSymbol),
            ),
          ],
        ),
      );

  // ── Selector de temporalidad ──────────────────
  Widget _buildIntervalSelector() {
    final intervals = MarketDataService.intervals;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 2, bottom: 8),
          child: Text('Temporalidad', style: _labelStyle),
        ),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: intervals.map((i) {
              final selected = _selectedInterval == i['value'];
              return GestureDetector(
                onTap: () => setState(() => _selectedInterval = i['value']!),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppTheme.primaryGreen
                        : AppTheme.surfaceCard,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: selected
                          ? AppTheme.primaryGreen
                          : AppTheme.surfaceBorder,
                    ),
                  ),
                  child: Text(
                    i['label']!,
                    style: TextStyle(
                      color: selected
                          ? Colors.black
                          : AppTheme.textSecondary,
                      fontWeight: selected
                          ? FontWeight.bold
                          : FontWeight.normal,
                      fontSize: 13,
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }

  // ── Checkboxes de indicadores ─────────────────
  Widget _buildIndicatorsCard() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.surfaceBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.analytics_outlined,
                    color: AppTheme.primaryGreen, size: 18),
                const SizedBox(width: 8),
                Text('Indicadores técnicos',
                    style: TextStyle(
                        color: AppTheme.textPrimary,
                        fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: _indicators.keys.map((id) {
                final active = _indicators[id]!;
                return GestureDetector(
                  onTap: () => setState(() => _indicators[id] = !active),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: active
                          ? AppTheme.primaryGreen.withOpacity(0.15)
                          : AppTheme.surfaceHighlight,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: active
                            ? AppTheme.primaryGreen.withOpacity(0.5)
                            : AppTheme.surfaceBorder,
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          active
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          color: active
                              ? AppTheme.primaryGreen
                              : AppTheme.textSecondary,
                          size: 14,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _indicatorLabels[id] ?? id,
                          style: TextStyle(
                            color: active
                                ? AppTheme.primaryGreen
                                : AppTheme.textSecondary,
                            fontSize: 12,
                            fontWeight: active
                                ? FontWeight.bold
                                : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      );

  // ── Botón de fetch ────────────────────────────
  Widget _buildFetchButton() => SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _isLoading ? null : _fetchMarketData,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primaryGreen,
            foregroundColor: Colors.black,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          icon: const Icon(Icons.radar, size: 20),
          label: Text(
            _isLoading ? 'Obteniendo datos...' : 'Obtener datos de mercado',
            style: const TextStyle(
                fontWeight: FontWeight.bold, fontSize: 15),
          ),
        ),
      );

  // ── Error ─────────────────────────────────────
  Widget _buildError() => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.errorRed.withOpacity(0.1),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: AppTheme.errorRed.withOpacity(0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline,
                color: AppTheme.errorRed, size: 18),
            const SizedBox(width: 8),
            Expanded(
              child: Text(_error,
                  style: const TextStyle(
                      color: AppTheme.errorRed, fontSize: 13)),
            ),
          ],
        ),
      );

  // ── Loading ───────────────────────────────────
  Widget _buildLoading() => Center(
        child: Column(
          children: [
            CircularProgressIndicator(color: AppTheme.primaryGreen),
            const SizedBox(height: 12),
            Text('Obteniendo $_selectedSymbol $_selectedInterval...',
                style: TextStyle(color: AppTheme.textSecondary)),
          ],
        ),
      );

  // ── Card de resultados ────────────────────────
  Widget _buildSnapshotCard() {
    final s = _snapshot!;
    final c = s.latest;
    final ind = s.indicators;
    if (c == null) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
            color: AppTheme.primaryGreen.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Encabezado
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${s.symbol} · ${s.interval.toUpperCase()}',
                  style: const TextStyle(
                      color: AppTheme.primaryGreen,
                      fontWeight: FontWeight.bold,
                      fontSize: 16)),
              Text(
                  '${s.fetchedAt.hour.toString().padLeft(2, '0')}:'
                  '${s.fetchedAt.minute.toString().padLeft(2, '0')}',
                  style: TextStyle(
                      color: AppTheme.textSecondary, fontSize: 12)),
            ],
          ),
          const Divider(color: AppTheme.surfaceBorder, height: 20),

          // Precios OHLC
          _priceRow('Open',  c.open.toStringAsFixed(5)),
          _priceRow('High',  c.high.toStringAsFixed(5),
              color: const Color(0xFF4CAF50)),
          _priceRow('Low',   c.low.toStringAsFixed(5),
              color: AppTheme.errorRed),
          _priceRow('Close', c.close.toStringAsFixed(5),
              bold: true),
          const Divider(color: AppTheme.surfaceBorder, height: 20),

          // Indicadores
          if (_indicators['rsi']! && ind.rsi != null)
            _indicatorRow('RSI (14)', ind.rsi!.toStringAsFixed(2),
                badge: ind.rsi! > 70
                    ? 'OC'
                    : ind.rsi! < 30
                        ? 'OV'
                        : null,
                badgeColor: ind.rsi! > 70
                    ? AppTheme.errorRed
                    : AppTheme.primaryGreen),
          if (_indicators['atr']! && ind.atr != null)
            _indicatorRow('ATR (14)', ind.atr!.toStringAsFixed(5)),
          if (_indicators['ema']! && ind.ema21 != null) ...[
            _indicatorRow('EMA 21', ind.ema21!.toStringAsFixed(5)),
            if (ind.ema50 != null)
              _indicatorRow('EMA 50', ind.ema50!.toStringAsFixed(5),
                  badge: ind.ema21! > ind.ema50! ? '▲' : '▼',
                  badgeColor: ind.ema21! > ind.ema50!
                      ? AppTheme.primaryGreen
                      : AppTheme.errorRed),
            if (ind.ema200 != null)
              _indicatorRow('EMA 200', ind.ema200!.toStringAsFixed(5)),
          ],
          if (_indicators['macd']! && ind.macd != null)
            _indicatorRow('MACD',
                '${ind.macd!.toStringAsFixed(5)} / ${ind.macdSignal?.toStringAsFixed(5) ?? "-"}',
                badge: (ind.macdHist ?? 0) > 0 ? '▲' : '▼',
                badgeColor: (ind.macdHist ?? 0) > 0
                    ? AppTheme.primaryGreen
                    : AppTheme.errorRed),
          if (_indicators['bollinger']! && ind.bbUpper != null)
            _indicatorRow('BB Upper/Lower',
                '${ind.bbUpper!.toStringAsFixed(5)} / ${ind.bbLower?.toStringAsFixed(5) ?? "-"}'),
          if (_indicators['stochastic']! && ind.stochK != null)
            _indicatorRow('Stoch K/D',
                '${ind.stochK!.toStringAsFixed(2)} / ${ind.stochD?.toStringAsFixed(2) ?? "-"}'),
          if (_indicators['adx']! && ind.adx != null)
            _indicatorRow('ADX (14)', ind.adx!.toStringAsFixed(2),
                badge: ind.adx! > 25 ? 'Trend' : 'Weak',
                badgeColor: ind.adx! > 25
                    ? AppTheme.primaryGreen
                    : AppTheme.textSecondary),
          if (_indicators['cci']! && ind.cci != null)
            _indicatorRow('CCI (20)', ind.cci!.toStringAsFixed(2)),
          if (_indicators['zscore']! && ind.zscore != null)
            _indicatorRow('Z-Score', ind.zscore!.toStringAsFixed(2)),

          const SizedBox(height: 14),
          // Botón — enviar al Panel
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: () {
                widget.onSnapshotReady(_snapshot!);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    backgroundColor: AppTheme.primaryGreen,
                    content: Text(
                        '✅ Datos de ${s.symbol} enviados al Panel Multi-IA',
                        style: const TextStyle(color: Colors.black)),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primaryGreen.withOpacity(0.15),
                foregroundColor: AppTheme.primaryGreen,
                side: BorderSide(
                    color: AppTheme.primaryGreen.withOpacity(0.4)),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: const Icon(Icons.send, size: 18),
              label: const Text('Enviar al Panel Multi-IA',
                  style: TextStyle(fontWeight: FontWeight.bold)),
            ),
          ),
        ],
      ),
    );
  }

  // ── Helpers de UI ─────────────────────────────
  Widget _priceRow(String label, String value,
          {Color? color, bool bold = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(
                    color: AppTheme.textSecondary, fontSize: 13)),
            Text(value,
                style: TextStyle(
                    color: color ?? AppTheme.textPrimary,
                    fontFamily: 'monospace',
                    fontSize: 13,
                    fontWeight:
                        bold ? FontWeight.bold : FontWeight.normal)),
          ],
        ),
      );

  Widget _indicatorRow(String label, String value,
      {String? badge, Color? badgeColor}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label,
                style: TextStyle(
                    color: AppTheme.textSecondary, fontSize: 13)),
            Row(
              children: [
                Text(value,
                    style: const TextStyle(
                        color: AppTheme.textPrimary,
                        fontFamily: 'monospace',
                        fontSize: 13)),
                if (badge != null) ...[
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: (badgeColor ?? AppTheme.primaryGreen)
                          .withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(badge,
                        style: TextStyle(
                            color: badgeColor ?? AppTheme.primaryGreen,
                            fontSize: 10,
                            fontWeight: FontWeight.bold)),
                  ),
                ],
              ],
            ),
          ],
        ),
      );

  TextStyle get _labelStyle => const TextStyle(
      color: AppTheme.textSecondary,
      fontSize: 12,
      fontWeight: FontWeight.w500);

  InputDecoration get _dropdownDecoration => InputDecoration(
        isDense: true,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTheme.surfaceBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppTheme.surfaceBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide:
              const BorderSide(color: AppTheme.primaryGreen),
        ),
        filled: true,
        fillColor: AppTheme.surfaceHighlight,
      );
}
