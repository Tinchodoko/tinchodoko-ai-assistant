import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/ctrader_account.dart';

const String _kMcpEndpoint = 'https://mcp.ctrader.com/trading/mcp';

class CTraderService extends ChangeNotifier {
  CTraderAccount _account = CTraderAccount.disconnected();
  bool _isLoading = false;
  String _lastError = '';
  String _protocolVersion = '';
  String? _sessionId;
  List<Map<String, dynamic>> _availableTools = [];

  CTraderAccount get account => _account;
  bool get isLoading => _isLoading;
  bool get isConnected => _account.isConnected;
  String get lastError => _lastError;
  String get protocolVersion => _protocolVersion;
  List<Map<String, dynamic>> get availableTools => List.unmodifiable(_availableTools);

  Map<String, dynamic>? _decodeJsonRpcResponse(http.Response response) {
    final contentType = response.headers['content-type']?.toLowerCase() ?? '';
    final body = response.body.trim();
    if (body.isEmpty) return null;

    if (contentType.contains('text/event-stream') || body.startsWith('event:') || body.startsWith('data:')) {
      final messages = <Map<String, dynamic>>[];
      final dataLines = <String>[];
      for (final line in const LineSplitter().convert(body)) {
        if (line.startsWith('data:')) {
          dataLines.add(line.substring(5).trimLeft());
        } else if (line.isEmpty && dataLines.isNotEmpty) {
          final data = dataLines.join('\n');
          dataLines.clear();
          try {
            final decoded = jsonDecode(data);
            if (decoded is Map<String, dynamic>) messages.add(decoded);
          } catch (_) {}
        }
      }
      if (dataLines.isNotEmpty) {
        try {
          final decoded = jsonDecode(dataLines.join('\n'));
          if (decoded is Map<String, dynamic>) messages.add(decoded);
        } catch (_) {}
      }
      if (messages.isNotEmpty) return messages.last;
    }

    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) return decoded;
    throw const FormatException('El servidor MCP devolvió una respuesta JSON inesperada.');
  }

  Future<Map<String, dynamic>> _postRpc({
    required String token,
    required Map<String, dynamic> payload,
    String? protocolVersion,
    String? sessionId,
  }) async {
    final headers = <String, String>{
      'Authorization': 'Bearer $token',
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (protocolVersion != null && protocolVersion.isNotEmpty) {
      headers['MCP-Protocol-Version'] = protocolVersion;
      if (protocolVersion == '2026-07-28') {
        headers['Mcp-Method'] = payload['method']?.toString() ?? '';
        final params = payload['params'];
        if (params is Map && params['name'] != null) {
          headers['Mcp-Name'] = params['name'].toString();
        }
      }
    }
    if (sessionId != null && sessionId.isNotEmpty) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    final response = await http.post(
      Uri.parse(_kMcpEndpoint),
      headers: headers,
      body: jsonEncode(payload),
    ).timeout(const Duration(seconds: 30));

    final sessionHeader = response.headers['mcp-session-id'];
    if (sessionHeader != null && sessionHeader.isNotEmpty) {
      _sessionId = sessionHeader;
    }
    Map<String, dynamic>? decoded;
    try {
      decoded = _decodeJsonRpcResponse(response);
    } catch (error) {
      if (response.statusCode == 200 || response.statusCode == 202) rethrow;
    }
    if (response.statusCode != 200 && response.statusCode != 202) {
      final rpcError = decoded?['error'];
      final message = rpcError is Map
          ? (rpcError['message']?.toString() ?? 'Error MCP sin descripción')
          : (response.body.trim().isEmpty
              ? 'El servidor respondió HTTP ' + response.statusCode.toString() + '.'
              : response.body.trim());
      throw _McpRequestException(
        'HTTP ' + response.statusCode.toString() + ': ' + message,
        statusCode: response.statusCode,
        rpcCode: rpcError is Map ? rpcError['code'] as int? : null,
      );
    }

    if (decoded == null) {
      if (payload['id'] == null) return <String, dynamic>{};
      throw const FormatException('El servidor MCP respondió sin contenido.');
    }
    if (decoded['error'] != null) {
      final error = decoded['error'];
      final message = error is Map
          ? error['message']?.toString() ?? 'Error JSON-RPC desconocido'
          : error.toString();
      throw _McpRequestException(
        message,
        rpcCode: error is Map ? error['code'] as int? : null,
      );
    }
    return decoded;
  }

  Future<void> _initialize(String token) async {
    const versions = ['2025-11-25', '2025-06-18', '2025-03-26'];
    Object? lastError;

    for (final version in versions) {
      try {
        final response = await _postRpc(
          token: token,
          payload: {
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'initialize',
            'params': {
              'protocolVersion': version,
              'capabilities': <String, dynamic>{},
              'clientInfo': {
                'name': 'Tinchodoko AI Assistant',
                'version': '1.0.0',
              },
            },
          },
        );

        final result = response['result'];
        if (result is! Map) {
          throw const FormatException('La respuesta initialize no contiene result.');
        }
        _protocolVersion = result['protocolVersion']?.toString() ?? version;
        await _postRpc(
          token: token,
          protocolVersion: _protocolVersion,
          sessionId: _sessionId,
          payload: {
            'jsonrpc': '2.0',
            'method': 'notifications/initialized',
          },
        );
        return;
      } on _McpRequestException catch (error) {
        lastError = error;
        if (error.rpcCode == -32601 ||
            error.message.contains('2026-07-28')) {
          // MCP 2026-07-28 elimina initialize y sesiones: la primera
          // solicitud real debe llevar metadatos en cada POST.
          _protocolVersion = '2026-07-28';
          return;
        }
        final isVersionMismatch = error.statusCode == 400 ||
            error.message.toLowerCase().contains('protocol version') ||
            error.message.toLowerCase().contains('unsupported');
        if (!isVersionMismatch) rethrow;
      }
    }
    throw lastError ?? Exception('No se pudo negociar una versión MCP compatible.');
  }

  Future<List<Map<String, dynamic>>> _listTools(String token) async {
    final tools = <Map<String, dynamic>>[];
    String? cursor;

    for (var page = 0; page < 10; page++) {
      final response = await _postRpc(
        token: token,
        protocolVersion: _protocolVersion,
        sessionId: _sessionId,
        payload: {
          'jsonrpc': '2.0',
          'id': 2 + page,
          'method': 'tools/list',
          'params': {
            if (cursor != null) 'cursor': cursor,
            if (_protocolVersion == '2026-07-28') '_meta': {
              'io.modelcontextprotocol/protocolVersion': '2026-07-28',
              'io.modelcontextprotocol/clientInfo': {
                'name': 'Tinchodoko AI Assistant',
                'version': '1.0.0',
              },
              'io.modelcontextprotocol/clientCapabilities': <String, dynamic>{},
            },
          },
        },
      );
      final result = response['result'];
      if (result is! Map) {
        throw const FormatException('tools/list no devolvió un objeto result válido.');
      }
      final pageTools = result['tools'];
      if (pageTools is List) {
        for (final tool in pageTools) {
          if (tool is Map) tools.add(Map<String, dynamic>.from(tool));
        }
      }
      cursor = result['nextCursor']?.toString();
      if (cursor == null || cursor.isEmpty) break;
    }

    if (tools.isEmpty) {
      throw Exception('MCP respondió correctamente, pero no publicó herramientas en tools/list.');
    }
    return tools;
  }

  Future<bool> connect(String token) async {
    final cleanToken = token.trim();
    if (cleanToken.isEmpty) {
      _lastError = 'Ingresa el token MCP de cTrader Remote.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _lastError = '';
    _availableTools = [];
    _protocolVersion = '';
    _sessionId = null;
    notifyListeners();

    try {
      await _initialize(cleanToken);
      _availableTools = await _listTools(cleanToken);
      _account = CTraderAccount(
        isConnected: true,
        mcpToken: cleanToken,
        balance: 0,
        equity: 0,
        margin: 0,
        freeMargin: 0,
        positions: const [],
      );
      _isLoading = false;
      notifyListeners();
      return true;
    } on TimeoutException {
      _lastError = 'Tiempo de espera agotado al conectar con cTrader Remote MCP.';
    } catch (error) {
      _lastError = error.toString().replaceFirst('Exception: ', '');
    }

    _account = CTraderAccount.disconnected();
    _availableTools = [];
    _isLoading = false;
    notifyListeners();
    return false;
  }

  void disconnect() {
    _account = CTraderAccount.disconnected();
    _availableTools = [];
    _protocolVersion = '';
    _sessionId = null;
    _lastError = '';
    notifyListeners();
  }

  // Trading queda deshabilitado hasta validar los nombres y esquemas reales.
  Future<bool> closePosition(String positionId) async {
    _lastError = 'La operación está pendiente de validar con el esquema MCP real de cTrader.';
    notifyListeners();
    return false;
  }

  Future<bool> executeOrder({
    required String pair,
    required String direction,
    required double lots,
    required double entryPrice,
    required double stopLoss,
    required double takeProfit,
  }) async {
    _lastError = 'La ejecución de órdenes se habilitará después de validar las herramientas y parámetros publicados por cTrader.';
    notifyListeners();
    return false;
  }

  Future<bool> modifyPosition({
    required String positionId,
    required double stopLoss,
    required double takeProfit,
  }) async {
    _lastError = 'La modificación de posiciones está pendiente de validar el esquema MCP real de cTrader.';
    notifyListeners();
    return false;
  }

  @override
  void dispose() {
    super.dispose();
  }
}

class _McpRequestException implements Exception {
  final String message;
  final int? statusCode;
  final int? rpcCode;

  const _McpRequestException(
    this.message, {
    this.statusCode,
    this.rpcCode,
  });

  @override
  String toString() => message;
}
