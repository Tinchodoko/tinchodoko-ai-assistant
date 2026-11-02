import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/trade_operation.dart';
import '../theme/app_theme.dart';

class HistoryTab extends StatefulWidget {
  final List<TradeOperation> operations;
  final VoidCallback onClearHistory;

  const HistoryTab({
    super.key,
    required this.operations,
    required this.onClearHistory,
  });

  @override
  State<HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends State<HistoryTab> {
  String _filter = 'TODOS'; // 'TODOS', 'CONFIRMADAS', 'RECHAZADAS'

  List<TradeOperation> get _filteredOperations {
    if (_filter == 'CONFIRMADAS') {
      return widget.operations.where((op) => op.isConfirmed).toList();
    } else if (_filter == 'RECHAZADAS') {
      return widget.operations.where((op) => !op.isConfirmed).toList();
    }
    return widget.operations;
  }

  @override
  Widget build(BuildContext context) {
    final ops = _filteredOperations;
    final confirmedCount = widget.operations.where((o) => o.isConfirmed).length;
    final rejectedCount = widget.operations.where((o) => !o.isConfirmed).length;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Top Summary Bar
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'Historial de Operaciones',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                      if (widget.operations.isNotEmpty)
                        IconButton(
                          icon: const Icon(Icons.delete_sweep_outlined, color: AppTheme.textSecondary),
                          tooltip: 'Limpiar Historial',
                          onPressed: () {
                            showDialog(
                              context: context,
                              builder: (ctx) => AlertDialog(
                                backgroundColor: AppTheme.surfaceColor,
                                title: const Text('¿Limpiar historial?'),
                                content: const Text('Se borrarán los registros anteriores.'),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.pop(ctx),
                                    child: const Text('Cancelar'),
                                  ),
                                  ElevatedButton(
                                    style: ElevatedButton.styleFrom(backgroundColor: AppTheme.errorRed),
                                    onPressed: () {
                                      Navigator.pop(ctx);
                                      widget.onClearHistory();
                                    },
                                    child: const Text('Borrar'),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // Filter Chips
                  Row(
                    children: [
                      _buildFilterChip('TODOS', 'Todos (${widget.operations.length})'),
                      const SizedBox(width: 8),
                      _buildFilterChip('CONFIRMADAS', 'Confirmadas ($confirmedCount)'),
                      const SizedBox(width: 8),
                      _buildFilterChip('RECHAZADAS', 'Rechazadas ($rejectedCount)'),
                    ],
                  ),
                ],
              ),
            ),

            const Divider(color: AppTheme.surfaceBorder, height: 1),

            // Operations List
            Expanded(
              child: ops.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.history_toggle_off, size: 54, color: AppTheme.textSecondary.withOpacity(0.5)),
                          const SizedBox(height: 12),
                          const Text(
                            'No hay operaciones registradas.',
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 15),
                          ),
                          const SizedBox(height: 6),
                          const Text(
                            'Usa el Asistente IA para generar y evaluar señales.',
                            style: TextStyle(color: AppTheme.textSecondary, fontSize: 12),
                          ),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      itemCount: ops.length,
                      itemBuilder: (context, index) {
                        final item = ops[index];
                        final formattedDate = DateFormat('dd/MM/yyyy HH:mm').format(item.date);
                        final isConfirmed = item.isConfirmed;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                // Top row: Direction & Pair + Confirmation Badge
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Row(
                                      children: [
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                          decoration: BoxDecoration(
                                            color: item.direction == 'BUY'
                                                ? AppTheme.primaryGreen.withOpacity(0.15)
                                                : AppTheme.errorRed.withOpacity(0.15),
                                            borderRadius: BorderRadius.circular(6),
                                          ),
                                          child: Text(
                                            item.direction,
                                            style: TextStyle(
                                              color: item.direction == 'BUY'
                                                  ? AppTheme.primaryGreen
                                                  : AppTheme.errorRed,
                                              fontWeight: FontWeight.bold,
                                              fontSize: 12,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          item.pair,
                                          style: const TextStyle(
                                            fontSize: 16,
                                            fontWeight: FontWeight.bold,
                                            color: AppTheme.textPrimary,
                                          ),
                                        ),
                                      ],
                                    ),
                                    // User Decision: Confirmada / Rechazada
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      decoration: BoxDecoration(
                                        color: isConfirmed
                                            ? AppTheme.primaryGreen.withOpacity(0.15)
                                            : AppTheme.errorRed.withOpacity(0.15),
                                        borderRadius: BorderRadius.circular(20),
                                        border: Border.all(
                                          color: isConfirmed
                                              ? AppTheme.primaryGreen.withOpacity(0.4)
                                              : AppTheme.errorRed.withOpacity(0.4),
                                        ),
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          Icon(
                                            isConfirmed ? Icons.check_circle : Icons.cancel,
                                            size: 13,
                                            color: isConfirmed ? AppTheme.primaryGreen : AppTheme.errorRed,
                                          ),
                                          const SizedBox(width: 4),
                                          Text(
                                            isConfirmed ? 'Confirmada' : 'Rechazada',
                                            style: TextStyle(
                                              fontSize: 11,
                                              fontWeight: FontWeight.bold,
                                              color: isConfirmed ? AppTheme.primaryGreen : AppTheme.errorRed,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),

                                const SizedBox(height: 10),

                                // Row: Resultado & Fecha
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        const Text('Resultado', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                                        const SizedBox(height: 2),
                                        Text(
                                          item.result,
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w600,
                                            color: isConfirmed ? AppTheme.primaryGreen : AppTheme.textSecondary,
                                          ),
                                        ),
                                      ],
                                    ),
                                    Column(
                                      crossAxisAlignment: CrossAxisAlignment.end,
                                      children: [
                                        const Text('Fecha y Hora', style: TextStyle(fontSize: 11, color: AppTheme.textSecondary)),
                                        const SizedBox(height: 2),
                                        Text(
                                          formattedDate,
                                          style: const TextStyle(fontSize: 12, color: AppTheme.textPrimary),
                                        ),
                                      ],
                                    ),
                                  ],
                                ),

                                if (item.modelUsed != null || item.notes != null) ...[
                                  const SizedBox(height: 8),
                                  Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.all(8),
                                    decoration: BoxDecoration(
                                      color: AppTheme.surfaceHighlight,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: Text(
                                      '${item.modelUsed != null ? "Modelo: ${item.modelUsed} • " : ""}${item.notes ?? ""}',
                                      style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterChip(String filterKey, String label) {
    final isSelected = _filter == filterKey;
    return InkWell(
      onTap: () => setState(() => _filter = filterKey),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AppTheme.primaryGreen : AppTheme.surfaceHighlight,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppTheme.primaryGreen : AppTheme.surfaceBorder,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: isSelected ? const Color(0xFF003915) : AppTheme.textPrimary,
          ),
        ),
      ),
    );
  }
}
