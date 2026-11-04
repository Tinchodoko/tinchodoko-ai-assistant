import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/market_data.dart';
import '../models/trade_operation.dart';
import '../services/exness_service.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';
import 'apis_tab.dart';
import 'assistant_tab.dart';
import 'exness_tab.dart';
import 'history_tab.dart';
import 'market_tab.dart';
import 'information_tab.dart';
import 'panel_tab.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;
  final List<AIProvider> _providers = initialProviders;
  final List<TradeOperation> _history = [];
  final ExnessService _exnessService = ExnessService();
  MarketSnapshot? _latestSnapshot;

  @override
  void initState() {
    super.initState();
    _loadStoredKeys();
  }

  Future<void> _loadStoredKeys() async {
    await SecureStorageService.clearLegacyMarketDataApiKey();
    final keys = await SecureStorageService.loadAllApiKeys(
      _providers.map((p) => p.id).toList(),
    );
    if (!mounted) return;
    setState(() {
      for (final provider in _providers) {
        if (keys.containsKey(provider.id)) {
          provider.apiKey = keys[provider.id]!;
        }
      }
    });
  }

  void _onSnapshotReady(MarketSnapshot snapshot) {
    setState(() {
      _latestSnapshot = snapshot;
      _currentIndex = 2;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: AppTheme.primaryGreen,
        content: Row(
          children: [
            const Icon(Icons.check_circle, color: Colors.black),
            const SizedBox(width: 8),
            Text(
              '📊 ${snapshot.symbol} listo — consultá al Panel Multi-IA',
              style: const TextStyle(
                color: Colors.black,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          label: 'Ir',
          textColor: Colors.black,
          onPressed: () => setState(() => _currentIndex = 2),
        ),
      ),
    );
  }

  void _addTradeOperation(TradeOperation op) =>
      setState(() => _history.insert(0, op));

  void _clearHistory() => setState(() => _history.clear());

  // Order execution remains intentionally disabled in this read-only phase.
  void _executeOrder({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  }) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Order execution is disabled in this first read-only integration stage.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _exnessService,
      builder: (context, _) {
        final screens = [
          ApisTab(
            providers: _providers,
            onKeysUpdated: () => setState(() {}),
          ),
          MarketTab(
            exnessService: _exnessService,
            onSnapshotReady: _onSnapshotReady,
          ),
          PanelTab(
            providers: _providers,
            marketSnapshot: _latestSnapshot,
            onTradeRecorded: _addTradeOperation,
            onExecuteTraderOrder: _executeOrder,
          ),
          AssistantTab(
            providers: _providers,
            onTradeRecorded: _addTradeOperation,
            marketSnapshot: _latestSnapshot,
            onExecuteTraderOrder: _executeOrder,
          ),
          ExnessTab(exnessService: _exnessService),
          HistoryTab(
            operations: _history,
            onClearHistory: _clearHistory,
          ),
          const InformationTab(),
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
                  child: const Icon(
                    Icons.bolt,
                    color: AppTheme.primaryGreen,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 10),
                const Text('Tinchodoko AI Assistant'),
              ],
            ),
            actions: [
              IconButton(
                tooltip: 'Information',
                onPressed: () => setState(() => _currentIndex = 6),
                icon: const Icon(Icons.info_outline, color: AppTheme.primaryGreen),
              ),
              if (_latestSnapshot != null)
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.blue.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.blue.withOpacity(0.4)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.show_chart,
                          color: Colors.blue, size: 12),
                      const SizedBox(width: 4),
                      Text(
                        _latestSnapshot!.symbol,
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: Colors.blue,
                        ),
                      ),
                    ],
                  ),
                ),
              Container(
                margin: const EdgeInsets.only(right: 12),
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _exnessService.isConnected
                      ? AppTheme.primaryGreen.withOpacity(0.15)
                      : AppTheme.surfaceHighlight,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(
                    color: _exnessService.isConnected
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
                        color: _exnessService.isConnected
                            ? AppTheme.primaryGreen
                            : AppTheme.errorRed,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _exnessService.isConnected ? 'Exness Live' : 'Offline',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: _exnessService.isConnected
                            ? AppTheme.primaryGreen
                            : AppTheme.textSecondary,
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
          bottomNavigationBar: NavigationBar(
            selectedIndex: _currentIndex,
            onDestinationSelected: (index) =>
                setState(() => _currentIndex = index),
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.vpn_key_outlined),
                selectedIcon: Icon(Icons.vpn_key),
                label: 'APIs',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: _latestSnapshot != null,
                  child: const Icon(Icons.show_chart_outlined),
                ),
                selectedIcon: const Icon(Icons.show_chart),
                label: 'Mercado',
              ),
              const NavigationDestination(
                icon: Icon(Icons.groups_outlined),
                selectedIcon: Icon(Icons.groups),
                label: 'Panel IA',
              ),
              const NavigationDestination(
                icon: Icon(Icons.smart_toy_outlined),
                selectedIcon: Icon(Icons.smart_toy),
                label: 'Assistant',
              ),
              const NavigationDestination(
                icon: Icon(Icons.candlestick_chart_outlined),
                selectedIcon: Icon(Icons.candlestick_chart),
                label: 'Trading',
              ),
              const NavigationDestination(
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

  @override
  void dispose() {
    _exnessService.dispose();
    super.dispose();
  }
}
