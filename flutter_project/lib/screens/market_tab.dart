import 'package:flutter/material.dart';

import '../models/market_data.dart';
import '../services/exness_market_data_service.dart';
import '../services/exness_service.dart';
import '../theme/app_theme.dart';

class MarketTab extends StatefulWidget {
  final ExnessService exnessService;
  final Function(MarketSnapshot) onSnapshotReady;

  const MarketTab({super.key, required this.exnessService, required this.onSnapshotReady});

  @override
  State<MarketTab> createState() => _MarketTabState();
}

class _MarketTabState extends State<MarketTab> {
  List<String> _instruments = [];
  String? _selectedInstrument;
  String _selectedTimeframe = 'M15';
  MarketSnapshot? _snapshot;
  bool _isLoadingInstruments = false;
  bool _isLoading = false;
  String _error = '';

  final Map<String, bool> _indicators = {
    'rsi': true, 'atr': true, 'ema': true, 'macd': false,
    'bollinger': false, 'stochastic': false, 'adx': false,
    'cci': false, 'zscore': false,
  };

  final Map<String, String> _indicatorLabels = {
    'rsi': 'RSI (14)', 'atr': 'ATR (14)', 'ema': 'EMA 21/50/200',
    'macd': 'MACD (12/26/9)', 'bollinger': 'Bollinger Bands',
    'stochastic': 'Stochastic', 'adx': 'ADX (14)', 'cci': 'CCI (20)',
    'zscore': 'Z-Score',
  };

  List<String> get _activeIndicatorIds =>
      _indicators.entries.where((entry) => entry.value).map((entry) => entry.key).toList();

  @override
  void initState() {
    super.initState();
    if (widget.exnessService.isConnected) _loadInstruments();
  }

  Future<void> _loadInstruments() async {
    if (!widget.exnessService.isConnected) {
      setState(() => _error = 'Conectá primero una cuenta compatible de Exness en la pestaña Trading.');
      return;
    }
    setState(() {
      _isLoadingInstruments = true;
      _error = '';
    });
    try {
      final instruments = await widget.exnessService.getAvailableInstruments();
      if (!mounted) return;
      setState(() {
        _instruments = instruments;
        if (_selectedInstrument == null || !_instruments.contains(_selectedInstrument)) {
          _selectedInstrument = _instruments.contains('EURUSD') ? 'EURUSD' : (_instruments.isEmpty ? null : _instruments.first);
        }
        _isLoadingInstruments = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _isLoadingInstruments = false;
      });
    }
  }

  Future<void> _fetchMarketData() async {
    if (!widget.exnessService.isConnected) {
      setState(() => _error = 'Conectá primero una cuenta compatible de Exness en la pestaña Trading.');
      return;
    }
    if (_instruments.isEmpty) await _loadInstruments();
    if (!mounted || _instruments.isEmpty || _selectedInstrument == null) return;
    if (_activeIndicatorIds.isEmpty) {
      setState(() => _error = 'Seleccioná al menos un indicador técnico.');
      return;
    }
    setState(() {
      _isLoading = true;
      _error = '';
      _snapshot = null;
    });
    try {
      final snapshot = await ExnessMarketDataService.fetchSnapshot(
        exnessService: widget.exnessService,
        instrument: _selectedInstrument!,
        timeframe: _selectedTimeframe,
        activeIndicators: _activeIndicatorIds,
      );
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _isLoading = false;
      });
      widget.onSnapshotReady(snapshot);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: AppTheme.primaryGreen.withOpacity(0.12), borderRadius: BorderRadius.circular(12)),
              child: const Icon(Icons.show_chart, color: AppTheme.primaryGreen, size: 22),
            ),
            const SizedBox(width: 12),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Datos de Mercado', style: TextStyle(fontSize: 17, fontWeight: FontWeight.bold, color: AppTheme.textPrimary)),
              Text('Historial de velas e indicadores vía Exness API', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
            ])),
            IconButton(
              tooltip: 'Actualizar instrumentos Exness',
              onPressed: _isLoadingInstruments ? null : _loadInstruments,
              icon: _isLoadingInstruments
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.refresh, color: AppTheme.primaryGreen),
            ),
          ]),
          const SizedBox(height: 18),
          _buildInstrumentSelector(),
          const SizedBox(height: 16),
          _buildTimeframeSelector(),
          const SizedBox(height: 16),
          _buildIndicatorsCard(),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _isLoading ? null : _fetchMarketData,
              icon: _isLoading
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black))
                  : const Icon(Icons.cloud_download_outlined),
              label: Text(_isLoading ? 'Consultando Exness...' : 'Obtener datos de Exness'),
              style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primaryGreen, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(vertical: 14)),
            ),
          ),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppTheme.errorRed.withOpacity(0.08), borderRadius: BorderRadius.circular(10), border: Border.all(color: AppTheme.errorRed.withOpacity(0.35))),
              child: Text(_error, style: const TextStyle(color: AppTheme.errorRed, fontSize: 12)),
            ),
          ],
          if (_snapshot != null) ...[
            const SizedBox(height: 16),
            _buildSnapshotCard(_snapshot!),
          ],
        ]),
      ),
    );
  }

  Widget _buildInstrumentSelector() => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: AppTheme.surfaceCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.surfaceBorder)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Instrumento disponible en tu cuenta Exness', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
      const SizedBox(height: 8),
      DropdownButtonFormField<String>(
        value: _instruments.contains(_selectedInstrument) ? _selectedInstrument : null,
        dropdownColor: AppTheme.surfaceCard,
        decoration: _dropdownDecoration,
        hint: Text(_instruments.isEmpty ? 'Conectá Exness y actualizá instrumentos' : 'Seleccionar instrumento'),
        items: _instruments.map((symbol) => DropdownMenuItem(value: symbol, child: Text(symbol, style: const TextStyle(color: AppTheme.textPrimary, fontFamily: 'monospace')))).toList(),
        onChanged: (value) => setState(() => _selectedInstrument = value),
      ),
      if (_instruments.isEmpty)
        const Padding(padding: EdgeInsets.only(top: 8), child: Text('La lista se obtiene directamente de los instrumentos habilitados para tu cuenta.', style: TextStyle(color: AppTheme.textSecondary, fontSize: 11))),
    ]),
  );

  Widget _buildTimeframeSelector() => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    const Padding(padding: EdgeInsets.only(left: 2, bottom: 8), child: Text('Temporalidad', style: TextStyle(color: AppTheme.textSecondary, fontSize: 12, fontWeight: FontWeight.w500))),
    Wrap(spacing: 8, runSpacing: 8, children: ExnessMarketDataService.intervals.map((item) {
      final selected = _selectedTimeframe == item['value'];
      return ChoiceChip(
        label: Text(item['label']!),
        selected: selected,
        onSelected: (_) => setState(() => _selectedTimeframe = item['value']!),
        selectedColor: AppTheme.primaryGreen,
        labelStyle: TextStyle(color: selected ? Colors.black : AppTheme.textSecondary, fontWeight: selected ? FontWeight.bold : FontWeight.normal),
        backgroundColor: AppTheme.surfaceCard,
        side: const BorderSide(color: AppTheme.surfaceBorder),
      );
    }).toList()),
  ]);

  Widget _buildIndicatorsCard() => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(color: AppTheme.surfaceCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.surfaceBorder)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Row(children: [
        Icon(Icons.analytics_outlined, color: AppTheme.primaryGreen, size: 18),
        SizedBox(width: 8),
        Text('Indicadores técnicos (calculados localmente)', style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold, fontSize: 13)),
      ]),
      const SizedBox(height: 10),
      ..._indicators.keys.map((key) => CheckboxListTile(
        dense: true,
        contentPadding: EdgeInsets.zero,
        activeColor: AppTheme.primaryGreen,
        title: Text(_indicatorLabels[key]!, style: const TextStyle(color: AppTheme.textPrimary, fontSize: 13)),
        value: _indicators[key],
        onChanged: (value) => setState(() => _indicators[key] = value ?? false),
      )),
    ]),
  );

  Widget _buildSnapshotCard(MarketSnapshot snapshot) {
    final latest = snapshot.latest!;
    final indicators = snapshot.indicators;
    final rows = <Widget>[];
    void add(String label, double? value, {int decimals = 5}) {
      if (value != null) rows.add(_valueRow(label, value.toStringAsFixed(decimals)));
    }
    if (_indicators['rsi']!) add('RSI (14)', indicators.rsi, decimals: 2);
    if (_indicators['atr']!) add('ATR (14)', indicators.atr);
    if (_indicators['ema']!) {
      add('EMA 21', indicators.ema21);
      add('EMA 50', indicators.ema50);
      add('EMA 200', indicators.ema200);
    }
    if (_indicators['macd']!) {
      add('MACD', indicators.macd);
      add('Signal', indicators.macdSignal);
      add('Histogram', indicators.macdHist);
    }
    if (_indicators['bollinger']!) {
      add('Bollinger Upper', indicators.bbUpper);
      add('Bollinger Middle', indicators.bbMiddle);
      add('Bollinger Lower', indicators.bbLower);
    }
    if (_indicators['stochastic']!) {
      add('Stochastic K', indicators.stochK, decimals: 2);
      add('Stochastic D', indicators.stochD, decimals: 2);
    }
    if (_indicators['adx']!) add('ADX (14)', indicators.adx, decimals: 2);
    if (_indicators['cci']!) add('CCI (20)', indicators.cci, decimals: 2);
    if (_indicators['zscore']!) add('Z-Score', indicators.zscore, decimals: 2);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppTheme.surfaceCard, borderRadius: BorderRadius.circular(14), border: Border.all(color: AppTheme.primaryGreen.withOpacity(0.35))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('${snapshot.symbol} · ${snapshot.interval}', style: const TextStyle(color: AppTheme.primaryGreen, fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 8),
        _valueRow('Última vela', latest.datetime),
        _valueRow('Open', latest.open.toStringAsFixed(5)),
        _valueRow('High', latest.high.toStringAsFixed(5)),
        _valueRow('Low', latest.low.toStringAsFixed(5)),
        _valueRow('Close', latest.close.toStringAsFixed(5)),
        _valueRow('Volume', latest.volume.toStringAsFixed(2)),
        const Divider(color: AppTheme.surfaceBorder, height: 22),
        const Text('Indicadores', style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.bold)),
        ...rows,
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton.icon(
            onPressed: () {
              widget.onSnapshotReady(snapshot);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Datos de Exness enviados al Panel Multi-IA')));
            },
            icon: const Icon(Icons.send),
            label: const Text('Enviar al Panel Multi-IA'),
            style: OutlinedButton.styleFrom(foregroundColor: AppTheme.primaryGreen),
          ),
        ),
      ]),
    );
  }

  Widget _valueRow(String label, String value) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(label, style: const TextStyle(color: AppTheme.textSecondary, fontSize: 12)),
      Flexible(child: Text(value, textAlign: TextAlign.right, style: const TextStyle(color: AppTheme.textPrimary, fontFamily: 'monospace', fontSize: 12))),
    ]),
  );

  InputDecoration get _dropdownDecoration => InputDecoration(
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.surfaceBorder)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.primaryGreen)),
    filled: true,
    fillColor: AppTheme.surfaceHighlight,
  );
}
