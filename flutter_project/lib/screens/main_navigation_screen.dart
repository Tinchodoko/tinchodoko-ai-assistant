import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/trade_operation.dart';
import '../services/ctrader_service.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';
import 'apis_tab.dart';
import 'assistant_tab.dart';
import 'ctrader_tab.dart';
import 'history_tab.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 1; // Default to Tab 2 (Assistant) or 0 (APIs)
  final List<AIProvider> _providers = initialProviders;
  final List<TradeOperation> _history = [];
  final CTraderService _ctraderService = CTraderService();

  @override
  void initState() {
    super.initState();
    _loadStoredKeys();
    _seedInitialHistory();
  }

  Future<void> _loadStoredKeys() async {
    final keys = await SecureStorageService.loadAllApiKeys(_providers.map((p) => p.id).toList());
    setState(() {
      for (final p in _providers) {
        if (keys.containsKey(p.id)) {
          p.apiKey = keys[p.id]!;
        }
      }
    });
  }

  void _seedInitialHistory() {
    _history.addAll([
      TradeOperation(
        id: 'TRD-1049',
        date: DateTime.now().subtract(const Duration(hours: 2, minutes: 15)),
        pair: 'EURUSD',
        direction: 'BUY',
        result: '+\$142.50 (TP Alcanzado)',
        isConfirmed: true,
        pnl: 142.50,
        modelUsed: 'Gemini - gemini-2.5-flash',
        notes: 'Rompimiento de resistencia en 1.0850',
      ),
      TradeOperation(
        id: 'TRD-1048',
        date: DateTime.now().subtract(const Duration(hours: 5, minutes: 40)),
        pair: 'XAUUSD',
        direction: 'SELL',
        result: 'Descartada por usuario',
        isConfirmed: false,
        pnl: 0.0,
        modelUsed: 'Groq - llama-3.3-70b-versatile',
        notes: 'Alta volatilidad en noticias de tasas',
      ),
      TradeOperation(
        id: 'TRD-1047',
        date: DateTime.now().subtract(const Duration(days: 1, hours: 3)),
        pair: 'BTCUSD',
        direction: 'BUY',
        result: '+\$210.00 (Ganancia)',
        isConfirmed: true,
        pnl: 210.00,
        modelUsed: 'Claude - claude-3-5-sonnet',
        notes: 'Soporte institucional en \$68,200',
      ),
      TradeOperation(
        id: 'TRD-1046',
        date: DateTime.now().subtract(const Duration(days: 1, hours: 8)),
        pair: 'GBPUSD',
        direction: 'SELL',
        result: 'Descartada',
        isConfirmed: false,
        pnl: 0.0,
        modelUsed: 'OpenAI - gpt-4o',
        notes: 'Filtro de riesgo activado',
      ),
    ]);
  }

  void _addTradeOperation(TradeOperation op) {
    setState(() {
      _history.insert(0, op);
    });
  }

  void _clearHistory() {
    setState(() {
      _history.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctraderService,
      builder: (context, _) {
        final screens = [
          ApisTab(
            providers: _providers,
            onKeysUpdated: () => setState(() {}),
          ),
          AssistantTab(
            providers: _providers,
            onTradeRecorded: _addTradeOperation,
            onExecuteTraderOrder: ({
              required String pair,
              required String direction,
              required double lots,
              required double entryPrice,
              required double stopLoss,
              required double takeProfit,
            }) {
              if (_ctraderService.isConnected) {
                _ctraderService.executeOrder(
                  pair: pair,
                  direction: direction,
                  lots: lots,
                  entryPrice: entryPrice,
                  stopLoss: stopLoss,
                  takeProfit: takeProfit,
                );
              }
            },
          ),
          CTraderTab(
            ctraderService: _ctraderService,
          ),
          HistoryTab(
            operations: _history,
            onClearHistory: _clearHistory,
          ),
        ];

        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(
                    color: AppTheme.primaryGreen.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(Icons.bolt, color: AppTheme.primaryGreen, size: 20),
                ),
                const SizedBox(width: 10),
                const Text('Tinchodoko AI Assistant'),
              ],
            ),
            actions: [
              // cTrader connection status pill in AppBar
              Container(
                margin: const EdgeInsets.only(right: 16),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _ctraderService.isConnected
                      ? AppTheme.primaryGreen.withOpacity(0.15)
                      : AppTheme.surfaceHighlight,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: _ctraderService.isConnected
                        ? AppTheme.primaryGreen.withOpacity(0.4)
                        : AppTheme.surfaceBorder,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _ctraderService.isConnected ? AppTheme.primaryGreen : AppTheme.errorRed,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _ctraderService.isConnected ? 'cTrader Live' : 'Offline',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: _ctraderService.isConnected ? AppTheme.primaryGreen : AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          body: IndexedStack(
            index: _currentIndex,
            children: screens,
          ),
          // 4 tabs with Material Design 3 NavigationBar
          bottomNavigationBar: NavigationBar(
            selectedIndex: _currentIndex,
            onDestinationSelected: (idx) => setState(() => _currentIndex = idx),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.vpn_key_outlined),
                selectedIcon: Icon(Icons.vpn_key),
                label: 'APIs',
              ),
              NavigationDestination(
                icon: Icon(Icons.smart_toy_outlined),
                selectedIcon: Icon(Icons.smart_toy),
                label: 'Assistant',
              ),
              NavigationDestination(
                icon: Icon(Icons.candlestick_chart_outlined),
                selectedIcon: Icon(Icons.candlestick_chart),
                label: 'cTrader',
              ),
              NavigationDestination(
                icon: Icon(Icons.history_outlined),
                selectedIcon: Icon(Icons.history),
                label: 'Historial',
              ),
            ],
          ),
        );
      },
    );
  }
}
