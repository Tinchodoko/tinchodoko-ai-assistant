import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/ctrader_account.dart';

// ─────────────────────────────────────────────
//  cTrader Remote MCP — Endpoint oficial
//  https://mcp.ctrader.com/trading/mcp
// ─────────────────────────────────────────────
const String _kMcpEndpoint = 'https://mcp.ctrader.com/trading/mcp';

class CTraderService extends ChangeNotifier {
  CTraderAccount _account = CTraderAccount.disconnected();
  bool _isLoading = false;
  String _lastError = '';
  Timer? _pollingTimer;

  CTraderAccount get account => _account;
  bool get isLoading => _isLoading;
  bool get isConnected => _account.isConnected;
  String get lastError => _lastError;

  // ─────────────────────────────────────────
  //  LLAMADA AL MCP — método genérico
  // ─────────────────────────────────────────
  Future<Map<String, dynamic>?> _callMcp({
    required String token,
    required String toolName,
    Map<String, dynamic>? arguments,
  }) async {
    try {
      final body = jsonEncode({
        'jsonrpc': '2.0',
        'id': DateTime.now().millisecondsSinceEpoch,
        'method': 'tools/call',
        'params': {
          'name': toolName,
          if (arguments != null) 'arguments': arguments,
        },
      });

      final response = await http.post(
        Uri.parse(_kMcpEndpoint),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: body,
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        if (data.containsKey('result')) {
          final result = data['result'];
          // El MCP devuelve el contenido como texto JSON dentro de content[0].text
          if (result is Map && result.containsKey('content')) {
            final contentList = result['content'] as List;
            if (contentList.isNotEmpty) {
              final textContent = contentList[0]['text'] as String;
              return jsonDecode(textContent) as Map<String, dynamic>;
            }
          }
          return result as Map<String, dynamic>?;
        } else if (data.containsKey('error')) {
          _lastError = data['error']['message']?.toString() ?? 'Error MCP desconocido';
          debugPrint('❌ MCP error: $_lastError');
          return null;
        }
      } else {
        _lastError = 'HTTP ${response.statusCode}: ${response.body}';
        debugPrint('❌ HTTP error: $_lastError');
        return null;
      }
    } on TimeoutException {
      _lastError = 'Timeout: el servidor MCP no respondió en 15s';
      debugPrint('❌ $_lastError');
    } catch (e) {
      _lastError = e.toString();
      debugPrint('❌ Excepción MCP: $e');
    }
    return null;
  }

  // ─────────────────────────────────────────
  //  CONECTAR — obtiene cuenta y posiciones
  // ─────────────────────────────────────────
  Future<bool> connect(String token) async {
    if (token.trim().isEmpty) return false;

    _isLoading = true;
    _lastError = '';
    notifyListeners();

    try {
      // 1️⃣ Obtener datos de la cuenta
      final accountData = await _callMcp(
        token: token,
        toolName: 'get_account_info',
      );

      if (accountData == null) {
        _isLoading = false;
        notifyListeners();
        return false;
      }

      // 2️⃣ Obtener posiciones abiertas
      final positionsData = await _callMcp(
        token: token,
        toolName: 'get_open_positions',
      );

      final positions = _parsePositions(positionsData);

      // 3️⃣ Construir el estado de cuenta real
      final balance = _toDouble(accountData['balance'] ?? accountData['Balance'] ?? 0);
      final equity  = _toDouble(accountData['equity']  ?? accountData['Equity']  ?? balance);
      final margin  = _toDouble(accountData['margin']  ?? accountData['Margin']  ?? 0);

      _account = CTraderAccount(
        isConnected: true,
        mcpToken: token,
        balance: balance,
        equity: equity,
        margin: margin,
        freeMargin: equity - margin,
        positions: positions,
      );

      // 4️⃣ Inicia polling cada 5 segundos para actualizar precios
      _startPolling(token);

      _isLoading = false;
      notifyListeners();
      return true;

    } catch (e) {
      _lastError = e.toString();
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  // ─────────────────────────────────────────
  //  DESCONECTAR
  // ─────────────────────────────────────────
  void disconnect() {
    _pollingTimer?.cancel();
    _account = CTraderAccount.disconnected();
    _lastError = '';
    notifyListeners();
  }

  // ─────────────────────────────────────────
  //  CERRAR POSICIÓN
  // ─────────────────────────────────────────
  Future<bool> closePosition(String positionId) async {
    if (!isConnected) return false;

    final result = await _callMcp(
      token: _account.mcpToken,
      toolName: 'close_position',
      arguments: {'positionId': positionId},
    );

    if (result != null) {
      // Actualiza la lista localmente removiendo la posición cerrada
      final updatedPositions = _account.positions
          .where((p) => p.id != positionId)
          .toList();
      _updateAccountPositions(updatedPositions);
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────
  //  EJECUTAR ORDEN
  // ─────────────────────────────────────────
  Future<bool> executeOrder({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  }) async {
    if (!isConnected) return false;

    final result = await _callMcp(
      token: _account.mcpToken,
      toolName: 'place_market_order',
      arguments: {
        'symbol': pair,
        'tradeSide': direction == 'BUY' ? 'Buy' : 'Sell',
        'volume': (lots * 100000).toInt(), // cTrader usa volumen en unidades
        'stopLossPrice': stopLoss,
        'takeProfitPrice': takeProfit,
      },
    );

    if (result != null) {
      // Recarga las posiciones tras ejecutar
      await _refreshPositions();
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────
  //  MODIFICAR SL/TP
  // ─────────────────────────────────────────
  Future<bool> modifyPosition({
    required String positionId,
    required double stopLoss,
    required double takeProfit,
  }) async {
    if (!isConnected) return false;

    final result = await _callMcp(
      token: _account.mcpToken,
      toolName: 'modify_position',
      arguments: {
        'positionId': positionId,
        'stopLossPrice': stopLoss,
        'takeProfitPrice': takeProfit,
      },
    );
    return result != null;
  }

  // ─────────────────────────────────────────
  //  POLLING — refresca posiciones cada 5s
  // ─────────────────────────────────────────
  void _startPolling(String token) {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      if (!_account.isConnected) return;
      await _refreshPositions();
    });
  }

  Future<void> _refreshPositions() async {
    final positionsData = await _callMcp(
      token: _account.mcpToken,
      toolName: 'get_open_positions',
    );

    // También refresca la info de cuenta para balance/equity actualizado
    final accountData = await _callMcp(
      token: _account.mcpToken,
      toolName: 'get_account_info',
    );

    if (positionsData != null || accountData != null) {
      final positions = _parsePositions(positionsData);
      final balance = accountData != null
          ? _toDouble(accountData['balance'] ?? accountData['Balance'] ?? _account.balance)
          : _account.balance;
      final equity = accountData != null
          ? _toDouble(accountData['equity'] ?? accountData['Equity'] ?? _account.equity)
          : _account.equity;
      final margin = accountData != null
          ? _toDouble(accountData['margin'] ?? accountData['Margin'] ?? _account.margin)
          : _account.margin;

      _account = CTraderAccount(
        isConnected: true,
        mcpToken: _account.mcpToken,
        balance: balance,
        equity: equity,
        margin: margin,
        freeMargin: equity - margin,
        positions: positions,
      );
      notifyListeners();
    }
  }

  // ─────────────────────────────────────────
  //  HELPERS — parseo y utilidades
  // ─────────────────────────────────────────
  List<CTraderPosition> _parsePositions(Map<String, dynamic>? data) {
    if (data == null) return [];

    try {
      // El MCP puede devolver las posiciones en distintos campos
      final rawList = data['positions']
          ?? data['openPositions']
          ?? data['data']
          ?? [];

      if (rawList is! List) return [];

      return rawList.map<CTraderPosition>((p) {
        return CTraderPosition(
          id: p['positionId']?.toString()
              ?? p['id']?.toString()
              ?? p['PositionId']?.toString()
              ?? 'N/A',
          pair: p['symbol']?.toString()
              ?? p['Symbol']?.toString()
              ?? p['pair']?.toString()
              ?? 'UNKNOWN',
          direction: _parseDirection(
            p['tradeSide'] ?? p['TradeSide'] ?? p['direction'] ?? 'BUY',
          ),
          lots: _toDouble(p['volume'] ?? p['lots'] ?? 0) / 100000,
          entryPrice: _toDouble(p['entryPrice'] ?? p['EntryPrice'] ?? p['openPrice'] ?? 0),
          currentPrice: _toDouble(p['currentPrice'] ?? p['CurrentPrice'] ?? p['price'] ?? 0),
          pnl: _toDouble(p['grossProfit'] ?? p['netProfit'] ?? p['pnl'] ?? p['Pnl'] ?? 0),
          stopLoss: _toDouble(p['stopLoss'] ?? p['StopLoss'] ?? p['sl'] ?? 0),
          takeProfit: _toDouble(p['takeProfit'] ?? p['TakeProfit'] ?? p['tp'] ?? 0),
          openTime: p['openTime']?.toString()
              ?? p['createTime']?.toString()
              ?? DateTime.now().toLocal().toString().substring(11, 19),
        );
      }).toList();
    } catch (e) {
      debugPrint('❌ Error parseando posiciones: $e');
      return [];
    }
  }

  void _updateAccountPositions(List<CTraderPosition> positions) {
    final openPnl = positions.fold(0.0, (acc, p) => acc + p.pnl);
    _account = CTraderAccount(
      isConnected: _account.isConnected,
      mcpToken: _account.mcpToken,
      balance: _account.balance,
      equity: _account.balance + openPnl,
      margin: positions.length * 150.0,
      freeMargin: _account.balance + openPnl - (positions.length * 150.0),
      positions: positions,
    );
    notifyListeners();
  }

  String _parseDirection(dynamic value) {
    final str = value.toString().toLowerCase();
    if (str.contains('buy') || str.contains('long') || str == '1') return 'BUY';
    return 'SELL';
  }

  double _toDouble(dynamic value) {
    if (value == null) return 0.0;
    if (value is double) return value;
    if (value is int) return value.toDouble();
    return double.tryParse(value.toString()) ?? 0.0;
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }
}
