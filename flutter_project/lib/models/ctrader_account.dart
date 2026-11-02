class CTraderPosition {
  final String id;
  final String pair;
  final String direction; // 'BUY' or 'SELL'
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

  Map<String, dynamic> toJson() => {
    'id': id,
    'pair': pair,
    'direction': direction,
    'lots': lots,
    'entryPrice': entryPrice,
    'currentPrice': currentPrice,
    'pnl': pnl,
    'stopLoss': stopLoss,
    'takeProfit': takeProfit,
    'openTime': openTime,
  };
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
}
