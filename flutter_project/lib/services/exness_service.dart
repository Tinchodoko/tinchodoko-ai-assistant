import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'exness_request_signer.dart';
import 'secure_storage_service.dart';

const String exnessMainGateway = 'https://api.exness.com';
const String exnessAlternativeGateway =
    'https://api.exness-api.com';

class ExnessPosition {
  const ExnessPosition({
    required this.id,
    required this.instrument,
    required this.direction,
    required this.volume,
    required this.initialVolume,
    required this.openPrice,
    required this.commission,
    required this.swap,
    required this.openedAt,
  });

  final String id;
  final String instrument;
  final String direction;
  final String volume;
  final String initialVolume;
  final String openPrice;
  final String commission;
  final String swap;
  final String openedAt;

  factory ExnessPosition.fromJson(Map<String, dynamic> json) {
    return ExnessPosition(
      id: json['position_id']?.toString() ?? '',
      instrument: json['instrument']?.toString() ?? '—',
      direction: (json['direction']?.toString() ?? '').toUpperCase(),
      volume: json['volume']?.toString() ?? '—',
      initialVolume: json['initial_volume']?.toString() ?? '—',
      openPrice: json['open_price']?.toString() ?? '—',
      commission: json['commission']?.toString() ?? '0',
      swap: json['swap']?.toString() ?? '0',
      openedAt: json['create_time']?.toString() ?? '',
    );
  }
}

class ExnessService extends ChangeNotifier {
  ExnessService({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;
  bool _isLoading = false;
  bool _isConnected = false;
  String _lastError = '';
  String _accountId = '';
  String _currency = '';
  String _accessPoint = '';
  String _balance = '—';
  String _equity = '—';
  String _usedMargin = '—';
  List<ExnessPosition> _positions = const [];
  Map<String, dynamic> _accountDetails = const {};
  String? _apiKey;
  String? _privateKey;
  ExnessRequestSigner? _signer;

  bool get isLoading => _isLoading;
  bool get isConnected => _isConnected;
  String get lastError => _lastError;
  String get accountId => _accountId;
  String get currency => _currency;
  String get accessPoint => _accessPoint;
  String get balance => _balance;
  String get equity => _equity;
  String get usedMargin => _usedMargin;
  List<ExnessPosition> get positions => List.unmodifiable(_positions);
  Map<String, dynamic> get accountDetails =>
      Map.unmodifiable(_accountDetails);

  Future<bool> connect({
    required String apiKey,
    required String privateKey,
    required String accountId,
  }) async {
    final cleanApiKey = apiKey.trim();
    final cleanPrivateKey = privateKey.trim();
    final cleanAccountId = accountId.trim();

    if (cleanApiKey.isEmpty ||
        cleanPrivateKey.isEmpty ||
        !RegExp(r'^[1-9][0-9]{0,19}$').hasMatch(cleanAccountId)) {
      _lastError = 'Enter a valid API key, private key and trading account ID.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _lastError = '';
    notifyListeners();

    try {
      // Validate key format and its embedded public-key half before saving.
      final signer = ExnessRequestSigner(
        apiKey: cleanApiKey,
        privateKeyHex: cleanPrivateKey,
      );
      await signer.buildGetHeaders(
        pathWithQuery: '/v1/trading/access-point?account_id=$cleanAccountId',
      );

      await SecureStorageService.saveExnessCredentials(
        apiKey: cleanApiKey,
        privateKey: cleanPrivateKey,
        accountId: cleanAccountId,
      );

      _signer?.dispose();
      _signer = signer;
      _apiKey = cleanApiKey;
      _privateKey = cleanPrivateKey;
      _accountId = cleanAccountId;

      final cachedAccessPoint =
          await SecureStorageService.getExnessAccessPoint(cleanAccountId);
      if (cachedAccessPoint != null && cachedAccessPoint.isNotEmpty) {
        _accessPoint = _validateBaseUrl(cachedAccessPoint);
      } else {
        _accessPoint = await _discoverAccessPoint();
        await SecureStorageService.saveExnessAccessPoint(
          accountId: cleanAccountId,
          accessPoint: _accessPoint,
        );
      }

      await _loadAccountSnapshot();
      _isConnected = true;
      _isLoading = false;
      _lastError = '';
      notifyListeners();
      return true;
    } on TimeoutException {
      _lastError = 'The Exness API request timed out. Please try again.';
    } catch (error) {
      _lastError = _safeError(error);
    }

    _isConnected = false;
    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<bool> refresh() async {
    if (_apiKey == null || _privateKey == null || _accountId.isEmpty) {
      _lastError = 'Connect your Exness trading account first.';
      notifyListeners();
      return false;
    }
    _isLoading = true;
    _lastError = '';
    notifyListeners();
    try {
      if (_accessPoint.isEmpty) {
        _accessPoint = await _discoverAccessPoint();
        await SecureStorageService.saveExnessAccessPoint(
          accountId: _accountId,
          accessPoint: _accessPoint,
        );
      }
      await _loadAccountSnapshot();
      _isConnected = true;
      _isLoading = false;
      notifyListeners();
      return true;
    } on TimeoutException {
      _lastError = 'The Exness API request timed out. Please try again.';
    } catch (error) {
      _lastError = _safeError(error);
    }
    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<String> _discoverAccessPoint() async {
    final path =
        '/v1/trading/access-point?account_id=$_accountId';
    try {
      final response = await _getJson(exnessMainGateway, path);
      return _validateBaseUrl(response['access_point']?.toString() ?? '');
    } on ExnessApiException catch (error) {
      if (error.statusCode != 500 &&
          error.statusCode != 502 &&
          error.statusCode != 503 &&
          error.statusCode != 504) {
        rethrow;
      }
      final response = await _getJson(exnessAlternativeGateway, path);
      return _validateBaseUrl(response['access_point']?.toString() ?? '');
    } on SocketException {
      final response = await _getJson(exnessAlternativeGateway, path);
      return _validateBaseUrl(response['access_point']?.toString() ?? '');
    } on http.ClientException {
      final response = await _getJson(exnessAlternativeGateway, path);
      return _validateBaseUrl(response['access_point']?.toString() ?? '');
    } on TimeoutException {
      final response = await _getJson(exnessAlternativeGateway, path);
      return _validateBaseUrl(response['access_point']?.toString() ?? '');
    }
  }

  Future<void> _loadAccountSnapshot() async {
    final accountPath =
        '/v1/configuration/accounts/$_accountId/account';
    final snapshotPath = '/v1/trading/accounts/$_accountId/snapshot';

    final results = await Future.wait([
      _getJson(_accessPoint, accountPath),
      _getJson(_accessPoint, snapshotPath),
    ]);
    _accountDetails = results[0];
    final snapshot = results[1];
    final accountState = snapshot['account_state'];
    if (accountState is! Map) {
      throw const FormatException(
        'The Exness snapshot did not include account_state.',
      );
    }

    _balance = accountState['balance']?.toString() ?? '—';
    _equity = accountState['equity']?.toString() ?? '—';
    _usedMargin = accountState['used_margin']?.toString() ?? '—';
    _currency = _findCurrency(_accountDetails) ?? _currency;

    final rawPositions = snapshot['positions'];
    if (rawPositions is List) {
      _positions = rawPositions
          .whereType<Map>()
          .map((item) => ExnessPosition.fromJson(
                Map<String, dynamic>.from(item),
              ))
          .toList(growable: false);
    } else {
      _positions = const [];
    }
  }

  String? _findCurrency(Map<String, dynamic> values) {
    for (final key in const ['currency', 'account_currency', 'currency_code']) {
      final value = values[key];
      if (value is String && value.isNotEmpty) return value;
    }
    for (final value in values.values) {
      if (value is Map) {
        final nested = _findCurrency(Map<String, dynamic>.from(value));
        if (nested != null) return nested;
      }
    }
    return null;
  }

  String _validateBaseUrl(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        (uri.path.isNotEmpty && uri.path != '/') ||
        uri.hasQuery ||
        uri.hasFragment) {
      throw const FormatException(
        'Exness returned an invalid HTTPS Gateway or Access Point URL.',
      );
    }
    return uri.origin;
  }

  Future<Map<String, dynamic>> _getJson(
    String baseUrl,
    String pathWithQuery,
  ) async {
    final signer = _signer;
    if (signer == null) {
      throw StateError('The Exness signing credentials are not loaded.');
    }
    final request = http.Request(
      'GET',
      Uri.parse('$baseUrl$pathWithQuery'),
    )
      ..followRedirects = false
      ..headers.addAll(
        await signer.buildGetHeaders(pathWithQuery: pathWithQuery),
      );

    final streamed = await _client
        .send(request)
        .timeout(const Duration(seconds: 15));
    final response = await http.Response.fromStream(streamed)
        .timeout(const Duration(seconds: 15));

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = 'Exness API returned HTTP ${response.statusCode}.';
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map) {
          message = decoded['description']?.toString() ??
              decoded['message']?.toString() ??
              decoded['error']?.toString() ??
              message;
        }
      } catch (_) {}
      throw ExnessApiException(
        response.statusCode,
        message,
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw const FormatException('Exness API returned an unexpected JSON response.');
    }
    return Map<String, dynamic>.from(decoded);
  }

  String _safeError(Object error) {
    if (error is ExnessApiException) {
      return 'Exness API HTTP ${error.statusCode}: ${error.message}';
    }
    if (error is FormatException) return error.message;
    return error.toString().replaceFirst('Exception: ', '');
  }

  void disconnect() {
    _isConnected = false;
    _lastError = '';
    _positions = const [];
    _balance = '—';
    _equity = '—';
    _usedMargin = '—';
    notifyListeners();
  }

  @override
  void dispose() {
    _signer?.dispose();
    _client.close();
    super.dispose();
  }
}

class ExnessApiException implements Exception {
  const ExnessApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
}
