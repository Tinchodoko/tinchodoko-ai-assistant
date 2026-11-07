import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/foundation.dart';
import 'package:crypto/crypto.dart' as crypto;
import '../models/market_data.dart';

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
  double _balance = 0;
  double _equity = 0;
  double _usedMargin = 0;
  String _currency = '';
  String _lastError = '';
  List<Map<String, dynamic>> _positions = [];
  Map<String, ExnessTick> _liveTicks = {};

  bool get isConnected => _isConnected;
  String get lastError => _lastError;
  String get currency => _currency;
  double get usedMargin => _usedMargin;
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

  /// The mobile UI must use the TypeScript Exness backend.
  /// Direct Dart signing/network access is deliberately disabled to avoid
  /// maintaining a second authentication implementation.
  Future<bool> connect({
    required String apiKey,
    required String privateKey,
    required String accountId,
    required String gatewayUrl,
    String gatewayIp = '',
  }) async {
    _isLoading = true;
    _lastError = '';
    notifyListeners();

    try {
      if (apiKey.trim().isEmpty ||
          privateKey.trim().isEmpty ||
          accountId.trim().isEmpty ||
          gatewayUrl.trim().isEmpty) {
        throw ArgumentError('Complete Gateway, API Key, Secret and Account ID.');
      }

      // No TypeScript backend URL is configured in this Android build yet.
      // Never report a connection using fabricated account data.
      throw StateError(
        'Exness TypeScript backend is not connected to this Android app yet. '
        'No request was sent and no account data was loaded.',
      );
    } catch (error) {
      _isConnected = false;
      _accessPoint = null;
      _balance = 0;
      _equity = 0;
      _usedMargin = 0;
      _currency = '';
      _positions = [];
      _lastError = error.toString().replaceFirst('Bad state: ', '');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    _lastError = 'Account refresh is unavailable until the TypeScript backend is connected.';
    notifyListeners();
  }

  Future<List<String>> getAvailableInstruments() async {
    throw StateError(
      'Instrument discovery is unavailable until the TypeScript backend is connected.',
    );
  }

  Future<List<Candle>> fetchMarketCandles({
    required String instrument,
    required String timeframe,
  }) async {
    throw StateError(
      'Market candle retrieval is unavailable until the TypeScript backend is connected.',
    );
  }

  void disconnect() {
    _isConnected = false;
    _accessPoint = null;
    notifyListeners();
  }

  /// Order execution is intentionally disabled in this read-only rebuild.
  Future<Map<String, dynamic>> openPosition({
    required ExnessCredentials creds,
    required String instrument,
    required String side,
    required double volume,
  }) async {
    throw StateError('Trading execution is disabled. This build is read-only.');
  }

}
