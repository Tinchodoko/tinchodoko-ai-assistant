import 'dart:convert';

import 'package:cryptography/cryptography.dart';

/// Builds Exness Trader API request signatures using the Exness-generated
/// 64-byte private key format: 32-byte seed followed by 32-byte public key.
class ExnessRequestSigner {
  ExnessRequestSigner({
    required this.apiKey,
    required String privateKeyHex,
  }) : _privateKeyHex = privateKeyHex.trim();

  final String apiKey;
  final String _privateKeyHex;
  final Ed25519 _algorithm = Ed25519();
  SimpleKeyPair? _keyPair;

  static String _base64UrlNoPadding(List<int> bytes) =>
      base64Url.encode(bytes).replaceAll('=', '');

  List<int> _decodeHex(String value) {
    if (!RegExp(r'^[0-9a-fA-F]{128}$').hasMatch(value)) {
      throw const FormatException(
        'The Exness private signing key must contain exactly 128 hexadecimal characters.',
      );
    }
    return List<int>.generate(
      64,
      (index) => int.parse(value.substring(index * 2, index * 2 + 2), radix: 16),
    );
  }

  Future<SimpleKeyPair> _loadKeyPair() async {
    if (_keyPair != null) return _keyPair!;
    final raw = _decodeHex(_privateKeyHex);
    final keyPair = await _algorithm.newKeyPairFromSeed(raw.sublist(0, 32));
    final publicKey = await keyPair.extractPublicKey();
    for (var i = 0; i < 32; i++) {
      if (publicKey.bytes[i] != raw[i + 32]) {
        keyPair.destroy();
        throw const FormatException(
          'The public half of the Exness private key does not match its seed.',
        );
      }
    }
    _keyPair = keyPair;
    return keyPair;
  }

  /// Creates the exact signed headers required for a body-less GET request.
  /// [timestampMs] is injectable to make the official Exness test vector
  /// reproducible in unit tests.
  Future<Map<String, String>> buildGetHeaders({
    required String pathWithQuery,
    int? timestampMs,
  }) async {
    if (apiKey.trim().isEmpty) {
      throw const FormatException('Enter the Exness API key identifier.');
    }
    if (!pathWithQuery.startsWith('/')) {
      throw const FormatException('The signed API path must start with /.');
    }

    final timestamp = timestampMs ?? DateTime.now().millisecondsSinceEpoch;
    final emptyBodyHash = _base64UrlNoPadding(
      (await Sha256().hash(const <int>[])).bytes,
    );
    final payload = <String, dynamic>{
      'api_key': apiKey,
      'idempotency_key': '',
      'timestamp': timestamp,
      'sign_version': 1,
      'method': 'GET',
      'path': pathWithQuery,
      'body_hash': emptyBodyHash,
    };
    final payloadBytes = utf8.encode(jsonEncode(payload));
    final keyPair = await _loadKeyPair();
    final signature = await _algorithm.sign(payloadBytes, keyPair: keyPair);

    return {
      'Accept': 'application/json',
      'EXN-API-KEY': apiKey,
      'EXN-IDEMPOTENCY-KEY': '',
      'EXN-TIMESTAMP': timestamp.toString(),
      'EXN-SIGN-VERSION': '1',
      'EXN-DATA': _base64UrlNoPadding(payloadBytes),
      'EXN-SIGN': _base64UrlNoPadding(signature.bytes),
    };
  }

  void dispose() {
    _keyPair?.destroy();
    _keyPair = null;
  }
}
