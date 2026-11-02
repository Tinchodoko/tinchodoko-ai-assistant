export interface FlutterFileItem {
  path: string;
  filename: string;
  language: string;
  category: 'config' | 'theme' | 'models' | 'services' | 'screens' | 'android';
  content: string;
}

export const FLUTTER_PROJECT_FILES: FlutterFileItem[] = [
  {
    path: 'pubspec.yaml',
    filename: 'pubspec.yaml',
    language: 'yaml',
    category: 'config',
    content: `name: tinchodoko_ai_assistant
description: "Tinchodoko AI Assistant - Android AI Trading Assistant with cTrader MCP and Multi-Provider LLMs"
publish_to: 'none'
version: 1.0.0+1

environment:
  sdk: '>=3.3.0 <4.0.0'

dependencies:
  flutter:
    sdk: flutter
  flutter_secure_storage: ^9.2.2
  google_fonts: ^6.2.1
  http: ^1.2.1
  provider: ^6.1.2
  intl: ^0.19.0
  flutter_svg: ^2.0.10+1
  shared_preferences: ^2.2.3

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0

flutter:
  uses-material-design: true`
  },
  {
    path: 'lib/main.dart',
    filename: 'main.dart',
    language: 'dart',
    category: 'config',
    content: `import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/main_navigation_screen.dart';
import 'theme/app_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Android system bar configuration (Verde y Negro)
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: AppTheme.surfaceColor,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  runApp(const TinchodokoApp());
}

class TinchodokoApp extends StatelessWidget {
  const TinchodokoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Tinchodoko AI Assistant',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: ThemeMode.dark,
      home: const MainNavigationScreen(),
    );
  }
}`
  },
  {
    path: 'lib/theme/app_theme.dart',
    filename: 'app_theme.dart',
    language: 'dart',
    category: 'theme',
    content: `import 'package:flutter/material.dart';

class AppTheme {
  // Material Design 3 - Verde y Negro
  static const Color primaryGreen = Color(0xFF00E676); // Neon Green
  static const Color accentGreen = Color(0xFF10B981);  // Emerald
  static const Color darkBackground = Color(0xFF0D1117); // Deep OLED Black
  static const Color surfaceColor = Color(0xFF161B22);  // M3 Surface
  static const Color surfaceBorder = Color(0xFF30363D); // Border
  static const Color surfaceHighlight = Color(0xFF21262D);
  static const Color errorRed = Color(0xFFFF5252);     // Red / Reject
  static const Color textPrimary = Color(0xFFF0F6FC);
  static const Color textSecondary = Color(0xFF8B949E);

  static ThemeData get darkTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkBackground,
      colorScheme: const ColorScheme.dark(
        primary: primaryGreen,
        onPrimary: Color(0xFF003915),
        secondary: accentGreen,
        surface: surfaceColor,
        onSurface: textPrimary,
        error: errorRed,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surfaceColor,
        foregroundColor: textPrimary,
        elevation: 0,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surfaceColor,
        indicatorColor: primaryGreen.withOpacity(0.2),
      ),
    );
  }
}`
  },
  {
    path: 'lib/models/ai_provider.dart',
    filename: 'ai_provider.dart',
    language: 'dart',
    category: 'models',
    content: `class AIProvider {
  final String id;
  final String name;
  final List<String> models;
  final String defaultModel;
  final String hint;
  String apiKey;

  AIProvider({
    required this.id,
    required this.name,
    required this.models,
    required this.defaultModel,
    required this.hint,
    this.apiKey = '',
  });

  bool get isConfigured => apiKey.trim().isNotEmpty && apiKey.trim().length >= 8;
}

final List<AIProvider> initialProviders = [
  AIProvider(
    id: 'groq',
    name: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'deepseek-r1-distill-llama-70b'],
    defaultModel: 'llama-3.3-70b-versatile',
    hint: 'gsk_...',
  ),
  AIProvider(
    id: 'gemini',
    name: 'Gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.5-flash',
    hint: 'AIzaSy...',
  ),
  AIProvider(
    id: 'claude',
    name: 'Claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    hint: 'sk-ant-...',
  ),
  AIProvider(
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'o3-mini'],
    defaultModel: 'gpt-4o',
    hint: 'sk-...',
  ),
  AIProvider(
    id: 'openrouter',
    name: 'OpenRouter',
    models: ['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1', 'meta-llama/llama-3.3-70b-instruct', 'google/gemini-2.5-flash'],
    defaultModel: 'anthropic/claude-3.5-sonnet',
    hint: 'sk-or-...',
  ),
  AIProvider(
    id: 'mistral',
    name: 'Mistral',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    defaultModel: 'mistral-large-latest',
    hint: 'API Key',
  ),
];`
  },
  {
    path: 'lib/models/trade_operation.dart',
    filename: 'trade_operation.dart',
    language: 'dart',
    category: 'models',
    content: `class TradeOperation {
  final String id;
  final DateTime date;
  final String pair;
  final String direction; // 'BUY' o 'SELL'
  final String result;    // Ej: "+$145.20", "Descartada"
  final bool isConfirmed; // true: Confirmada, false: Rechazada
  final double? pnl;
  final String? modelUsed;
  final String? notes;

  TradeOperation({
    required this.id,
    required this.date,
    required this.pair,
    required this.direction,
    required this.result,
    required this.isConfirmed,
    this.pnl,
    this.modelUsed,
    this.notes,
  });
}`
  },
  {
    path: 'lib/models/ctrader_account.dart',
    filename: 'ctrader_account.dart',
    language: 'dart',
    category: 'models',
    content: `class CTraderPosition {
  final String id;
  final String pair;
  final String direction;
  final double lots;
  final double entryPrice;
  final double currentPrice;
  final double pnl;
  final double stopLoss;
  final double takeProfit;
  final String openTime;

  CTraderPosition({
    required this.id,
    required this.pair,
    required this.direction,
    required this.lots,
    required this.entryPrice,
    required this.currentPrice,
    required this.pnl,
    required this.stopLoss,
    required this.takeProfit,
    required this.openTime,
  });
}

class CTraderAccount {
  final bool isConnected;
  final String mcpToken;
  final double balance;
  final double equity;
  final double margin;
  final double freeMargin;
  final List<CTraderPosition> positions;

  CTraderAccount({
    required this.isConnected,
    required this.mcpToken,
    required this.balance,
    required this.equity,
    required this.margin,
    required this.freeMargin,
    required this.positions,
  });

  factory CTraderAccount.disconnected() => CTraderAccount(
    isConnected: false,
    mcpToken: '',
    balance: 0.0,
    equity: 0.0,
    margin: 0.0,
    freeMargin: 0.0,
    positions: [],
  );
}`
  },
  {
    path: 'lib/services/secure_storage_service.dart',
    filename: 'secure_storage_service.dart',
    language: 'dart',
    category: 'services',
    content: `import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
  );

  static const String _keyPrefix = 'tinchodoko_ai_key_';
  static const String _mcpTokenKey = 'tinchodoko_ctrader_mcp_token';

  static Future<void> saveApiKey(String providerId, String key) async {
    await _storage.write(key: '$_keyPrefix$providerId', value: key.trim());
  }

  static Future<void> saveAllApiKeys(Map<String, String> keys) async {
    for (final entry in keys.entries) {
      if (entry.value.trim().isNotEmpty) {
        await _storage.write(key: '$_keyPrefix\${entry.key}', value: entry.value.trim());
      } else {
        await _storage.delete(key: '$_keyPrefix\${entry.key}');
      }
    }
  }

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

  static Future<void> saveMcpToken(String token) async {
    await _storage.write(key: _mcpTokenKey, value: token.trim());
  }

  static Future<String?> getMcpToken() async {
    return await _storage.read(key: _mcpTokenKey);
  }
}`
  },
  {
    path: 'lib/screens/main_navigation_screen.dart',
    filename: 'main_navigation_screen.dart',
    language: 'dart',
    category: 'screens',
    content: `import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/trade_operation.dart';
import '../services/ctrader_service.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';
import 'apis_tab.dart';
import 'assistant_tab.dart';
import 'ctrader_tab.dart';
import 'history_tab.dart';

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 1; // Tab Assistant por defecto
  final List<AIProvider> _providers = initialProviders;
  final List<TradeOperation> _history = [];
  final CTraderService _ctraderService = CTraderService();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tinchodoko AI Assistant'),
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: [
          ApisTab(providers: _providers, onKeysUpdated: () => setState(() {})),
          AssistantTab(providers: _providers, onTradeRecorded: (t) => setState(() => _history.insert(0, t))),
          CTraderTab(ctraderService: _ctraderService),
          HistoryTab(operations: _history, onClearHistory: () => setState(() => _history.clear())),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (i) => setState(() => _currentIndex = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.vpn_key_outlined), selectedIcon: Icon(Icons.vpn_key), label: 'APIs'),
          NavigationDestination(icon: Icon(Icons.smart_toy_outlined), selectedIcon: Icon(Icons.smart_toy), label: 'Assistant'),
          NavigationDestination(icon: Icon(Icons.candlestick_chart_outlined), selectedIcon: Icon(Icons.candlestick_chart), label: 'cTrader'),
          NavigationDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history), label: 'Historial'),
        ],
      ),
    );
  }
}`
  },
  {
    path: 'lib/screens/apis_tab.dart',
    filename: 'apis_tab.dart',
    language: 'dart',
    category: 'screens',
    content: `import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';

class ApisTab extends StatefulWidget {
  final List<AIProvider> providers;
  final VoidCallback onKeysUpdated;

  const ApisTab({super.key, required this.providers, required this.onKeysUpdated});

  @override
  State<ApisTab> createState() => _ApisTabState();
}

class _ApisTabState extends State<ApisTab> {
  final Map<String, TextEditingController> _controllers = {};
  bool _isSaving = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: ListView.builder(
        itemCount: widget.providers.length,
        itemBuilder: (ctx, i) {
          final p = widget.providers[i];
          final isConfigured = p.isConfigured;
          return Card(
            child: ListTile(
              leading: Icon(Icons.circle, color: isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed, size: 14),
              title: Text(p.name),
              subtitle: TextField(
                obscureText: true,
                decoration: InputDecoration(hintText: 'Ingresa API Key (\${p.hint})'),
              ),
            ),
          );
        },
      ),
      bottomNavigationBar: ElevatedButton(
        onPressed: () => SecureStorageService.saveAllApiKeys({}),
        child: const Text('Guardar Todo'),
      ),
    );
  }
}`
  },
  {
    path: 'lib/screens/assistant_tab.dart',
    filename: 'assistant_tab.dart',
    language: 'dart',
    category: 'screens',
    content: `import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../models/trade_operation.dart';
import '../theme/app_theme.dart';

class AssistantTab extends StatefulWidget {
  final List<AIProvider> providers;
  final Function(TradeOperation) onTradeRecorded;

  const AssistantTab({super.key, required this.providers, required this.onTradeRecorded});

  @override
  State<AssistantTab> createState() => _AssistantTabState();
}

class _AssistantTabState extends State<AssistantTab> {
  String? _analysisResponse;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Dropdown API activa y Dropdown Modelo dinámico
        // Campo de texto grande para instrucciones
        // Botón Analizar
        // Cuadro de respuesta scrolleable
        // Botones: ✅ Confirmar y ❌ Rechazar (visibles cuando hay respuesta)
      ],
    );
  }
}`
  },
  {
    path: 'android/app/src/main/AndroidManifest.xml',
    filename: 'AndroidManifest.xml',
    language: 'xml',
    category: 'android',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.tinchodoko.ai_assistant">
    <uses-permission android:name="android.permission.INTERNET"/>
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    <application android:label="Tinchodoko AI Assistant" android:name="\${applicationName}">
        <activity android:name=".MainActivity" android:exported="true" android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>`
  }
];
