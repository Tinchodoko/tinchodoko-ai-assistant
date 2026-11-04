import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

/// HTTP client that falls back to DNS-over-HTTPS when Android's system
/// resolver cannot resolve an Exness host. TLS still validates the original
/// hostname; only the TCP destination is pinned to the resolved IP.
class ExnessDnsHttpClient extends http.BaseClient {
  ExnessDnsHttpClient()
      : _httpClient = HttpClient() {
    _httpClient.connectionTimeout = const Duration(seconds: 12);
    _httpClient.connectionFactory = _openSocket;
    _delegate = IOClient(_httpClient);
  }

  final HttpClient _httpClient;
  late final IOClient _delegate;
  final Map<String, _DnsCacheEntry> _cache = {};
  final Map<String, Future<List<InternetAddress>>> _pending = {};

  static const _providers = <_DohProvider>[
    _DohProvider(
      host: 'cloudflare-dns.com',
      ip: '1.1.1.1',
      path: '/dns-query',
      queryName: 'name',
    ),
    _DohProvider(
      host: 'dns.google',
      ip: '8.8.8.8',
      path: '/resolve',
      queryName: 'name',
    ),
  ];

  Future<ConnectionTask<Socket>> _openSocket(
    Uri uri,
    String? proxyHost,
    int? proxyPort,
  ) async {
    // Preserve configured proxies. A proxy resolves the destination itself.
    if (proxyHost != null) {
      if (proxyPort == null) {
        throw const SocketException('Proxy port is missing.');
      }
      return Socket.startConnect(proxyHost, proxyPort);
    }

    final literalAddress = InternetAddress.tryParse(uri.host);
    if (literalAddress != null) {
      return Socket.startConnect(literalAddress, uri.port);
    }

    final addresses = await _resolveHost(uri.host);
    if (addresses.isEmpty) {
      throw SocketException(
        'DNS lookup failed for ${uri.host} using system DNS and HTTPS DNS fallback.',
      );
    }
    return _connectToAddress(uri, addresses.first);
  }

  /// Opens TCP to the resolved IP, then performs TLS using the original
  /// hostname for SNI and certificate hostname validation. HttpClient's
  /// connectionFactory must return an already-secure socket for HTTPS.
  Future<ConnectionTask<Socket>> _connectToAddress(
    Uri uri,
    InternetAddress address,
  ) async {
    if (uri.scheme != 'https') {
      return Socket.startConnect(address, uri.port);
    }

    final tcpTask = await Socket.startConnect(address, uri.port);
    final secureSocket = tcpTask.socket.then(
      (socket) => SecureSocket.secure(
        socket,
        host: uri.host,
        context: SecurityContext.defaultContext,
        supportedProtocols: const ['http/1.1'],
      ),
    );
    return ConnectionTask.fromSocket<Socket>(secureSocket, tcpTask.cancel);
  }

  Future<List<InternetAddress>> _resolveHost(String host) {
    final cached = _cache[host];
    if (cached != null && cached.expiresAt.isAfter(DateTime.now())) {
      return Future.value(cached.addresses);
    }

    final existing = _pending[host];
    if (existing != null) return existing;

    final future = _resolveHostUncached(host);
    _pending[host] = future;
    return future.whenComplete(() => _pending.remove(host));
  }

  Future<List<InternetAddress>> _resolveHostUncached(String host) async {
    // Try the Android/system resolver first; DoH is only a fallback.
    try {
      final systemAddresses = await InternetAddress.lookup(host)
          .timeout(const Duration(seconds: 3));
      if (systemAddresses.isNotEmpty) {
        _cache[host] = _DnsCacheEntry(
          systemAddresses,
          DateTime.now().add(const Duration(minutes: 5)),
        );
        return systemAddresses;
      }
    } catch (_) {
      // Continue with independent HTTPS DNS resolvers.
    }

    for (final provider in _providers) {
      try {
        final addresses = await _queryDoh(provider, host)
            .timeout(const Duration(seconds: 5));
        if (addresses.isNotEmpty) {
          _cache[host] = _DnsCacheEntry(
            addresses,
            DateTime.now().add(const Duration(minutes: 5)),
          );
          return addresses;
        }
      } catch (_) {
        // Try the next independent resolver.
      }
    }

    throw SocketException(
      'Could not resolve $host using Android DNS, Cloudflare DoH or Google DoH.',
    );
  }

  Future<List<InternetAddress>> _queryDoh(
    _DohProvider provider,
    String hostname,
  ) async {
    final pinnedAddress = InternetAddress.tryParse(provider.ip);
    if (pinnedAddress == null) {
      throw const FormatException('Invalid DNS resolver IP address.');
    }

    // Connect to the resolver's published IP while retaining the resolver
    // hostname in the URI, so HttpClient performs normal TLS/SNI validation.
    final dohHttp = HttpClient()
      ..connectionTimeout = const Duration(seconds: 4)
      ..findProxy = (_) => 'DIRECT'
      ..connectionFactory = (uri, proxyHost, proxyPort) {
        if (proxyHost != null) {
          if (proxyPort == null) {
            throw const SocketException('Proxy port is missing.');
          }
          return Socket.startConnect(proxyHost, proxyPort);
        }
        return _connectToAddress(uri, pinnedAddress);
      };

    try {
      final uri = Uri.https(
        provider.host,
        provider.path,
        {provider.queryName: hostname, 'type': 'A'},
      );
      final request = await dohHttp.getUrl(uri);
      request.headers.set(HttpHeaders.acceptHeader, 'application/dns-json');
      final response = await request.close();
      final body = await utf8.decoder.bind(response).join();
      if (response.statusCode != HttpStatus.ok) return const [];

      final decoded = jsonDecode(body);
      if (decoded is! Map<String, dynamic>) return const [];
      final answers = decoded['Answer'];
      if (answers is! List) return const [];

      final results = <InternetAddress>[];
      for (final answer in answers) {
        if (answer is! Map) continue;
        final data = answer['data']?.toString();
        if (data == null) continue;
        final address = InternetAddress.tryParse(data);
        if (address != null && address.type == InternetAddressType.IPv4) {
          results.add(address);
        }
      }
      return results;
    } finally {
      dohHttp.close(force: true);
    }
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) =>
      _delegate.send(request);

  @override
  void close() {
    _delegate.close();
    super.close();
  }
}

class _DohProvider {
  const _DohProvider({
    required this.host,
    required this.ip,
    required this.path,
    required this.queryName,
  });

  final String host;
  final String ip;
  final String path;
  final String queryName;
}

class _DnsCacheEntry {
  const _DnsCacheEntry(this.addresses, this.expiresAt);

  final List<InternetAddress> addresses;
  final DateTime expiresAt;
}
