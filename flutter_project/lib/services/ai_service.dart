import 'dart:convert';
import 'package:http/http.dart' as http;

class AIService {
  /// Calls the selected AI provider API (Groq, Gemini, Claude, OpenAI, OpenRouter, Mistral)
  static Future<String> analyzeMarket({
    required String providerId,
    required String model,
    required String apiKey,
    required String instructions,
  }) async {
    final systemPrompt = """
Eres Tinchodoko AI Assistant, un asistente cuantitativo y analista de trading profesional conectado a cTrader.
Analiza la siguiente instrucción del usuario y genera un reporte estructurado y conciso:
1. Resumen de Mercado y Tendencia
2. Señal sugerida (COMPRA / VENTA / ESPERAR)
3. Par / Activo analizado (ej: EURUSD, XAUUSD, BTCUSD)
4. Precio de Entrada sugerido, Stop Loss y Take Profit
5. Nivel de Riesgo y Justificación Técnica (Soportes/Resistencias, Indicadores)
Si das una señal ejecutable, especifícala claramente para que el usuario pueda confirmar o rechazar el trade.
""";

    try {
      if (providerId == 'groq') {
        final res = await http.post(
          Uri.parse('https://api.groq.com/openai/v1/chat/completions'),
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'model': model,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': instructions},
            ],
            'temperature': 0.3,
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['choices'][0]['message']['content'];
        } else {
          throw Exception('Error Groq (${res.statusCode}): ${res.body}');
        }
      } else if (providerId == 'openai') {
        final res = await http.post(
          Uri.parse('https://api.openai.com/v1/chat/completions'),
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'model': model,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': instructions},
            ],
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['choices'][0]['message']['content'];
        } else {
          throw Exception('Error OpenAI (${res.statusCode}): ${res.body}');
        }
      } else if (providerId == 'openrouter') {
        final res = await http.post(
          Uri.parse('https://openrouter.ai/api/v1/chat/completions'),
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'model': model,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': instructions},
            ],
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['choices'][0]['message']['content'];
        } else {
          throw Exception('Error OpenRouter (${res.statusCode}): ${res.body}');
        }
      } else if (providerId == 'mistral') {
        final res = await http.post(
          Uri.parse('https://api.mistral.ai/v1/chat/completions'),
          headers: {
            'Authorization': 'Bearer $apiKey',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'model': model,
            'messages': [
              {'role': 'system', 'content': systemPrompt},
              {'role': 'user', 'content': instructions},
            ],
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['choices'][0]['message']['content'];
        } else {
          throw Exception('Error Mistral (${res.statusCode}): ${res.body}');
        }
      } else if (providerId == 'gemini') {
        final res = await http.post(
          Uri.parse('https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$apiKey'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'contents': [
              {
                'parts': [
                  {'text': '$systemPrompt\n\nUsuario: $instructions'}
                ]
              }
            ]
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['candidates'][0]['content']['parts'][0]['text'];
        } else {
          throw Exception('Error Gemini (${res.statusCode}): ${res.body}');
        }
      } else if (providerId == 'claude') {
        final res = await http.post(
          Uri.parse('https://api.anthropic.com/v1/messages'),
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
          body: jsonEncode({
            'model': model,
            'max_tokens': 1024,
            'system': systemPrompt,
            'messages': [
              {'role': 'user', 'content': instructions},
            ],
          }),
        );
        if (res.statusCode == 200) {
          final data = jsonDecode(res.body);
          return data['content'][0]['text'];
        } else {
          throw Exception('Error Claude (${res.statusCode}): ${res.body}');
        }
      }

      return "Proveedor no soportado.";
    } catch (e) {
      return "⚠️ Error al analizar con $providerId ($model): $e";
    }
  }
}
