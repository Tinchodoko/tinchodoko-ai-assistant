import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

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
  // Use the normal Android resolver first. If it cannot resolve Render, retry
  // through DNS-over-HTTPS using resolver IPs and verified TLS/SNI hostnames.
  static const String _backendHost = 'tinchodoko-bridge.onrender.com';

  static Future<List<InternetAddress>> _resolveBackendHost(String host) async {
    try {
      final systemAddresses = await InternetAddress.lookup(host)
          .timeout(const Duration(seconds: 4));
      if (systemAddresses.isNotEmpty) return systemAddresses;
    } catch (_) {
      // Continue with DNS-over-HTTPS when the device resolver fails.
    }

    const resolvers = <({String host, String ip, String path})>[
      (host: 'cloudflare-dns.com', ip: '1.1.1.1', path: '/dns-query'),
      (host: 'dns.google', ip: '8.8.8.8', path: '/resolve'),
    ];

    for (final resolver in resolvers) {
      final resolverClient = HttpClient()
        ..connectionFactory = (uri, proxyHost, proxyPort) {
          // Connect to the resolver IP, while HttpClient retains the URL host
          // for TLS SNI and certificate hostname verification.
          return Socket.startConnect(
            InternetAddress(resolver.ip),
            uri.port,
          );
        };

      try {
        final uri = Uri.https(
          resolver.host,
          resolver.path,
          <String, String>{'name': host, 'type': 'A'},
        );
        final request = await resolverClient.getUrl(uri)
            .timeout(const Duration(seconds: 6));
        request.headers.set(HttpHeaders.acceptHeader, 'application/dns-json');
        final response = await request.close()
            .timeout(const Duration(seconds: 6));
        if (response.statusCode != HttpStatus.ok) continue;

        final payload = jsonDecode(await response.transform(utf8.decoder).join());
        final answers = payload is Map<String, dynamic> ? payload['Answer'] : null;
        if (answers is! List) continue;

        final addresses = <InternetAddress>[];
        for (final answer in answers) {
          if (answer is! Map<String, dynamic> || answer['type'] != 1) continue;
          final value = answer['data'];
          if (value is! String) continue;
          try {
            addresses.add(InternetAddress(value));
          } on FormatException {
            // Ignore non-address DNS answer data.
          }
        }
        if (addresses.isNotEmpty) return addresses;
      } catch (_) {
        // Try the next independent DoH resolver.
      } finally {
        resolverClient.close(force: true);
      }
    }

    throw SocketException('Unable to resolve $host using system DNS or DNS-over-HTTPS.');
  }

  static http.Client _createBackendHttpClient() {
    final ioClient = HttpClient()
      ..connectionFactory = (uri, proxyHost, proxyPort) async {
        if (proxyHost != null && proxyPort != null) {
          return Socket.startConnect(proxyHost, proxyPort);
        }
        if (uri.host != _backendHost) {
          return Socket.startConnect(uri.host, uri.port);
        }
        final addresses = await _resolveBackendHost(uri.host);
        final ipv4 = addresses.where(
          (address) => address.type == InternetAddressType.IPv4,
        );
        final selected = ipv4.isNotEmpty ? ipv4.first : addresses.first;
        return Socket.startConnect(selected, uri.port);
      };
    return IOClient(ioClient);
  }
  static const String _backendBaseUrl = 'https://tinchodoko-bridge.onrender.com';
  // Render Free services can take a while to wake after inactivity.
  static const Duration _requestTimeout = Duration(seconds: 90);

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
  Map<String, dynamic> _account = {};

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
  Map<String, dynamic> get account => Map.unmodifiable(_account);

  static double _number(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value is num) return value.toDouble();
      if (value is String) {
        final parsed = double.tryParse(value);
        if (parsed != null) return parsed;
      }
    }
    return 0;
  }

  static String _string(Map<String, dynamic> data, List<String> keys) {
    for (final key in keys) {
      final value = data[key];
      if (value != null && value.toString().isNotEmpty) return value.toString();
    }
    return '';
  }

  void _applyAccount(Map<String, dynamic> account) {
    _account = account;
    _balance = _number(account, ['balance']);
    _equity = _number(account, ['equity']);
    _usedMargin = _number(account, ['margin', 'used_margin', 'usedMargin']);
    _currency = _string(account, ['currency', 'currency_code']);
    // The current TypeScript server intentionally exposes no positions endpoint.
    _positions = [];
  }

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

      final uri = Uri.parse('$_backendBaseUrl/api/exness/connect');
      final backendClient = _createBackendHttpClient();
      late final http.Response response;
      try {
        response = await backendClient
            .post(
              uri,
              headers: const {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
              body: jsonEncode({
                'apiKey': apiKey.trim(),
                'privateKey': privateKey.trim(),
                'accountId': accountId.trim(),
                'discoveryBaseUrl': gatewayUrl.trim(),
              }),
            )
            .timeout(_requestTimeout);
      } finally {
        backendClient.close();
      }

      Map<String, dynamic> payload;
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is! Map<String, dynamic>) {
          throw const FormatException('Unexpected backend response');
        }
        payload = decoded;
      } on FormatException {
        throw StateError(
          'The backend returned an invalid response (HTTP ${response.statusCode}).',
        );
      }

      if (response.statusCode < 200 ||
          response.statusCode >= 300 ||
          payload['success'] != true) {
        final message = payload['error'] is String
            ? payload['error'] as String
            : 'Backend request failed (HTTP ${response.statusCode}).';
        throw StateError(message);
      }

      final rawAccount = payload['account'];
      if (rawAccount is! Map<String, dynamic>) {
        throw StateError(
          'Exness connected, but the account response has an unexpected format.',
        );
      }

      _accessPoint = payload['access_point']?.toString();
      _applyAccount(rawAccount);
      _isConnected = true;
      _lastError = '';
      return true;
    } on http.ClientException catch (error) {
      _isConnected = false;
      // Preserve the underlying socket/TLS/HTTP detail instead of hiding it.
      _lastError = 'Backend network error: ${error.message}';
      return false;
    } catch (error) {
      _isConnected = false;
      _accessPoint = null;
      _balance = 0;
      _equity = 0;
      _usedMargin = 0;
      _currency = '';
      _positions = [];
      _account = {};
      _lastError = error.toString().replaceFirst('Bad state: ', '');
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() async {
    _lastError =
        'Account refresh is not available yet. Reconnect to fetch the latest account data.';
    notifyListeners();
  }

  Future<List<String>> getAvailableInstruments() async {
    throw StateError(
      'Instrument discovery is not implemented in the read-only backend yet.',
    );
  }

  Future<List<Candle>> fetchMarketCandles({
    required String instrument,
    required String timeframe,
  }) async {
    throw StateError(
      'Market candle retrieval is not implemented in the read-only backend yet.',
    );
  }

  void disconnect() {
    _isConnected = false;
    _accessPoint = null;
    _balance = 0;
    _equity = 0;
    _usedMargin = 0;
    _currency = '';
    _positions = [];
    _account = {};
    _lastError = '';
    notifyListeners();
  }

  /// Order execution remains disabled. This backend exposes read-only access only.
  Future<Map<String, dynamic>> openPosition({
    required ExnessCredentials creds,
    required String instrument,
    required String side,
    required double volume,
  }) async {
    throw StateError('Trading execution is disabled. This build is read-only.');
  }
}
