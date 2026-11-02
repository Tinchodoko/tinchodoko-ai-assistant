import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
  );

  static const String _keyPrefix = 'tinchodoko_ai_key_';
  static const String _mcpTokenKey = 'tinchodoko_ctrader_mcp_token';

  /// Save single API key
  static Future<void> saveApiKey(String providerId, String key) async {
    await _storage.write(key: '$_keyPrefix$providerId', value: key.trim());
  }

  /// Get single API key
  static Future<String?> getApiKey(String providerId) async {
    return await _storage.read(key: '$_keyPrefix$providerId');
  }

  /// Save all API keys at once (Global Save button)
  static Future<void> saveAllApiKeys(Map<String, String> keys) async {
    for (final entry in keys.entries) {
      if (entry.value.trim().isNotEmpty) {
        await _storage.write(key: '$_keyPrefix${entry.key}', value: entry.value.trim());
      } else {
        await _storage.delete(key: '$_keyPrefix${entry.key}');
      }
    }
  }

  /// Load all saved API keys
  static Future<Map<String, String>> loadAllApiKeys(List<String> providerIds) async {
    final Map<String, String> result = {};
    for (final id in providerIds) {
      final key = await _storage.read(key: '$_keyPrefix$id');
      if (key != null && key.isNotEmpty) {
        result[id] = key;
      }
    }
    return result;
  }

  /// Save cTrader MCP Token
  static Future<void> saveMcpToken(String token) async {
    await _storage.write(key: _mcpTokenKey, value: token.trim());
  }

  /// Get cTrader MCP Token
  static Future<String?> getMcpToken() async {
    return await _storage.read(key: _mcpTokenKey);
  }
}
