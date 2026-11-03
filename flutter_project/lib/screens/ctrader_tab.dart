import 'package:flutter/material.dart';
import '../services/ctrader_service.dart';
import '../services/secure_storage_service.dart';
import '../theme/app_theme.dart';

class CTraderTab extends StatefulWidget {
  final CTraderService ctraderService;

  const CTraderTab({
    super.key,
    required this.ctraderService,
  });

  @override
  State<CTraderTab> createState() => _CTraderTabState();
}

class _CTraderTabState extends State<CTraderTab> {
  final TextEditingController _tokenController = TextEditingController();
  bool _obscureToken = true;

  @override
  void initState() {
    super.initState();
    _loadSavedToken();
  }

  Future<void> _loadSavedToken() async {
    final savedToken = await SecureStorageService.getMcpToken();
    if (mounted && savedToken != null && savedToken.isNotEmpty) {
      _tokenController.text = savedToken;
      setState(() {});
    }
  }

  @override
  void dispose() {
    _tokenController.dispose();
    super.dispose();
  }

  void _handleConnect() async {
    final token = _tokenController.text.trim();
    if (token.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ingresa el token MCP de cTrader Remote.')),
      );
      return;
    }

    if (widget.ctraderService.isConnected) {
      widget.ctraderService.disconnect();
    } else {
      final success = await widget.ctraderService.connect(token);
      if (success && mounted) {
        await SecureStorageService.saveMcpToken(token);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle, color: AppTheme.primaryGreen),
                SizedBox(width: 8),
                Text('Conectado exitosamente con cTrader Remote MCP'),
              ],
            ),
            backgroundColor: AppTheme.surfaceHighlight,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final account = widget.ctraderService.account;
    final isConnected = widget.ctraderService.isConnected;
    final isLoading = widget.ctraderService.isLoading;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Header Card with MCP Connection Status
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: (isConnected ? AppTheme.primaryGreen : AppTheme.errorRed).withOpacity(0.12),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Icon(
                                  isConnected ? Icons.cloud_done : Icons.cloud_off,
                                  color: isConnected ? AppTheme.primaryGreen : AppTheme.errorRed,
                                  size: 24,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'cTrader Remote MCP',
                                    style: TextStyle(
                                      fontSize: 16,
                                      fontWeight: FontWeight.bold,
                                      color: AppTheme.textPrimary,
                                    ),
                                  ),
                                  Text(
                                    isConnected ? 'Conectado al servidor MCP' : 'Desconectado',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isConnected ? AppTheme.primaryGreen : AppTheme.errorRed,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                          // Pulse dot
                          Container(
                            width: 12,
                            height: 12,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: isConnected ? AppTheme.primaryGreen : AppTheme.errorRed,
                              boxShadow: [
                                BoxShadow(
                                  color: (isConnected ? AppTheme.primaryGreen : AppTheme.errorRed).withOpacity(0.5),
                                  blurRadius: 8,
                                  spreadRadius: 2,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 16),

                      // Token MCP Input Field
                      const Text(
                        'Token MCP de cTrader Remote',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppTheme.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _tokenController,
                        obscureText: _obscureToken,
                        enabled: !isConnected,
                        style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
                        decoration: InputDecoration(
                          hintText: 'Ingresa tu Token cTrader MCP...',
                          prefixIcon: const Icon(Icons.vpn_key, size: 20, color: AppTheme.textSecondary),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscureToken ? Icons.visibility_off : Icons.visibility,
                              size: 20,
                              color: AppTheme.textSecondary,
                            ),
                            onPressed: () => setState(() => _obscureToken = !_obscureToken),
                          ),
                        ),
                      ),

                      const SizedBox(height: 14),

                      // Botón Conectar / Desconectar
                      SizedBox(
                        width: double.infinity,
                        child: isConnected
                            ? OutlinedButton.icon(
                                style: OutlinedButton.styleFrom(
                                  foregroundColor: AppTheme.errorRed,
                                  side: const BorderSide(color: AppTheme.errorRed),
                                  padding: const EdgeInsets.symmetric(vertical: 13),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                onPressed: _handleConnect,
                                icon: const Icon(Icons.link_off),
                                label: const Text('Desconectar cTrader', style: TextStyle(fontWeight: FontWeight.bold)),
                              )
                            : ElevatedButton.icon(
                                onPressed: isLoading ? null : _handleConnect,
                                icon: isLoading
                                    ? const SizedBox(
                                        width: 18,
                                        height: 18,
                                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                                      )
                                    : const Icon(Icons.link, color: Color(0xFF003915)),
                                label: Text(
                                  isLoading ? 'Conectando con MCP...' : 'Conectar cTrader Remote',
                                  style: const TextStyle(fontWeight: FontWeight.bold),
                                ),
                              ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              if (widget.ctraderService.lastError.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppTheme.errorRed.withOpacity(0.10),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AppTheme.errorRed.withOpacity(0.35)),
                  ),
                  child: Text(
                    widget.ctraderService.lastError,
                    style: const TextStyle(color: AppTheme.errorRed, fontSize: 12),
                  ),
                ),
              ],
              if (isConnected) ...[
                const SizedBox(height: 16),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.verified, color: AppTheme.primaryGreen),
                            const SizedBox(width: 8),
                            const Expanded(
                              child: Text(
                                'Protocolo MCP conectado',
                                style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.textPrimary),
                              ),
                            ),
                            Text(
                              widget.ctraderService.protocolVersion,
                              style: const TextStyle(fontSize: 10, color: AppTheme.textSecondary),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          widget.ctraderService.availableTools.length.toString() + ' herramientas descubiertas en cTrader.',
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 12),
                        ...widget.ctraderService.availableTools.map((tool) {
                          final name = tool['name']?.toString() ?? 'Herramienta sin nombre';
                          final description = tool['description']?.toString() ?? '';
                          return Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 8),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceHighlight,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppTheme.textPrimary)),
                                if (description.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(description, style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                                ],
                              ],
                            ),
                          );
                        }),
                        const SizedBox(height: 4),
                        const Text(
                          'La conexión y el descubrimiento están verificados. La lectura de cuenta y las operaciones se habilitarán al validar los nombres y parámetros reales de estas herramientas.',
                          style: TextStyle(fontSize: 11, color: AppTheme.textSecondary, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ),
              ] else ...[
                // Estado desconectado: Banner explicativo
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppTheme.surfaceHighlight,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.surfaceBorder),
                  ),
                  child: const Column(
                    children: [
                      Icon(Icons.hub_outlined, size: 48, color: AppTheme.textSecondary),
                      SizedBox(height: 12),
                      Text(
                        'Conexión cTrader Remote MCP',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppTheme.textPrimary),
                      ),
                      SizedBox(height: 8),
                      Text(
                        'Ingresa tu token de sesión del protocolo MCP para enlazar la app de forma segura con tu terminal cTrader. Podrás visualizar balance, equity y posiciones abiertas en tiempo real.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: AppTheme.textSecondary, height: 1.4),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
