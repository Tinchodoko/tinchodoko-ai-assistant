import 'dart:async';
import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/market_data.dart';
import '../models/trade_operation.dart';
import '../services/ai_service.dart';
import '../theme/app_theme.dart';

class PanelTab extends StatefulWidget {
  final List<AIProvider> providers;
  final MarketSnapshot? marketSnapshot;
  final Function(TradeOperation) onTradeRecorded;
  final Function({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  })? onExecuteTraderOrder;

  const PanelTab({
    super.key,
    required this.providers,
    this.marketSnapshot,
    required this.onTradeRecorded,
    this.onExecuteTraderOrder,
  });

  @override
  State<PanelTab> createState() => _PanelTabState();
}

class _PanelTabState extends State<PanelTab> {
  // ── Estado del panel ──────────────────────────
  final Map<String, bool> _selectedAnalysts = {};
  String _executorId = 'claude';
  final TextEditingController _questionController = TextEditingController();
  bool _isRunning = false;

  // Resultados por proveedor
  final Map<String, _AnalystResult> _results = {};
  _ConsensusResult? _consensus;

  @override
  void initState() {
    super.initState();
    // Por defecto selecciona los primeros 3 proveedores de IA configurados
    final aiProviders = _aiProviders;
    for (int i = 0; i < aiProviders.length; i++) {
      _selectedAnalysts[aiProviders[i].id] = i < 3;
    }
    _questionController.text =
        '¿Cuál es la mejor oportunidad de entrada? '
        'Indicá dirección (BUY/SELL), precio de entrada, Stop Loss y Take Profit.';
  }

  @override
  void didUpdateWidget(PanelTab old) {
    super.didUpdateWidget(old);
    if (widget.marketSnapshot != null &&
        widget.marketSnapshot != old.marketSnapshot) {
      final s = widget.marketSnapshot!;
      _questionController.text =
          '¿Cuál es la mejor oportunidad de entrada para ${s.symbol} '
          'en ${s.interval}? Indicá dirección, entrada, SL y TP.';
      // Limpia resultados anteriores al cargar nuevos datos
      setState(() {
        _results.clear();
        _consensus = null;
      });
    }
  }

  List<AIProvider> get _aiProviders =>
      widget.providers.where((p) => !p.isDataProvider).toList();

  List<AIProvider> get _selectedProviders => _aiProviders
      .where((p) => _selectedAnalysts[p.id] == true)
      .toList();

  // ── Lanzar el debate ──────────────────────────
  Future<void> _startPanel() async {
    final analysts = _selectedProviders;
    if (analysts.isEmpty) {
      _showSnack('⚠️ Seleccioná al menos un analista', isError: true);
      return;
    }
    final executor =
        _aiProviders.firstWhere((p) => p.id == _executorId);
    if (!executor.isConfigured) {
      _showSnack('⚠️ El ejecutor (${executor.name}) no tiene API Key configurada',
          isError: true);
      return;
    }
    if (widget.marketSnapshot == null) {
      _showSnack(
          '⚠️ Primero obtené datos en el Tab Mercado',
          isError: true);
      return;
    }

    setState(() {
      _isRunning = true;
      _consensus = null;
      _results.clear();
      for (final p in analysts) {
        _results[p.id] = _AnalystResult(
            providerId: p.id,
            providerName: p.name,
            isLoading: true);
      }
    });

    // ── Paso 1: todos los analistas en paralelo ──
    final marketContext = widget.marketSnapshot!.toPromptContext(
      activeIndicators: const [
        'rsi', 'atr', 'ema', 'macd',
        'bollinger', 'stochastic', 'adx', 'cci',
      ],
    );
    final question = _questionController.text.trim();
    final prompt = '$marketContext\n\nPREGUNTA:\n$question';

    final analystFutures = analysts.map((p) async {
      if (!p.isConfigured) {
        setState(() {
          _results[p.id] = _AnalystResult(
              providerId: p.id,
              providerName: p.name,
              error: 'Sin API Key configurada');
        });
        return;
      }
      try {
        final response = await AIService.analyzeMarket(
          providerId: p.id,
          model: p.defaultModel,
          apiKey: p.apiKey,
          instructions: prompt,
        );
        final signal = _extractSignal(response);
        setState(() {
          _results[p.id] = _AnalystResult(
            providerId: p.id,
            providerName: p.name,
            response: response,
            signal: signal,
            isLoading: false,
          );
        });
      } catch (e) {
        setState(() {
          _results[p.id] = _AnalystResult(
              providerId: p.id,
              providerName: p.name,
              error: e.toString(),
              isLoading: false);
        });
      }
    });

    await Future.wait(analystFutures);

    // ── Paso 2: el ejecutor hace el consenso ─────
    final validResults =
        _results.values.where((r) => r.response != null).toList();

    if (validResults.isEmpty) {
      setState(() => _isRunning = false);
      _showSnack('No hubo respuestas válidas del panel', isError: true);
      return;
    }

    final analysisBlock = validResults
        .map((r) =>
            '=== ${r.providerName} ===\n${r.response}')
        .join('\n\n');

    final executorPrompt = '''
Sos el ejecutor del Panel Multi-IA de Tinchodoko AI Assistant.
Recibiste estos análisis independientes del mercado:

$analysisBlock

Tu tarea:
1. Identificar en qué SEÑAL coinciden (BUY / SELL / WAIT)
2. Calcular el consenso: cuántos de ${validResults.length} analistas coinciden
3. Dar UN precio de entrada consensuado, UN Stop Loss y UN Take Profit
4. Calcular el ratio R:R
5. Dar tu veredicto final con nivel de confianza (0-100%)
6. Explicar brevemente por qué en 2-3 líneas

Responde EXACTAMENTE en este formato:
SEÑAL: [BUY/SELL/WAIT]
CONSENSO: [X/${validResults.length}]
ENTRADA: [precio]
SL: [precio]
TP: [precio]
RR: [ratio]
CONFIANZA: [0-100]%
VEREDICTO: [tu explicación de 2-3 líneas]
''';

    try {
      final executorResponse = await AIService.analyzeMarket(
        providerId: executor.id,
        model: executor.defaultModel,
        apiKey: executor.apiKey,
        instructions: executorPrompt,
      );

      final consensus = _parseConsensus(
        executorResponse,
        validResults.length,
      );

      setState(() {
        _consensus = consensus;
        _isRunning = false;
      });
    } catch (e) {
      setState(() => _isRunning = false);
      _showSnack('Error del ejecutor: $e', isError: true);
    }
  }

  // ── UI ────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeader(),
                const SizedBox(height: 14),
                if (widget.marketSnapshot != null)
                  _buildSnapshotBanner(),
                const SizedBox(height: 14),
                _buildAnalystSelector(),
                const SizedBox(height: 14),
                _buildExecutorSelector(),
                const SizedBox(height: 14),
                _buildQuestionField(),
                const SizedBox(height: 14),
                _buildStartButton(),
                if (_results.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  _buildResultsSection(),
                ],
                if (_consensus != null) ...[
                  const SizedBox(height: 16),
                  _buildConsensusCard(),
                ],
              ]),
        ),
      ),
    );
  }

  Widget _buildHeader() => Row(children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.purple.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(Icons.groups,
              color: Colors.purple, size: 22),
        ),
        const SizedBox(width: 12),
        const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Panel Multi-IA',
              style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.bold,
                  color: AppTheme.textPrimary)),
          Text('Debate y consenso entre múltiples IAs',
              style: TextStyle(
                  fontSize: 12, color: AppTheme.textSecondary)),
        ]),
      ]);

  Widget _buildSnapshotBanner() {
    final s = widget.marketSnapshot!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.blue.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.blue.withOpacity(0.3)),
      ),
      child: Row(children: [
        const Icon(Icons.show_chart, color: Colors.blue, size: 16),
        const SizedBox(width: 8),
        Text(
          '📊 ${s.symbol} · ${s.interval.toUpperCase()} · '
          'Precio: ${s.latest?.close.toStringAsFixed(5) ?? "-"}',
          style: const TextStyle(
              color: Colors.blue,
              fontSize: 12,
              fontWeight: FontWeight.bold),
        ),
      ]),
    );
  }

  Widget _buildAnalystSelector() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.surfaceCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.surfaceBorder),
        ),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const Icon(Icons.psychology,
                    color: Colors.purple, size: 16),
                const SizedBox(width: 8),
                const Text('Analistas del panel',
                    style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: AppTheme.textPrimary)),
                const Spacer(),
                Text(
                  '${_selectedProviders.length} seleccionados',
                  style: const TextStyle(
                      fontSize: 11, color: AppTheme.textSecondary),
                ),
              ]),
              const SizedBox(height: 10),
              ..._aiProviders.map((p) {
                final selected =
                    _selectedAnalysts[p.id] ?? false;
                final isExecutor = p.id == _executorId;
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Checkbox(
                    value: selected,
                    activeColor: AppTheme.primaryGreen,
                    onChanged: isExecutor
                        ? null
                        : (v) => setState(
                            () => _selectedAnalysts[p.id] = v!),
                  ),
                  title: Row(children: [
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
                        style: TextStyle(
                            color: isExecutor
                                ? AppTheme.textSecondary
                                : AppTheme.textPrimary,
                            fontSize: 14)),
                    if (isExecutor) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.amber.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text('Ejecutor',
                            style: TextStyle(
                                color: Colors.amber,
                                fontSize: 10,
                                fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ]),
                  subtitle: Text(p.defaultModel,
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textSecondary)),
                );
              }).toList(),
            ]),
      );

  Widget _buildExecutorSelector() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.amber.withOpacity(0.06),
          borderRadius: BorderRadius.circular(14),
          border:
              Border.all(color: Colors.amber.withOpacity(0.3)),
        ),
        child: Row(children: [
          const Icon(Icons.gavel, color: Colors.amber, size: 18),
          const SizedBox(width: 10),
          const Text('Ejecutor (hace el consenso):',
              style: TextStyle(
                  color: Colors.amber,
                  fontWeight: FontWeight.bold,
                  fontSize: 13)),
          const SizedBox(width: 12),
          Expanded(
            child: DropdownButtonFormField<String>(
              value: _executorId,
              dropdownColor: AppTheme.surfaceCard,
              decoration: InputDecoration(
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 8),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(
                        color: Colors.amber.withOpacity(0.4))),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(
                        color: Colors.amber.withOpacity(0.4))),
              ),
              items: _aiProviders
                  .map((p) => DropdownMenuItem(
                        value: p.id,
                        child: Row(children: [
                          Container(
                              width: 7,
                              height: 7,
                              decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: p.isConfigured
                                      ? AppTheme.primaryGreen
                                      : AppTheme.errorRed)),
                          const SizedBox(width: 6),
                          Text(p.name,
                              style: const TextStyle(fontSize: 13)),
                        ]),
                      ))
                  .toList(),
              onChanged: (v) => setState(() {
                _executorId = v!;
                _selectedAnalysts[v] = false;
              }),
            ),
          ),
        ]),
      );

  Widget _buildQuestionField() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Pregunta al panel',
              style: TextStyle(
                  fontSize: 13, color: AppTheme.textSecondary)),
          const SizedBox(height: 6),
          TextField(
            controller: _questionController,
            maxLines: 3,
            style: const TextStyle(fontSize: 14),
            decoration: InputDecoration(
              hintText:
                  '¿Cuál es la mejor entrada? ¿Qué dirección tiene el mercado?',
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      );

  Widget _buildStartButton() => SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _isRunning ? null : _startPanel,
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.purple,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12)),
          ),
          icon: _isRunning
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.groups),
          label: Text(
            _isRunning
                ? 'Consultando al panel...'
                : '🚀 Iniciar Debate Multi-IA',
            style: const TextStyle(
                fontWeight: FontWeight.bold, fontSize: 15),
          ),
        ),
      );

  Widget _buildResultsSection() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            Icon(Icons.forum, color: Colors.purple, size: 16),
            SizedBox(width: 6),
            Text('Resultados del panel',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.purple,
                    fontSize: 14)),
          ]),
          const SizedBox(height: 10),
          ..._results.values.map(_buildAnalystCard).toList(),
        ],
      );

  Widget _buildAnalystCard(_AnalystResult r) {
    Color signalColor = AppTheme.textSecondary;
    IconData signalIcon = Icons.hourglass_empty;

    if (r.isLoading) {
      signalColor = Colors.orange;
      signalIcon = Icons.pending;
    } else if (r.error != null) {
      signalColor = AppTheme.errorRed;
      signalIcon = Icons.error_outline;
    } else if (r.signal == 'BUY') {
      signalColor = AppTheme.primaryGreen;
      signalIcon = Icons.trending_up;
    } else if (r.signal == 'SELL') {
      signalColor = AppTheme.errorRed;
      signalIcon = Icons.trending_down;
    } else {
      signalColor = Colors.orange;
      signalIcon = Icons.pause_circle_outline;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.surfaceCard,
        borderRadius: BorderRadius.circular(12),
        border:
            Border.all(color: signalColor.withOpacity(0.3)),
      ),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
                mainAxisAlignment:
                    MainAxisAlignment.spaceBetween,
                children: [
                  Text(r.providerName,
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary)),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: signalColor.withOpacity(0.12),
                      borderRadius:
                          BorderRadius.circular(20),
                    ),
                    child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(signalIcon,
                              color: signalColor, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            r.isLoading
                                ? 'Analizando...'
                                : r.error != null
                                    ? 'Error'
                                    : r.signal ?? 'WAIT',
                            style: TextStyle(
                                color: signalColor,
                                fontWeight: FontWeight.bold,
                                fontSize: 12),
                          ),
                        ]),
                  ),
                ]),
            if (r.isLoading)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: LinearProgressIndicator(
                    color: Colors.purple,
                    backgroundColor:
                        Colors.purple.withOpacity(0.1)),
              ),
            if (r.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(r.error!,
                    style: const TextStyle(
                        color: AppTheme.errorRed,
                        fontSize: 11)),
              ),
            if (r.response != null) ...[
              const SizedBox(height: 8),
              Container(
                constraints:
                    const BoxConstraints(maxHeight: 100),
                child: SingleChildScrollView(
                  child: Text(r.response!,
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.textSecondary,
                          height: 1.4)),
                ),
              ),
            ],
          ]),
    );
  }

  Widget _buildConsensusCard() {
    final c = _consensus!;
    final signalColor = c.signal == 'BUY'
        ? AppTheme.primaryGreen
        : c.signal == 'SELL'
            ? AppTheme.errorRed
            : Colors.orange;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: signalColor.withOpacity(0.06),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: signalColor.withOpacity(0.4)),
      ),
      child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(Icons.gavel,
                  color: Colors.amber, size: 20),
              const SizedBox(width: 8),
              const Text('CONSENSO FINAL',
                  style: TextStyle(
                      color: Colors.amber,
                      fontWeight: FontWeight.bold,
                      fontSize: 15)),
            ]),
            const SizedBox(height: 14),

            // Señal principal
            Row(
                mainAxisAlignment:
                    MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text('Señal',
                            style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 11)),
                        Text(c.signal,
                            style: TextStyle(
                                color: signalColor,
                                fontSize: 28,
                                fontWeight: FontWeight.bold)),
                      ]),
                  // Medidor de confianza
                  Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.end,
                      children: [
                        Text('${c.agreementCount}/${c.totalCount} IAs',
                            style: const TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 11)),
                        Text('${c.confidencePercent}%',
                            style: TextStyle(
                                color: signalColor,
                                fontSize: 24,
                                fontWeight: FontWeight.bold)),
                        Text('confianza',
                            style: TextStyle(
                                color: AppTheme.textSecondary,
                                fontSize: 10)),
                      ]),
                ]),

            const SizedBox(height: 10),
            LinearProgressIndicator(
              value: c.confidencePercent / 100,
              backgroundColor:
                  signalColor.withOpacity(0.15),
              color: signalColor,
              minHeight: 6,
              borderRadius: BorderRadius.circular(3),
            ),
            const SizedBox(height: 4),
            Text(c.statusLabel,
                style: TextStyle(
                    color: signalColor,
                    fontSize: 12,
                    fontWeight: FontWeight.bold)),

            const Divider(
                color: AppTheme.surfaceBorder, height: 20),

            // Precios
            if (c.entryPrice != null) ...[
              _priceRow('Entrada', c.entryPrice!, signalColor),
              _priceRow('Stop Loss', c.stopLoss ?? 0,
                  AppTheme.errorRed),
              _priceRow('Take Profit', c.takeProfit ?? 0,
                  AppTheme.primaryGreen),
              const SizedBox(height: 10),
            ],

            // Veredicto
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppTheme.surfaceHighlight,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(c.reasoning,
                  style: const TextStyle(
                      color: AppTheme.textPrimary,
                      fontSize: 12,
                      height: 1.4)),
            ),

            if (c.signal != 'WAIT' &&
                c.entryPrice != null) ...[
              const SizedBox(height: 14),
              Row(children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => _confirmConsensus(c),
                    style: ElevatedButton.styleFrom(
                      backgroundColor:
                          AppTheme.primaryGreen,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(
                          vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.check_circle),
                    label: const Text('✅ Confirmar',
                        style: TextStyle(
                            fontWeight: FontWeight.bold)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => setState(
                        () => _consensus = null),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppTheme.errorRed,
                      side: const BorderSide(
                          color: AppTheme.errorRed),
                      padding: const EdgeInsets.symmetric(
                          vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(10)),
                    ),
                    icon: const Icon(Icons.cancel,
                        color: AppTheme.errorRed),
                    label: const Text('❌ Rechazar',
                        style: TextStyle(
                            fontWeight: FontWeight.bold)),
                  ),
                ),
              ]),
            ],
          ]),
    );
  }

  Widget _priceRow(String label, double price, Color color) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
            mainAxisAlignment:
                MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style: const TextStyle(
                      color: AppTheme.textSecondary,
                      fontSize: 13)),
              Text(price.toStringAsFixed(5),
                  style: TextStyle(
                      color: color,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
            ]),
      );

  // ── Confirmar consenso ────────────────────────
  void _confirmConsensus(_ConsensusResult c) {
    final pair = widget.marketSnapshot?.symbol
            .replaceAll('/', '') ??
        'EURUSD';
    widget.onTradeRecorded(TradeOperation(
      id: 'PNL-${DateTime.now().millisecondsSinceEpoch % 100000}',
      date: DateTime.now(),
      pair: pair,
      direction: c.signal,
      result: 'Panel Multi-IA — ${c.agreementCount}/${c.totalCount} acuerdo',
      isConfirmed: true,
      pnl: 0.0,
      modelUsed: 'Panel (${c.agreementCount}/${c.totalCount} IAs)',
      notes:
          'Entrada: ${c.entryPrice?.toStringAsFixed(5)} | '
          'SL: ${c.stopLoss?.toStringAsFixed(5)} | '
          'TP: ${c.takeProfit?.toStringAsFixed(5)} | '
          'Confianza: ${c.confidencePercent}%',
    ));
    widget.onExecuteTraderOrder?.call(
      pair: pair,
      direction: c.signal,
      lots: 0.10,
      entryPrice: c.entryPrice ?? 0,
      stopLoss: c.stopLoss ?? 0,
      takeProfit: c.takeProfit ?? 0,
    );
    _showSnack('✅ Operación confirmada y registrada');
    setState(() => _consensus = null);
  }

  // ── Helpers ───────────────────────────────────
  String _extractSignal(String response) {
    final u = response.toUpperCase();
    if (u.contains('BUY') || u.contains('COMPRA')) return 'BUY';
    if (u.contains('SELL') || u.contains('VENTA')) return 'SELL';
    return 'WAIT';
  }

  _ConsensusResult _parseConsensus(
      String response, int total) {
    String signal = 'WAIT';
    double? entry, sl, tp;
    int agreement = 0;
    int confidence = 50;
    String reasoning = response;

    final lines = response.split('\n');
    for (final line in lines) {
      final parts = line.split(':');
      if (parts.length < 2) continue;
      final key = parts[0].trim().toUpperCase();
      final val = parts.sublist(1).join(':').trim();

      if (key == 'SEÑAL' || key == 'SENAL' || key == 'SIGNAL') {
        if (val.toUpperCase().contains('BUY')) signal = 'BUY';
        if (val.toUpperCase().contains('SELL')) signal = 'SELL';
      } else if (key == 'CONSENSO' || key == 'CONSENSUS') {
        final match = RegExp(r'(\d+)').firstMatch(val);
        if (match != null) {
          agreement = int.tryParse(match.group(1)!) ?? 0;
        }
      } else if (key == 'ENTRADA' || key == 'ENTRY') {
        entry = double.tryParse(val.replaceAll(RegExp(r'[^\d.]'), ''));
      } else if (key == 'SL' || key == 'STOP LOSS') {
        sl = double.tryParse(val.replaceAll(RegExp(r'[^\d.]'), ''));
      } else if (key == 'TP' || key == 'TAKE PROFIT') {
        tp = double.tryParse(val.replaceAll(RegExp(r'[^\d.]'), ''));
      } else if (key == 'CONFIANZA' || key == 'CONFIDENCE') {
        confidence =
            int.tryParse(val.replaceAll(RegExp(r'[^\d]'), '')) ??
                50;
      } else if (key == 'VEREDICTO' || key == 'VERDICT') {
        reasoning = val;
      }
    }

    if (agreement == 0) {
      agreement = (total * confidence / 100).round();
    }

    return _ConsensusResult(
      signal: signal,
      entryPrice: entry,
      stopLoss: sl,
      takeProfit: tp,
      agreementCount: agreement,
      totalCount: total,
      confidencePercent: confidence,
      reasoning: reasoning,
    );
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor:
          isError ? AppTheme.errorRed : AppTheme.primaryGreen,
      content: Text(msg,
          style: TextStyle(
              color: isError ? Colors.white : Colors.black,
              fontWeight: FontWeight.bold)),
    ));
  }
}

// ── Modelos internos ──────────────────────────────
class _AnalystResult {
  final String providerId;
  final String providerName;
  final String? response;
  final String? signal;
  final bool isLoading;
  final String? error;

  _AnalystResult({
    required this.providerId,
    required this.providerName,
    this.response,
    this.signal,
    this.isLoading = false,
    this.error,
  });
}

class _ConsensusResult {
  final String signal;
  final double? entryPrice;
  final double? stopLoss;
  final double? takeProfit;
  final int agreementCount;
  final int totalCount;
  final int confidencePercent;
  final String reasoning;

  _ConsensusResult({
    required this.signal,
    this.entryPrice,
    this.stopLoss,
    this.takeProfit,
    required this.agreementCount,
    required this.totalCount,
    required this.confidencePercent,
    required this.reasoning,
  });

  String get statusLabel {
    if (confidencePercent >= 85) return '✅ Señal fuerte — entrada recomendada';
    if (confidencePercent >= 65) return '🟡 Señal moderada — operar con precaución';
    if (confidencePercent >= 50) return '🟠 Señal mixta — mejor esperar';
    return '🔴 Sin consenso — NO operar';
  }
}
