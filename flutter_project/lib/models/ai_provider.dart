class AIProvider {
  final String id;
  final String name;
  final List<String> models;
  final String defaultModel;
  final String hint;
  final bool isDataProvider; // true = proveedor de datos, no IA
  String apiKey;

  AIProvider({
    required this.id,
    required this.name,
    required this.models,
    required this.defaultModel,
    required this.hint,
    this.isDataProvider = false,
    this.apiKey = '',
  });

  bool get isConfigured => apiKey.trim().isNotEmpty && apiKey.trim().length >= 8;

  Map<String, dynamic> toJson() => {
    'id': id,
    'apiKey': apiKey,
  };
}

final List<AIProvider> initialProviders = [
  // ── Proveedores de IA ─────────────────────────
  AIProvider(
    id: 'groq',
    name: 'Groq',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'deepseek-r1-distill-llama-70b',
    ],
    defaultModel: 'llama-3.3-70b-versatile',
    hint: 'gsk_...',
  ),
  AIProvider(
    id: 'gemini',
    name: 'Gemini',
    models: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ],
    defaultModel: 'gemini-2.5-flash',
    hint: 'AIzaSy...',
  ),
  AIProvider(
    id: 'claude',
    name: 'Claude',
    models: [
      'claude-sonnet-4-6',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
    defaultModel: 'claude-sonnet-4-6',
    hint: 'sk-ant-...',
  ),
  AIProvider(
    id: 'openai',
    name: 'OpenAI',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'o3-mini',
    ],
    defaultModel: 'gpt-4o',
    hint: 'sk-...',
  ),
  AIProvider(
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-r1',
      'meta-llama/llama-3.3-70b-instruct',
      'google/gemini-2.5-flash',
      'qwen/qwen-2.5-72b-instruct',
    ],
    defaultModel: 'anthropic/claude-3.5-sonnet',
    hint: 'sk-or-...',
  ),
  AIProvider(
    id: 'mistral',
    name: 'Mistral',
    models: [
      'mistral-large-latest',
      'mistral-small-latest',
      'codestral-latest',
    ],
    defaultModel: 'mistral-large-latest',
    hint: 'Mistral API Key',
  ),
  // ── Proveedores de datos de mercado ──────────
  AIProvider(
    id: 'twelvedata',
    name: 'Twelve Data',
    models: ['market-data'],
    defaultModel: 'market-data',
    hint: 'Tu API Key de twelvedata.com',
    isDataProvider: true,
  ),
];
