import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:crypto/crypto.dart' as crypto;

class ExnessCredentials {
  final String apiKey;
  final String privateKeyHex;
  final String accountId;
  final String discoveryBaseUrl;

  ExnessCredentials({
    required this.apiKey,
    required this.privateKeyHex,
    required this.accountId,
    required this.discoveryBaseUrl,
  });
}

class ExnessTick {
  final String instrument;
  final double bid;
  final double ask;
  final double mid;
  final double spread;
  final String direction;

  ExnessTick({
    required this.instrument,
    required this.bid,
    required this.ask,
    required this.mid,
    required this.spread,
    required this.direction,
  });
}

class ExnessService extends ChangeNotifier {
  bool _isConnected = false;
  bool _isLoading = false;
  String? _accessPoint;
  double _balance = 12450.0;
  double _equity = 12720.0;
  List<Map<String, dynamic>> _positions = [];
  Map<String, ExnessTick> _liveTicks = {};

  bool get isConnected => _isConnected;
  bool get isLoading => _isLoading;
  String? get accessPoint => _accessPoint;
  double get balance => _balance;
  double get equity => _equity;
  List<Map<String, dynamic>> get positions => _positions;
  Map<String, ExnessTick> get liveTicks => _liveTicks;

  /// Helper to base64url encode without padding
  static String base64UrlNoPadding(List<int> bytes) {
    return base64UrlEncode(bytes).replaceAll('=', '');
  }

  /// Calculates the SHA256 body hash for Exness headers
  static String calculateBodyHash(List<int> bodyBytes) {
    final digest = crypto.sha256.convert(bodyBytes);
    return base64UrlNoPadding(digest.bytes);
  }

  /// Builds signed headers for Exness API requests using Ed25519
  static Future<Map<String, String>> buildSignedHeaders({
    required String apiKey,
    required String privateKeyHex,
    required String method,
    required String pathWithQuery,
    Map<String, dynamic>? body,
    String idempotencyKey = '',
    int? timestampOverride,
  }) async {
    final timestamp = timestampOverride ?? DateTime.now().millisecondsSinceEpoch;
    final bodyBytes = body != null ? utf8.encode(jsonEncode(body)) : <int>[];
    final bodyHash = calculateBodyHash(bodyBytes);

    final payloadMap = {
      'api_key': apiKey,
      'idempotency_key': idempotencyKey,
      'timestamp': timestamp,
      'sign_version': 1,
      'method': method,
      'path': pathWithQuery,
      'body_hash': bodyHash,
    };

    final payloadBytes = utf8.encode(jsonEncode(payloadMap));
    final exnData = base64UrlNoPadding(payloadBytes);

    // Ed25519 signing using cryptography package
    final algorithm = Ed25519();
    final cleanHex = privateKeyHex.trim();
    final seedBytes = <int>[];
    for (int i = 0; i < 64; i += 2) {
      seedBytes.add(int.parse(cleanHex.substring(i, i + 2), radix: 16));
    }

    final keyPair = await algorithm.newKeyPairFromSeed(seedBytes);
    final signature = await algorithm.sign(payloadBytes, keyPair: keyPair);
    final exnSign = base64UrlNoPadding(signature.bytes);

    return {
      'EXN-API-KEY': apiKey,
      'EXN-IDEMPOTENCY-KEY': idempotencyKey,
      'EXN-TIMESTAMP': timestamp.toString(),
      'EXN-SIGN-VERSION': '1',
      'EXN-DATA': exnData,
      'EXN-SIGN': exnSign,
    };
  }

  /// Connects to Exness Gateway and discovers Access Point
  Future<bool> connect(ExnessCredentials creds) async {
    _isLoading = true;
    notifyListeners();

    try {
      final path = '/v1/trading/access-point?account_id=${creds.accountId}';
      final headers = await buildSignedHeaders(
        apiKey: creds.apiKey,
        privateKeyHex: creds.privateKeyHex,
        method: 'GET',
        pathWithQuery: path,
      );

      // In production: perform GET request to creds.discoveryBaseUrl + path
      // final res = await http.get(Uri.parse(creds.discoveryBaseUrl + path), headers: headers);
      // final json = jsonDecode(res.body);
      // _accessPoint = json['access_point'];

      await Future.delayed(const Duration(milliseconds: 1000));
      _accessPoint = 'https://ap-eu1.exness.gateway';
      _isConnected = true;
      _isLoading = false;

      // Seed initial mock Exness positions
      _positions = [
        {
          'id': 'EXN-501',
          'pair': 'XAUUSD',
          'direction': 'BUY',
          'lots': 0.20,
          'entryPrice': 2742.30,
          'currentPrice': 2745.10,
          'pnl': 56.0,
          'stopLoss': 2735.0,
          'takeProfit': 2760.0,
        },
        {
          'id': 'EXN-502',
          'pair': 'EURUSD',
          'direction': 'SELL',
          'lots': 0.50,
          'entryPrice': 1.0855,
          'currentPrice': 1.0848,
          'pnl': 35.0,
          'stopLoss': 1.0890,
          'takeProfit': 1.0810,
        }
      ];

      notifyListeners();
      return true;
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  void disconnect() {
    _isConnected = false;
    _accessPoint = null;
    notifyListeners();
  }

  /// Open market position on Exness Access Point
  Future<Map<String, dynamic>> openPosition({
    required ExnessCredentials creds,
    required String instrument,
    required String side, // 'buy' or 'sell'
    required double volume,
  }) async {
    final idempotencyKey = 'open-${DateTime.now().millisecondsSinceEpoch}';
    final path = '/v1/trading/accounts/${creds.accountId}/positions';
    final body = {
      'instrument': instrument,
      'side': side.toLowerCase(),
      'volume': volume,
    };

    final headers = await buildSignedHeaders(
      apiKey: creds.apiKey,
      privateKeyHex: creds.privateKeyHex,
      method: 'POST',
      pathWithQuery: path,
      body: body,
      idempotencyKey: idempotencyKey,
    );

    // In production, execute HTTP POST to accessPoint + path with headers and body
    final newPos = {
      'id': 'EXN-${DateTime.now().millisecondsSinceEpoch % 10000}',
      'pair': instrument,
      'direction': side.toUpperCase(),
      'lots': volume,
      'entryPrice': instrument == 'XAUUSD' ? 2743.0 : 1.0850,
      'currentPrice': instrument == 'XAUUSD' ? 2743.0 : 1.0850,
      'pnl': 0.0,
      'stopLoss': side.toUpperCase() == 'BUY' ? 2735.0 : 2750.0,
      'takeProfit': side.toUpperCase() == 'BUY' ? 2760.0 : 2725.0,
    };
    _positions.insert(0, newPos);
    notifyListeners();

    return {
      'status': 'ACK',
      'operation_id': 'op_${DateTime.now().millisecondsSinceEpoch}',
      'client_request_id': idempotencyKey,
    };
  }
}
