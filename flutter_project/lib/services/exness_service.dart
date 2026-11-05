import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'exness_dns_http_client.dart';
import 'exness_request_signer.dart';
import 'secure_storage_service.dart';
import '../models/market_data.dart';

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
  ExnessService({http.Client? client})
      : _client = client ?? ExnessDnsHttpClient();

  http.Client _client;
  bool _isLoading = false;
  bool _isConnected = false;
  String _lastError = '';
  String _accountId = '';
  String _gatewayUrl = '';
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
    required String gatewayUrl,
    String? gatewayIp,
  }) async {
    final cleanApiKey = apiKey.trim();
    final cleanPrivateKey = privateKey.trim();
    final cleanAccountId = accountId.trim();
    final cleanGatewayUrl = gatewayUrl.trim();

    if (cleanApiKey.isEmpty ||
        cleanGatewayUrl.isEmpty ||
        cleanPrivateKey.isEmpty ||
        !_isValidAccountId(cleanAccountId)) {
      _lastError = 'Enter the API key, private signing key, account ID and DNS Gateway URL.';
      notifyListeners();
      return false;
    }

    _isLoading = true;
    _isConnected = false;
    _lastError = '';
    notifyListeners();

    try {
      final validatedGatewayUrl = _validateBaseUrl(cleanGatewayUrl);
      final gatewayHost = Uri.parse(validatedGatewayUrl).host;
      final cleanGatewayIp = gatewayIp?.trim() ?? '';
      if (cleanGatewayIp.isNotEmpty) {
        final parsedIp = InternetAddress.tryParse(cleanGatewayIp);
        if (parsedIp == null) {
          throw const FormatException(
            'Gateway IP override must be a valid IPv4 or IPv6 address.',
          );
        }
      }
      // Apply the override only to the exact configured Gateway hostname.
      // Never reuse a Gateway IP for the separately discovered Access Point.
      if (_client is ExnessDnsHttpClient) {
        (_client as ExnessDnsHttpClient).setHostOverride(
          gatewayHost,
          cleanGatewayIp.isEmpty ? null : cleanGatewayIp,
        );
      } else if (cleanGatewayIp.isNotEmpty) {
        throw StateError(
          'Manual Gateway IP override is unavailable with the injected HTTP client.',
        );
      }

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
        gatewayUrl: validatedGatewayUrl,
      );
      await SecureStorageService.saveGatewayIp(cleanGatewayIp);

      _signer?.dispose();
      _signer = signer;
      _apiKey = cleanApiKey;
      _privateKey = cleanPrivateKey;
      _accountId = cleanAccountId;
      _gatewayUrl = validatedGatewayUrl;

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
    } on TimeoutException catch (error) {
      _lastError = _safeError(error);
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
    } on TimeoutException catch (error) {
      _lastError = _safeError(error);
    } catch (error) {
      _lastError = _safeError(error);
    }
    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<List<String>> getAvailableInstruments() async {
    _requireConnectedMarketAccess();
    final path = '/v1/configuration/accounts/$_accountId/instruments';
    final response = await _getJson(
      _accessPoint,
      path,
      stage: 'market instrument lookup',
    );
    final raw = response['instruments'];
    if (raw is! List) {
      throw const FormatException('Exness returned an invalid instrument list.');
    }
    return raw
        .map((value) => value.toString())
        .where((value) => value.isNotEmpty)
        .toList()
      ..sort();
  }

  Future<List<Candle>> fetchMarketCandles({
    required String instrument,
    required String timeframe,
    int candleCount = 220,
  }) async {
    _requireConnectedMarketAccess();
    final symbolPattern = RegExp(r'^[A-Za-z0-9._-]+');
    if (instrument.isEmpty ||
        instrument.length > 11 ||
        symbolPattern.stringMatch(instrument) != instrument) {
      throw const FormatException('Invalid Exness instrument symbol.');
    }
    const allowedTimeframes = {
      'S1', 'S5', 'S15', 'M1', 'M3', 'M5', 'M10', 'M15',
      'M30', 'H1', 'H2', 'H4', 'D1', 'W1', 'MN',
    };
    if (!allowedTimeframes.contains(timeframe)) {
      throw const FormatException('Unsupported Exness candle timeframe.');
    }
    final secondsByTimeframe = {
      'S1': 1, 'S5': 5, 'S15': 15, 'M1': 60, 'M3': 180,
      'M5': 300, 'M10': 600, 'M15': 900, 'M30': 1800,
      'H1': 3600, 'H2': 7200, 'H4': 14400, 'D1': 86400,
      'W1': 604800, 'MN': 2592000,
    };
    final now = DateTime.now().toUtc();
    final from = now.subtract(Duration(
      seconds: secondsByTimeframe[timeframe]! * candleCount,
    ));
    final query = Uri(queryParameters: {
      'instrument': instrument,
      'timeframe': timeframe,
      'price_type': 'bid',
      'from': from.toIso8601String(),
      'to': now.toIso8601String(),
    }).query;
    final path = '/v1/market-data/accounts/$_accountId/candles?$query';
    final response = await _getJson(
      _accessPoint,
      path,
      stage: 'market candle request',
    );
    final raw = response['candles'];
    if (raw is! List) {
      throw const FormatException('Exness returned an invalid candle history.');
    }
    return raw.whereType<Map>().map((item) {
      final value = Map<String, dynamic>.from(item);
      return Candle(
        datetime: value['time']?.toString() ?? '',
        open: _toDouble(value['open']),
        high: _toDouble(value['high']),
        low: _toDouble(value['low']),
        close: _toDouble(value['close']),
        volume: _toDouble(value['volume']),
      );
    }).toList(growable: false);
  }

  void _requireConnectedMarketAccess() {
    if (!_isConnected ||
        _accountId.isEmpty ||
        _accessPoint.isEmpty ||
        _signer == null) {
      throw StateError(
        'Connect an eligible Exness account before requesting market data.',
      );
    }
  }

  double _toDouble(dynamic value) =>
      value == null ? 0.0 : double.tryParse(value.toString()) ?? 0.0;

  Future<String> _discoverAccessPoint() async {
    // Exness requires the Gateway host from Key Management for discovery.
    // The published api.exness.com / api.exness-api.com review hosts are not
    // interchangeable fallback hosts for Trader API discovery.
    final path = '/v1/trading/access-point?account_id=$_accountId';
    final response = await _getJson(
      _gatewayUrl,
      path,
      stage: 'Gateway Access Point discovery',
    );
    final value = response['access_point']?.toString() ?? '';
    if (value.isEmpty) {
      throw const FormatException(
        'Exness Gateway discovery response is missing access_point.',
      );
    }
    return _validateBaseUrl(value);
  }

  Future<void> _loadAccountSnapshot() async {
    // First verified read-only account request from Exness support/docs.
    // Do not block a successful connection on an unverified snapshot route.
    final accountPath =
        '/v1/configuration/accounts/$_accountId/account';
    _accountDetails = await _getJson(
      _accessPoint,
      accountPath,
      stage: 'read-only account details request',
    );

    // Account configuration does not guarantee live balance/equity or
    // open-position fields. Keep them unavailable until their exact
    // documented read endpoints and response schemas are integrated.
    _balance = '—';
    _equity = '—';
    _usedMargin = '—';
    _positions = const [];
    _currency = _findCurrency(_accountDetails) ?? _currency;
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

  bool _isValidAccountId(String value) {
    if (!RegExp(r'^[1-9][0-9]*$').hasMatch(value)) return false;
    final id = BigInt.tryParse(value);
    return id != null &&
        id > BigInt.zero &&
        id <= BigInt.parse('18446744073709551615');
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
    String pathWithQuery, {
    String stage = 'Exness API request',
  }) async {
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

    // Exness' complete read-only example uses a 15-second request timeout.
    // Apply one total deadline to connection + response body, and identify
    // the exact API stage in the resulting error without logging credentials.
    final response = await (() async {
      final streamed = await _client.send(request);
      return http.Response.fromStream(streamed);
    })().timeout(
      const Duration(seconds: 15),
      onTimeout: () => throw TimeoutException(
        'Timed out during $stage after 15 seconds. Check the configured '
        'Gateway/Access Point hostname, network connectivity and Exness API availability.',
        const Duration(seconds: 15),
      ),
    );

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
    if (error is TimeoutException) {
      return error.message ?? 'Exness API request timed out.';
    }
    if (error is ExnessApiException) {
      return 'Exness API HTTP ${error.statusCode}: ${error.message}';
    }
    if (error is SocketException) {
      final detail = error.message;
      final normalized = detail.toLowerCase();
      final isDnsFailure = normalized.contains('failed host lookup') ||
          normalized.contains('name or service not known') ||
          normalized.contains('nodename nor servname') ||
          normalized.contains('getaddrinfo') ||
          normalized.contains('no address associated with hostname') ||
          normalized.contains('could not resolve') ||
          normalized.contains('https dns fallback');
      if (isDnsFailure) {
        final host = _gatewayUrl.isEmpty ? 'configured Exness Gateway' : Uri.parse(_gatewayUrl).host;
        return 'DNS lookup failed for ${error.address?.host ?? host}: $detail';
      }
      final osDetail = error.osError == null
          ? ''
          : ' (OS ${error.osError!.errorCode}: ${error.osError!.message})';
      return 'Network socket error while contacting Exness: $detail$osDetail';
    }
    if (error is http.ClientException) {
      return 'HTTP client connection error: ${error.message}';
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
