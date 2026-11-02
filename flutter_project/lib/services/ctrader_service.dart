import 'dart:async';
import 'package:flutter/foundation.dart';
import '../models/ctrader_account.dart';

class CTraderService extends ChangeNotifier {
  CTraderAccount _account = CTraderAccount.disconnected();
  bool _isLoading = false;
  Timer? _liveTickerTimer;

  CTraderAccount get account => _account;
  bool get isLoading => _isLoading;
  bool get isConnected => _account.isConnected;

  Future<bool> connect(String mcpToken) async {
    if (mcpToken.trim().isEmpty) return false;
    _isLoading = true;
    notifyListeners();

    // Handshake simulation with cTrader Remote MCP endpoint
    await Future.delayed(const Duration(milliseconds: 1200));

    final mockPositions = [
      CTraderPosition(
        id: 'POS-9021',
        pair: 'EURUSD',
        direction: 'BUY',
        lots: 0.50,
        entryPrice: 1.08420,
        currentPrice: 1.08645,
        pnl: 112.50,
        stopLoss: 1.08100,
        takeProfit: 1.09200,
        openTime: '10:15:20',
      ),
      CTraderPosition(
        id: 'POS-9022',
        pair: 'XAUUSD',
        direction: 'SELL',
        lots: 0.20,
        entryPrice: 2742.80,
        currentPrice: 2738.20,
        pnl: 92.00,
        stopLoss: 2755.00,
        takeProfit: 2715.00,
        openTime: '11:42:05',
      ),
      CTraderPosition(
        id: 'POS-9023',
        pair: 'BTCUSD',
        direction: 'BUY',
        lots: 0.10,
        entryPrice: 68450.0,
        currentPrice: 69120.0,
        pnl: 67.00,
        stopLoss: 67200.0,
        takeProfit: 71000.0,
        openTime: '12:05:18',
      ),
    ];

    double balance = 12450.00;
    double openPnl = mockPositions.fold(0.0, (acc, p) => acc + p.pnl);
    double equity = balance + openPnl;

    _account = CTraderAccount(
      isConnected: true,
      mcpToken: mcpToken,
      balance: balance,
      equity: equity,
      margin: 450.00,
      freeMargin: equity - 450.00,
      positions: mockPositions,
    );

    _isLoading = false;
    _startLiveTicker();
    notifyListeners();
    return true;
  }

  void disconnect() {
    _liveTickerTimer?.cancel();
    _account = CTraderAccount.disconnected();
    notifyListeners();
  }

  void closePosition(String positionId) {
    final updatedPositions = _account.positions.where((p) => p.id != positionId).toList();
    double openPnl = updatedPositions.fold(0.0, (acc, p) => acc + p.pnl);
    double equity = _account.balance + openPnl;

    _account = CTraderAccount(
      isConnected: true,
      mcpToken: _account.mcpToken,
      balance: _account.balance,
      equity: equity,
      margin: updatedPositions.length * 150.0,
      freeMargin: equity - (updatedPositions.length * 150.0),
      positions: updatedPositions,
    );
    notifyListeners();
  }

  void executeOrder({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  }) {
    final newPos = CTraderPosition(
      id: 'POS-${DateTime.now().millisecondsSinceEpoch % 10000}',
      pair: pair,
      direction: direction,
      lots: lots,
      entryPrice: entryPrice,
      currentPrice: entryPrice,
      pnl: 0.0,
      stopLoss: stopLoss,
      takeProfit: takeProfit,
      openTime: DateTime.now().toLocal().toString().substring(11, 19),
    );

    final updated = List<CTraderPosition>.from(_account.positions)..insert(0, newPos);
    _account = CTraderAccount(
      isConnected: _account.isConnected,
      mcpToken: _account.mcpToken,
      balance: _account.balance,
      equity: _account.equity,
      margin: _account.margin + 150.0,
      freeMargin: _account.freeMargin - 150.0,
      positions: updated,
    );
    notifyListeners();
  }

  void _startLiveTicker() {
    _liveTickerTimer?.cancel();
    _liveTickerTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!_account.isConnected) {
        timer.cancel();
        return;
      }
      // Small live price jitter simulation
      final updatedPositions = _account.positions.map((pos) {
        final delta = (DateTime.now().millisecond % 5 - 2) * 0.15;
        final newPnl = pos.pnl + delta;
        return CTraderPosition(
          id: pos.id,
          pair: pos.pair,
          direction: pos.direction,
          lots: pos.lots,
          entryPrice: pos.entryPrice,
          currentPrice: pos.currentPrice + (pos.direction == 'BUY' ? delta * 0.001 : -delta * 0.001),
          pnl: double.parse(newPnl.toStringAsFixed(2)),
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          openTime: pos.openTime,
        );
      }).toList();

      double openPnl = updatedPositions.fold(0.0, (acc, p) => acc + p.pnl);
      double equity = _account.balance + openPnl;

      _account = CTraderAccount(
        isConnected: true,
        mcpToken: _account.mcpToken,
        balance: _account.balance,
        equity: double.parse(equity.toStringAsFixed(2)),
        margin: _account.margin,
        freeMargin: double.parse((equity - _account.margin).toStringAsFixed(2)),
        positions: updatedPositions,
      );
      notifyListeners();
    });
  }

  @override
  void dispose() {
    _liveTickerTimer?.cancel();
    super.dispose();
  }
}
