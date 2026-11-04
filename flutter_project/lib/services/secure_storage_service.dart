import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
  );

  static const String _keyPrefix = 'tinchodoko_ai_key_';
  static const String _exnessApiKey = 'tinchodoko_exness_api_key';
  static const String _exnessPrivateKey = 'tinchodoko_exness_private_key';
  static const String _exnessAccountId = 'tinchodoko_exness_account_id';
  static const String _exnessAccessPoint = 'tinchodoko_exness_access_point';

  static Future<void> saveApiKey(String providerId, String key) async {
    await _storage.write(key: '$_keyPrefix$providerId', value: key.trim());
  }

  static Future<String?> getApiKey(String providerId) async {
    return await _storage.read(key: '$_keyPrefix$providerId');
  }

  static Future<void> saveAllApiKeys(Map<String, String> keys) async {
    for (final entry in keys.entries) {
      if (entry.value.trim().isNotEmpty) {
        await _storage.write(
          key: '$_keyPrefix${entry.key}',
          value: entry.value.trim(),
        );
      } else {
        await _storage.delete(key: '$_keyPrefix${entry.key}');
      }
    }
  }

  static Future<Map<String, String>> loadAllApiKeys(
    List<String> providerIds,
  ) async {
    final result = <String, String>{};
    for (final id in providerIds) {
      final key = await _storage.read(key: '$_keyPrefix$id');
      if (key != null && key.isNotEmpty) result[id] = key;
    }
    return result;
  }

  static Future<void> saveExnessCredentials({
    required String apiKey,
    required String privateKey,
    required String accountId,
  }) async {
    await _storage.write(key: _exnessApiKey, value: apiKey.trim());
    await _storage.write(key: _exnessPrivateKey, value: privateKey.trim());
    await _storage.write(key: _exnessAccountId, value: accountId.trim());
  }

  static Future<Map<String, String>> getExnessCredentials() async {
    final values = await Future.wait([
      _storage.read(key: _exnessApiKey),
      _storage.read(key: _exnessPrivateKey),
      _storage.read(key: _exnessAccountId),
    ]);
    return {
      if (values[0] != null) 'apiKey': values[0]!,
      if (values[1] != null) 'privateKey': values[1]!,
      if (values[2] != null) 'accountId': values[2]!,
    };
  }

  static Future<void> saveExnessAccessPoint(String accessPoint) async {
    await _storage.write(key: _exnessAccessPoint, value: accessPoint);
  }

  static Future<String?> getExnessAccessPoint() async {
    return await _storage.read(key: _exnessAccessPoint);
  }

  static Future<void> clearExnessAccessPoint() async {
    await _storage.delete(key: _exnessAccessPoint);
  }
}
