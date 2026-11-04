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
  final Map<String, bool> _obscure = {};
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    for (final p in widget.providers) {
      _controllers[p.id] = TextEditingController(text: p.apiKey);
      _obscure[p.id] = true;
    }
  }

  @override
  void dispose() {
    for (final c in _controllers.values) c.dispose();
    super.dispose();
  }

  Future<void> _saveAllKeys() async {
    setState(() => _isSaving = true);
    final map = <String, String>{};
    for (final p in widget.providers) {
      final text = _controllers[p.id]?.text ?? '';
      p.apiKey = text;
      map[p.id] = text;
    }
    await SecureStorageService.saveAllApiKeys(map);
    widget.onKeysUpdated();
    setState(() => _isSaving = false);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: AppTheme.primaryGreen,
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      content: const Row(children: [
        Icon(Icons.check_circle, color: Colors.black),
        SizedBox(width: 8),
        Text('API Keys guardadas de forma segura',
            style: TextStyle(
                color: Colors.black, fontWeight: FontWeight.bold)),
      ]),
    ));
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      body: SafeArea(
        child: Column(children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.primaryGreen.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.vpn_key,
                    color: AppTheme.primaryGreen, size: 22),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Proveedores de IA',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary)),
                      Text('Persistencia segura (flutter_secure_storage)',
                          style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary)),
                    ]),
              ),
            ]),
          ),
          const Divider(color: AppTheme.surfaceBorder, height: 1),

          // Lista
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 12),
              children: [
                // ── Sección IAs ─────────────────────────
                _sectionHeader(
                    Icons.smart_toy, 'Modelos de IA', Colors.purple),
                const SizedBox(height: 8),
                ...widget.providers.map((p) => _providerCard(p)),

                const SizedBox(height: 20),

                const SizedBox(height: 80),
              ],
            ),
          ),

          // Botón Guardar
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: AppTheme.surfaceColor,
              border:
                  Border(top: BorderSide(color: AppTheme.surfaceBorder)),
            ),
            child: SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _isSaving ? null : _saveAllKeys,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primaryGreen,
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                icon: _isSaving
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.black))
                    : const Icon(Icons.save),
                label: Text(
                  _isSaving ? 'Guardando...' : 'Guardar Todo',
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 15),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _sectionHeader(
          IconData icon, String title, Color color) =>
      Row(children: [
        Icon(icon, color: color, size: 16),
        const SizedBox(width: 8),
        Text(title,
            style: TextStyle(
                color: color,
                fontWeight: FontWeight.bold,
                fontSize: 13)),
        const SizedBox(width: 8),
        Expanded(child: Divider(color: color.withOpacity(0.3))),
      ]);

  Widget _providerCard(AIProvider provider,
      {Color accentColor = AppTheme.primaryGreen}) {
    final controller = _controllers[provider.id]!;
    final isConfigured = controller.text.trim().length >= 8;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Nombre + badge
              Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(children: [
                      Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isConfigured
                              ? accentColor
                              : AppTheme.errorRed,
                          boxShadow: [
                            BoxShadow(
                              color: (isConfigured
                                      ? accentColor
                                      : AppTheme.errorRed)
                                  .withOpacity(0.4),
                              blurRadius: 6,
                              spreadRadius: 1,
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 10),
                      Text(provider.name,
                          style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                              color: AppTheme.textPrimary)),
                      if (provider.models.isNotEmpty) ...[
                        const SizedBox(width: 8),
                        Text(
                          provider.models.first,
                          style: TextStyle(
                              fontSize: 11,
                              color: AppTheme.textSecondary
                                  .withOpacity(0.6)),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ]),
                    _statusBadge(isConfigured, accentColor),
                  ]),
              const SizedBox(height: 10),
              // Campo de API key
              TextField(
                controller: controller,
                obscureText: _obscure[provider.id] ?? true,
                onChanged: (_) => setState(() {}),
                style: const TextStyle(
                    fontSize: 13, fontFamily: 'monospace'),
                decoration: InputDecoration(
                  hintText:
                      'Ingresa tu ${provider.name} API Key (${provider.hint})',
                  prefixIcon: const Icon(Icons.lock_outline,
                      size: 20, color: AppTheme.textSecondary),
                  suffixIcon: IconButton(
                    icon: Icon(
                      (_obscure[provider.id] ?? true)
                          ? Icons.visibility_off
                          : Icons.visibility,
                      size: 20,
                      color: AppTheme.textSecondary,
                    ),
                    onPressed: () => setState(() =>
                        _obscure[provider.id] =
                            !(_obscure[provider.id] ?? true)),
                  ),
                ),
              ),
            ]),
      ),
    );
  }

  Widget _statusBadge(bool configured, Color accentColor) =>
      Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: (configured ? accentColor : AppTheme.errorRed)
              .withOpacity(0.12),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: (configured ? accentColor : AppTheme.errorRed)
                .withOpacity(0.3),
          ),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(
            configured
                ? Icons.check_circle_outline
                : Icons.cancel_outlined,
            size: 13,
            color: configured ? accentColor : AppTheme.errorRed,
          ),
          const SizedBox(width: 4),
          Text(
            configured ? 'Configurada' : 'No configurada',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: configured ? accentColor : AppTheme.errorRed,
            ),
          ),
        ]),
      );
}
