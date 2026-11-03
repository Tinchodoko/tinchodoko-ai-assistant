import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/market_data.dart';
import '../models/trade_operation.dart';
import '../services/ai_service.dart';
import '../theme/app_theme.dart';

class AssistantTab extends StatefulWidget {
  final List<AIProvider> providers;
  final Function(TradeOperation) onTradeRecorded;
  final MarketSnapshot? marketSnapshot;
  final Function({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  })? onExecuteTraderOrder;

  const AssistantTab({
    super.key,
    required this.providers,
    required this.onTradeRecorded,
    this.marketSnapshot,
    this.onExecuteTraderOrder,
  });

  @override
  State<AssistantTab> createState() => _AssistantTabState();
}

class _AssistantTabState extends State<AssistantTab> {
  late AIProvider _selectedProvider;
  late String _selectedModel;
  final TextEditingController _promptController = TextEditingController();
  final ScrollController _scrollController = ScrollController();

  bool _isAnalyzing = false;
  String? _analysisResponse;
  String? _lastAnalyzedPair;
  String? _lastAnalyzedDirection;
  double _lastEntry = 0.0;
  double _lastSl = 0.0;
  double _lastTp = 0.0;

  @override
  void initState() {
    super.initState();
    _selectedProvider = widget.providers
        .firstWhere((p) => !p.isDataProvider, orElse: () => widget.providers.first);
    _selectedModel = _selectedProvider.defaultModel;
    _promptController.text =
        '¿Cuál es la mejor oportunidad de entrada basada en los indicadores actuales?';
  }

  @override
  void didUpdateWidget(AssistantTab old) {
    super.didUpdateWidget(old);
    // Cuando llega un snapshot nuevo, actualiza el prompt automáticamente
    if (widget.marketSnapshot != null &&
        widget.marketSnapshot != old.marketSnapshot) {
      final s = widget.marketSnapshot!;
      _promptController.text =
          '¿Cuál es la mejor oportunidad de entrada para ${s.symbol} '
          'en ${s.interval}? Indicá dirección, precio de entrada, SL y TP.';
    }
  }

  List<AIProvider> get _aiProviders =>
      widget.providers.where((p) => !p.isDataProvider).toList();

  void _onProviderChanged(AIProvider? p) {
    if (p == null) return;
    setState(() {
      _selectedProvider = p;
      _selectedModel = p.defaultModel;
    });
  }

  // ── Construye el prompt enriquecido con datos de mercado ──
  String _buildEnrichedPrompt() {
    final base = _promptController.text.trim();
    if (widget.marketSnapshot == null) return base;

    final context = widget.marketSnapshot!.toPromptContext(
      activeIndicators: const [
        'rsi', 'atr', 'ema', 'macd', 'bollinger',
        'stochastic', 'adx', 'cci', 'zscore',
      ],
    );
    return '$context\n\nPREGUNTA DEL TRADER:\n$base';
  }

  Future<void> _analyze() async {
    final enrichedPrompt = _buildEnrichedPrompt();
    if (enrichedPrompt.isEmpty) return;

    setState(() {
      _isAnalyzing = true;
      _analysisResponse = null;
    });

    final apiKey = _selectedProvider.apiKey.trim();
    String responseText;

    if (apiKey.isEmpty) {
      await Future.delayed(const Duration(milliseconds: 1200));
      responseText = '⚠️ API Key de ${_selectedProvider.name} no configurada.\n'
          'Ingresala en el Tab APIs y volvé a intentar.';
    } else {
      responseText = await AIService.analyzeMarket(
        providerId: _selectedProvider.id,
        model: _selectedModel,
        apiKey: apiKey,
        instructions: enrichedPrompt,
      );
    }

    // Intenta parsear dirección y par de la respuesta
    final upper = responseText.toUpperCase();
    _lastAnalyzedDirection = upper.contains('BUY') || upper.contains('COMPRA')
        ? 'BUY'
        : upper.contains('SELL') || upper.contains('VENTA')
            ? 'SELL'
            : 'WAIT';

    _lastAnalyzedPair = widget.marketSnapshot?.symbol.replaceAll('/', '') ??
        (upper.contains('XAU')
            ? 'XAUUSD'
            : upper.contains('BTC')
                ? 'BTCUSD'
                : 'EURUSD');

    // Si hay snapshot usa el precio de cierre como referencia de entrada
    if (widget.marketSnapshot?.latest != null) {
      _lastEntry = widget.marketSnapshot!.latest!.close;
      final atr = widget.marketSnapshot!.indicators.atr ?? 0.001;
      _lastSl = _lastAnalyzedDirection == 'BUY'
          ? _lastEntry - (atr * 1.5)
          : _lastEntry + (atr * 1.5);
      _lastTp = _lastAnalyzedDirection == 'BUY'
          ? _lastEntry + (atr * 3)
          : _lastEntry - (atr * 3);
    }

    setState(() {
      _isAnalyzing = false;
      _analysisResponse = responseText;
    });

    Future.delayed(const Duration(milliseconds: 200), () {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _confirmTrade() {
    final pair = _lastAnalyzedPair ?? 'EURUSD';
    final direction = _lastAnalyzedDirection ?? 'BUY';

    widget.onTradeRecorded(TradeOperation(
      id: 'TRD-${DateTime.now().millisecondsSinceEpoch % 100000}',
      date: DateTime.now(),
      pair: pair,
      direction: direction,
      result: 'Confirmada — en espera de resultado',
      isConfirmed: true,
      pnl: 0.0,
      modelUsed: '${_selectedProvider.name} - $_selectedModel',
      notes: 'Entrada: $_lastEntry | SL: ${_lastSl.toStringAsFixed(5)} | TP: ${_lastTp.toStringAsFixed(5)}',
    ));

    widget.onExecuteTraderOrder?.call(
      pair: pair,
      direction: direction,
      lots: 0.10,
      entryPrice: _lastEntry,
      stopLoss: _lastSl,
      takeProfit: _lastTp,
    );

    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: AppTheme.primaryGreen,
      content: Text('✅ $pair $direction confirmada',
          style: const TextStyle(color: Colors.black)),
    ));
    setState(() => _analysisResponse = null);
  }

  void _rejectTrade() {
    final pair = _lastAnalyzedPair ?? 'EURUSD';
    final direction = _lastAnalyzedDirection ?? 'BUY';

    widget.onTradeRecorded(TradeOperation(
      id: 'TRD-${DateTime.now().millisecondsSinceEpoch % 100000}',
      date: DateTime.now(),
      pair: pair,
      direction: direction,
      result: 'Descartada por usuario',
      isConfirmed: false,
      pnl: 0.0,
      modelUsed: '${_selectedProvider.name} - $_selectedModel',
      notes: 'Señal descartada manualmente.',
    ));

    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('❌ Señal rechazada y registrada en historial'),
    ));
    setState(() => _analysisResponse = null);
  }

  @override
  Widget build(BuildContext context) {
    final snapshot = widget.marketSnapshot;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          controller: _scrollController,
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Banner de datos activos
              if (snapshot != null)
                Container(
                  margin: const EdgeInsets.only(bottom: 14),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.08),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: Colors.blue.withOpacity(0.3)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.show_chart,
                          color: Colors.blue, size: 18),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(
                              '📊 Datos activos: ${snapshot.symbol} · ${snapshot.interval.toUpperCase()}',
                              style: const TextStyle(
                                  color: Colors.blue,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 13),
                            ),
                            Text(
                              'Precio: ${snapshot.latest?.close.toStringAsFixed(5) ?? "-"} · '
                              'Actualizado: ${snapshot.fetchedAt.hour}:${snapshot.fetchedAt.minute.toString().padLeft(2, "0")}',
                              style: TextStyle(
                                  color: Colors.blue.withOpacity(0.7),
                                  fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),

              // Selectores API + Modelo
              Row(children: [
                Expanded(
                  flex: 5,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('API Activa',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary)),
                      const SizedBox(height: 6),
                      _dropdownContainer(
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<AIProvider>(
                            isExpanded: true,
                            value: _selectedProvider,
                            dropdownColor: AppTheme.surfaceCard,
                            icon: const Icon(Icons.arrow_drop_down,
                                color: AppTheme.primaryGreen),
                            items: _aiProviders
                                .map((p) => DropdownMenuItem(
                                      value: p,
                                      child: Row(children: [
                                        Container(
                                          width: 8,
                                          height: 8,
                                          decoration: BoxDecoration(
                                            shape: BoxShape.circle,
                                            color: p.isConfigured
                                                ? AppTheme.primaryGreen
                                                : AppTheme.errorRed,
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(p.name,
                                            style: const TextStyle(
                                                fontWeight:
                                                    FontWeight.w600)),
                                      ]),
                                    ))
                                .toList(),
                            onChanged: _onProviderChanged,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 6,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Modelo',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary)),
                      const SizedBox(height: 6),
                      _dropdownContainer(
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<String>(
                            isExpanded: true,
                            value: _selectedProvider.models
                                    .contains(_selectedModel)
                                ? _selectedModel
                                : _selectedProvider.models.first,
                            dropdownColor: AppTheme.surfaceCard,
                            icon: const Icon(Icons.psychology,
                                color: AppTheme.primaryGreen,
                                size: 20),
                            items: _selectedProvider.models
                                .map((m) => DropdownMenuItem(
                                      value: m,
                                      child: Text(m,
                                          overflow:
                                              TextOverflow.ellipsis,
                                          style: const TextStyle(
                                              fontSize: 13)),
                                    ))
                                .toList(),
                            onChanged: (v) =>
                                setState(() => _selectedModel = v!),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ]),

              const SizedBox(height: 16),

              // Campo de instrucciones
              Text('Instrucciones para el Asistente',
                  style: TextStyle(
                      fontSize: 13, color: AppTheme.textSecondary)),
              const SizedBox(height: 6),
              TextField(
                controller: _promptController,
                maxLines: 4,
                style: const TextStyle(fontSize: 14, height: 1.4),
                decoration: InputDecoration(
                  hintText:
                      'Ej: ¿Qué oportunidad hay en este gráfico?',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
              ),

              const SizedBox(height: 14),

              // Botón Analizar
              ElevatedButton.icon(
                onPressed: _isAnalyzing ? null : _analyze,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                icon: _isAnalyzing
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.black))
                    : const Icon(Icons.auto_graph),
                label: Text(
                  _isAnalyzing
                      ? 'Analizando con ${_selectedProvider.name}...'
                      : 'Analizar mercado',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 15),
                ),
              ),

              // Respuesta
              if (_analysisResponse != null) ...[
                const SizedBox(height: 20),
                Row(children: const [
                  Icon(Icons.terminal,
                      color: AppTheme.primaryGreen, size: 18),
                  SizedBox(width: 6),
                  Text('Respuesta del Asistente',
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.primaryGreen)),
                ]),
                const SizedBox(height: 8),
                Container(
                  constraints: const BoxConstraints(maxHeight: 280),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceHighlight,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                        color:
                            AppTheme.primaryGreen.withOpacity(0.4)),
                  ),
                  child: SingleChildScrollView(
                    child: SelectableText(
                      _analysisResponse!,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 13,
                          height: 1.45),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Row(children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _confirmTrade,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primaryGreen,
                        foregroundColor: Colors.black,
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.check_circle),
                      label: const Text('✅ Confirmar',
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _rejectTrade,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.errorRed,
                        side: const BorderSide(
                            color: AppTheme.errorRed, width: 1.5),
                        padding:
                            const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                      icon: const Icon(Icons.cancel,
                          color: AppTheme.errorRed),
                      label: const Text('❌ Rechazar',
                          style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15)),
                    ),
                  ),
                ]),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _dropdownContainer({required Widget child}) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          color: AppTheme.surfaceHighlight,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.surfaceBorder),
        ),
        child: child,
      );
}
