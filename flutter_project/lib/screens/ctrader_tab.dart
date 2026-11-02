import 'package:flutter/material.dart';
import '../services/ctrader_service.dart';
import '../theme/app_theme.dart';
import '../models/ctrader_account.dart';

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
    _tokenController.text = widget.ctraderService.account.mcpToken.isNotEmpty
        ? widget.ctraderService.account.mcpToken
        : "mcp-ctrader-live-token-849204918237";
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

              // Account Details (Visible when connected)
              if (isConnected) ...[
                // Metrics row: Balance & Equity
                Row(
                  children: [
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Balance', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                              const SizedBox(height: 4),
                              Text(
                                '\$${account.balance.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.textPrimary,
                                ),
                              ),
                              const SizedBox(height: 4),
                              const Text('Moneda: USD', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text('Equity', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
                              const SizedBox(height: 4),
                              Text(
                                '\$${account.equity.toStringAsFixed(2)}',
                                style: const TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.bold,
                                  color: AppTheme.primaryGreen,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Margen Libre: \$${account.freeMargin.toStringAsFixed(2)}',
                                style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // Posiciones Abiertas
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.candlestick_chart, color: AppTheme.primaryGreen, size: 20),
                        const SizedBox(width: 8),
                        Text(
                          'Posiciones Abiertas (${account.positions.length})',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryGreen.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Text(
                        'En Tiempo Real',
                        style: TextStyle(fontSize: 11, color: AppTheme.primaryGreen, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 10),

                if (account.positions.isEmpty)
                  Container(
                    padding: const EdgeInsets.all(32),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: AppTheme.surfaceHighlight,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Column(
                      children: [
                        Icon(Icons.inbox_outlined, size: 40, color: AppTheme.textSecondary),
                        SizedBox(height: 8),
                        Text('No hay posiciones abiertas en cTrader.', style: TextStyle(color: AppTheme.textSecondary)),
                      ],
                    ),
                  )
                else
                  ListView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: account.positions.length,
                    itemBuilder: (context, index) {
                      final pos = account.positions[index];
                      final isPositive = pos.pnl >= 0;

                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: pos.direction == 'BUY'
                                              ? AppTheme.primaryGreen.withOpacity(0.15)
                                              : AppTheme.errorRed.withOpacity(0.15),
                                          borderRadius: BorderRadius.circular(6),
                                        ),
                                        child: Text(
                                          pos.direction,
                                          style: TextStyle(
                                            color: pos.direction == 'BUY' ? AppTheme.primaryGreen : AppTheme.errorRed,
                                            fontWeight: FontWeight.bold,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        pos.pair,
                                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                                      ),
                                      const SizedBox(width: 8),
                                      Text(
                                        '${pos.lots} Lotes',
                                        style: const TextStyle(color: AppTheme.textSecondary, fontSize: 13),
                                      ),
                                    ],
                                  ),
                                  // PnL Badge
                                  Text(
                                    '${isPositive ? '+' : ''}\$${pos.pnl.toStringAsFixed(2)}',
                                    style: TextStyle(
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16,
                                      color: isPositive ? AppTheme.primaryGreen : AppTheme.errorRed,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Entrada: ${pos.entryPrice}  |  Actual: ${pos.currentPrice.toStringAsFixed(pos.pair.contains('BTC') ? 1 : 4)}',
                                    style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                                  ),
                                  InkWell(
                                    onTap: () => widget.ctraderService.closePosition(pos.id),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                      decoration: BoxDecoration(
                                        color: AppTheme.errorRed.withOpacity(0.12),
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: const Text(
                                        'Cerrar',
                                        style: TextStyle(fontSize: 11, color: AppTheme.errorRed, fontWeight: FontWeight.bold),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      );
                    },
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
