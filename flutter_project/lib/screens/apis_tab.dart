import 'package:flutter/material.dart';
import '../models/ai_provider.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';

class ApisTab extends StatefulWidget {
  final List<AIProvider> providers;
  final VoidCallback onKeysUpdated;

  const ApisTab({
    super.key,
    required this.providers,
    required this.onKeysUpdated,
  });

  @override
  State<ApisTab> createState() => _ApisTabState();
}

class _ApisTabState extends State<ApisTab> {
  final Map<String, TextEditingController> _controllers = {};
  final Map<String, bool> _obscureText = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    for (final p in widget.providers) {
      _controllers[p.id] = TextEditingController(text: p.apiKey);
      _obscureText[p.id] = true;
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _saveAllKeys() async {
    setState(() => _isSaving = true);

    final Map<String, String> keyMap = {};
    for (final p in widget.providers) {
      final text = _controllers[p.id]?.text ?? '';
      p.apiKey = text;
      keyMap[p.id] = text;
    }

    await SecureStorageService.saveAllApiKeys(keyMap);
    widget.onKeysUpdated();

    setState(() => _isSaving = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.check_circle, color: AppTheme.primaryGreen),
              SizedBox(width: 10),
              Text(
                'API Keys guardadas con flutter_secure_storage',
                style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
            ],
          ),
          backgroundColor: AppTheme.surfaceHighlight,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header Info Bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.primaryGreen.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.key, color: AppTheme.primaryGreen, size: 22),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Gestión de Proveedores IA',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        Text(
                          'Cifrado seguro con flutter_secure_storage',
                          style: TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const Divider(color: AppTheme.surfaceBorder, height: 1),

            // Provider Cards List
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                itemCount: widget.providers.length,
                itemBuilder: (context, index) {
                  final provider = widget.providers[index];
                  final controller = _controllers[provider.id]!;
                  final isConfigured = controller.text.trim().length >= 8;

                  return Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  // Provider Logo Indicator Circle
                                  Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed,
                                      boxShadow: [
                                        BoxShadow(
                                          color: (isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed).withOpacity(0.4),
                                          blurRadius: 6,
                                          spreadRadius: 1,
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 10),
                                  Text(
                                    provider.name,
                                    style: const TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.textPrimary,
                                    ),
                                  ),
                                ],
                              ),
                              // Visual Green/Red status badge
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: (isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed).withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(20),
                                  border: Border.Border.all(
                                    color: (isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed).withOpacity(0.3),
                                  ),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(
                                      isConfigured ? Icons.check_circle_outline : Icons.cancel_outlined,
                                      size: 14,
                                      color: isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed,
                                    ),
                                    const SizedBox(width: 4),
                                    Text(
                                      isConfigured ? 'Configurada' : 'No configurada',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w600,
                                        color: isConfigured ? AppTheme.primaryGreen : AppTheme.errorRed,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          // TextField for API Key
                          TextField(
                            controller: controller,
                            obscureText: _obscureText[provider.id] ?? true,
                            onChanged: (_) => setState(() {}),
                            style: const TextStyle(fontSize: 14, fontFamily: 'monospace'),
                            decoration: InputDecoration(
                              hintText: 'Ingresa tu ${provider.name} API Key (${provider.hint})',
                              prefixIcon: const Icon(Icons.lock_outline, size: 20, color: AppTheme.textSecondary),
                              suffixIcon: IconButton(
                                icon: Icon(
                                  (_obscureText[provider.id] ?? true)
                                      ? Icons.visibility_off
                                      : Icons.visibility,
                                  size: 20,
                                  color: AppTheme.textSecondary,
                                ),
                                onPressed: () {
                                  setState(() {
                                    _obscureText[provider.id] = !(_obscureText[provider.id] ?? true);
                                  });
                                },
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),

            // Global Guardar Button
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: AppTheme.surfaceColor,
                border: Border(top: BorderSide(color: AppTheme.surfaceBorder)),
              ),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _isSaving ? null : _saveAllKeys,
                  icon: _isSaving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                        )
                      : const Icon(Icons.save, color: Color(0xFF003915)),
                  label: Text(_isSaving ? 'Guardando llaves...' : 'Guardar Todo'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
