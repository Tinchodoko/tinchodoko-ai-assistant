import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

/// HTTP client with DNS-over-HTTPS fallback + optional host→IP overrides.
/// Pass [hostOverrides] to bypass DNS entirely for specific hostnames
/// (useful when ISP blocks API subdomains but not the main domain).
class ExnessDnsHttpClient extends http.BaseClient {
  ExnessDnsHttpClient({Map<String, String>? hostOverrides})
      : _hostOverrides = hostOverrides ?? {},
        _httpClient = HttpClient() {
    _httpClient.connectionTimeout = const Duration(seconds: 12);
    _httpClient.connectionFactory = _openSocket;
    _delegate = IOClient(_httpClient);
  }

  final Map<String, String> _hostOverrides; // hostname → IP string
  final HttpClient _httpClient;
  late final IOClient _delegate;
  final Map<String, _DnsCacheEntry> _cache = {};
  final Map<String, Future<List<InternetAddress>>> _pending = {};

  static const _providers = <_DohProvider>[
    _DohProvider(host: 'cloudflare-dns.com', ip: '1.1.1.1',
        path: '/dns-query', queryName: 'name'),
    _DohProvider(host: 'dns.google', ip: '8.8.8.8',
        path: '/resolve', queryName: 'name'),
    _DohProvider(host: 'dns.quad9.net', ip: '9.9.9.9',
        path: '/dns-query', queryName: 'name'),
    _DohProvider(host: 'dns.adguard-dns.com', ip: '94.140.14.14',
        path: '/resolve', queryName: 'name'),
  ];

  Future<ConnectionTask<Socket>> _openSocket(
      Uri uri, String? proxyHost, int? proxyPort) async {
    if (proxyHost != null) {
      if (proxyPort == null) throw const SocketException('Proxy port missing.');
      return Socket.startConnect(proxyHost, proxyPort);
    }

    // Literal IP — no DNS needed
    final literal = InternetAddress.tryParse(uri.host);
    if (literal != null) return _connectToAddress(uri, literal);

    // Manual override — bypasses DNS completely
    final overrideIp = _hostOverrides[uri.host];
    if (overrideIp != null) {
      final addr = InternetAddress.tryParse(overrideIp);
      if (addr != null) return _connectToAddress(uri, addr);
    }

    final addresses = await _resolveHost(uri.host);
    if (addresses.isEmpty) {
      throw SocketException(
          'Could not resolve ${uri.host}. '
          'Try entering the Gateway IP manually (nslookup ${uri.host}).');
    }
    return _connectToAddress(uri, addresses.first);
  }

  Future<ConnectionTask<Socket>> _connectToAddress(
      Uri uri, InternetAddress address) async {
    if (uri.scheme != 'https') return Socket.startConnect(address, uri.port);
    final tcpTask = await Socket.startConnect(address, uri.port);
    final secureSocket = tcpTask.socket.then(
      (socket) => SecureSocket.secure(socket,
          host: uri.host,
          context: SecurityContext.defaultContext,
          supportedProtocols: const ['http/1.1']),
    );
    return ConnectionTask.fromSocket<Socket>(secureSocket, tcpTask.cancel);
  }

  Future<List<InternetAddress>> _resolveHost(String host) {
    final cached = _cache[host];
    if (cached != null && cached.expiresAt.isAfter(DateTime.now())) {
      return Future.value(cached.addresses);
    }
    return _pending[host] ??= _resolveHostUncached(host)
        .whenComplete(() => _pending.remove(host));
  }

  Future<List<InternetAddress>> _resolveHostUncached(String host) async {
    // 1. Android system DNS
    try {
      final addrs = await InternetAddress.lookup(host)
          .timeout(const Duration(seconds: 4));
      if (addrs.isNotEmpty) {
        _cache[host] = _DnsCacheEntry(
            addrs, DateTime.now().add(const Duration(minutes: 5)));
        return addrs;
      }
    } catch (_) {}

    // 2. DoH providers (4 independent resolvers)
    for (final provider in _providers) {
      try {
        final addrs = await _queryDoh(provider, host)
            .timeout(const Duration(seconds: 8));
        if (addrs.isNotEmpty) {
          _cache[host] = _DnsCacheEntry(
              addrs, DateTime.now().add(const Duration(minutes: 5)));
          return addrs;
        }
      } catch (_) {}
    }

    // 3. Connectivity probe — distinguish "no internet" vs "domain blocked"
    bool hasInternet = false;
    try {
      final probe = await InternetAddress.lookup('www.google.com')
          .timeout(const Duration(seconds: 4));
      hasInternet = probe.isNotEmpty;
    } catch (_) {}

    if (!hasInternet) {
      throw SocketException(
          'No internet connectivity. Check your network connection.');
    }
    throw SocketException(
        'DNS blocked for $host (ISP restriction). '
        'Enter the Gateway IP manually or use a VPN.\n'
        'To get the IP: run  nslookup $host  on a PC.');
  }

  Future<List<InternetAddress>> _queryDoh(
      _DohProvider provider, String hostname) async {
    final pinnedAddr = InternetAddress.tryParse(provider.ip)!;
    final dohHttp = HttpClient()
      ..connectionTimeout = const Duration(seconds: 6)
      ..findProxy = (uri) => 'DIRECT'
      ..connectionFactory = (uri, proxyHost, proxyPort) {
        if (proxyHost != null) {
          if (proxyPort == null) throw const SocketException('Proxy port missing.');
          return Socket.startConnect(proxyHost, proxyPort);
        }
        return _connectToAddress(uri, pinnedAddr);
      };
    try {
      final uri = Uri.https(provider.host, provider.path,
          {provider.queryName: hostname, 'type': 'A'});
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
        final addr = InternetAddress.tryParse(data);
        if (addr != null && addr.type == InternetAddressType.IPv4) {
          results.add(addr);
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
  const _DohProvider(
      {required this.host, required this.ip,
       required this.path, required this.queryName});
  final String host, ip, path, queryName;
}

class _DnsCacheEntry {
  const _DnsCacheEntry(this.addresses, this.expiresAt);
  final List<InternetAddress> addresses;
  final DateTime expiresAt;
}
