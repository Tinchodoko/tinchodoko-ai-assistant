class TradeOperation {
  final String id;
  final DateTime date;
  final String pair;
  final String direction; // 'BUY' or 'SELL'
  final String result;    // e.g. "+$145.20", "-$32.10", "Pendiente"
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

  Map<String, dynamic> toJson() => {
    'id': id,
    'date': date.toIso8601String(),
    'pair': pair,
    'direction': direction,
    'result': result,
    'isConfirmed': isConfirmed,
    'pnl': pnl,
    'modelUsed': modelUsed,
    'notes': notes,
  };

  factory TradeOperation.fromJson(Map<String, dynamic> json) => TradeOperation(
    id: json['id'],
    date: DateTime.parse(json['date']),
    pair: json['pair'],
    direction: json['direction'],
    result: json['result'],
    isConfirmed: json['isConfirmed'] ?? true,
    pnl: (json['pnl'] as num?)?.toDouble(),
    modelUsed: json['modelUsed'],
    notes: json['notes'],
  );
}
