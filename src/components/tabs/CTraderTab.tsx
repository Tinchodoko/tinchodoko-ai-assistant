import React, { useState } from 'react';
import {
  Link,
  Unlink,
  Eye,
  EyeOff,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Layers,
  X,
  PlusCircle,
  ShieldCheck,
  Server
} from 'lucide-react';
import { Position } from '../../utils/tradeLogic';

interface CTraderTabProps {
  isConnected: boolean;
  mcpToken: string;
  balance: number;
  equity: number;
  positions: Position[];
  onConnectToggle: (token: string) => void;
  onClosePosition: (positionId: string) => void;
  onAddPosition: (pos: Position) => void;
}

export const CTraderTab: React.FC<CTraderTabProps> = ({
  isConnected,
  mcpToken,
  balance,
  equity,
  positions,
  onConnectToggle,
  onClosePosition,
  onAddPosition,
}) => {
  const [tokenInput, setTokenInput] = useState<string>(
    mcpToken || 'ctrader-mcp-remote-session-98421098432'
  );
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // New Position Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newPair, setNewPair] = useState<string>('EURUSD');
  const [newDir, setNewDir] = useState<'BUY' | 'SELL'>('BUY');
  const [newLots, setNewLots] = useState<number>(0.2);

  const handleToggle = () => {
    if (!isConnected && !tokenInput.trim()) return;

    setIsConnecting(true);
    setTimeout(() => {
      onConnectToggle(tokenInput);
      setIsConnecting(false);
    }, 700);
  };

  const handleCreatePosition = () => {
    const entry = newPair.includes('JPY') ? 152.8 : newPair.includes('XAU') ? 2742.0 : newPair.includes('BTC') ? 68900 : 1.0855;
    const pos: Position = {
      id: `POS-${Math.floor(1000 + Math.random() * 9000)}`,
      pair: newPair,
      direction: newDir,
      lots: newLots,
      entryPrice: entry,
      currentPrice: entry,
      pnl: 0,
      stopLoss: newDir === 'BUY' ? entry * 0.995 : entry * 1.005,
      takeProfit: newDir === 'BUY' ? entry * 1.01 : entry * 0.99,
      openTime: new Date().toLocaleTimeString(),
    };
    onAddPosition(pos);
    setShowAddModal(false);
  };

  const totalPnL = positions.reduce((acc, p) => acc + p.pnl, 0);

  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-[#F0F6FC] select-none">
      {/* Top Banner */}
      <div className="p-4 border-b border-[#30363D] bg-[#161B22]/90 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#00E676]/10 border border-[#00E676]/20 flex items-center justify-center text-[#00E676]">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F0F6FC]">cTrader Remote MCP</h2>
            <p className="text-xs text-[#8B949E]">
              Protocolo de Control Remoto de Trading
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            isConnected
              ? 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/30'
              : 'bg-[#FF5252]/10 text-[#FF5252] border-[#FF5252]/30'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-[#00E676] shadow-[0_0_8px_#00E676] animate-pulse'
                : 'bg-[#FF5252]'
            }`}
          />
          <span>{isConnected ? 'Conectado' : 'Desconectado'}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Token MCP Connection Card */}
        <div className="bg-[#161B22] rounded-2xl p-4 border border-[#30363D] shadow-sm">
          <label className="block text-xs font-semibold text-[#8B949E] mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00E676]" />
              Token MCP de cTrader Remote
            </span>
            <span className="text-[10px] text-[#8B949E] font-normal">
              Endpoint: wss://mcp.ctrader.remote/v1
            </span>
          </label>

          <div className="relative flex items-center mb-3">
            <input
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              disabled={isConnected}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Ingresa tu token de autenticación MCP..."
              className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl px-3 py-2.5 pr-10 text-xs font-mono text-[#F0F6FC] placeholder-[#8B949E] outline-none disabled:opacity-60 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2.5 text-[#8B949E] hover:text-[#F0F6FC] p-1"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Botón Conectar / Desconectar */}
          <button
            onClick={handleToggle}
            disabled={isConnecting || (!isConnected && !tokenInput.trim())}
            className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isConnected
                ? 'bg-[#21262D] hover:bg-[#FF5252]/20 border border-[#FF5252]/40 text-[#FF5252]'
                : 'bg-[#00E676] hover:bg-[#00c864] text-[#003915] shadow-[0_4px_16px_rgba(0,230,118,0.25)]'
            }`}
          >
            {isConnecting ? (
              <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isConnected ? (
              <>
                <Unlink className="w-4 h-4" />
                <span>Desconectar cTrader</span>
              </>
            ) : (
              <>
                <Link className="w-4 h-4 text-[#003915]" />
                <span>Conectar con cTrader Remote</span>
              </>
            )}
          </button>
        </div>

        {/* Display Balance, Equity & Open Positions when connected */}
        {isConnected ? (
          <div className="space-y-4 animate-fadeIn">
            {/* Account Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#161B22] p-4 rounded-2xl border border-[#30363D]">
                <div className="flex items-center justify-between text-[#8B949E] text-xs mb-1">
                  <span>Balance</span>
                  <DollarSign className="w-4 h-4 text-[#8B949E]" />
                </div>
                <div className="text-xl font-bold font-mono text-[#F0F6FC]">
                  ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#8B949E] mt-1">Divisa base: USD</div>
              </div>

              <div className="bg-[#161B22] p-4 rounded-2xl border border-[#30363D]">
                <div className="flex items-center justify-between text-[#8B949E] text-xs mb-1">
                  <span>Equity</span>
                  <Activity className="w-4 h-4 text-[#00E676]" />
                </div>
                <div className="text-xl font-bold font-mono text-[#00E676]">
                  ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#8B949E] mt-1">
                  P&L Flotante:{' '}
                  <span
                    className={
                      totalPnL >= 0 ? 'text-[#00E676] font-bold' : 'text-[#FF5252] font-bold'
                    }
                  >
                    {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Positions Section Header */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#00E676]" />
                <h3 className="text-sm font-bold text-[#F0F6FC]">
                  Posiciones Abiertas ({positions.length})
                </h3>
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#00E676] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Nueva Orden</span>
              </button>
            </div>

            {/* Positions List */}
            {positions.length === 0 ? (
              <div className="p-8 text-center bg-[#161B22] rounded-2xl border border-[#30363D]">
                <Layers className="w-10 h-10 text-[#8B949E]/40 mx-auto mb-2" />
                <p className="text-sm text-[#8B949E]">No hay posiciones abiertas en cTrader.</p>
                <p className="text-xs text-[#8B949E]/70 mt-1">
                  Genera una señal en el Assistant o agrega una orden manual.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {positions.map((pos) => {
                  const isProfit = pos.pnl >= 0;
                  return (
                    <div
                      key={pos.id}
                      className="bg-[#161B22] rounded-xl p-3.5 border border-[#30363D] hover:border-[#30363D]/80 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              pos.direction === 'BUY'
                                ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30'
                                : 'bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30'
                            }`}
                          >
                            {pos.direction}
                          </span>
                          <span className="font-bold text-sm text-[#F0F6FC]">{pos.pair}</span>
                          <span className="text-xs text-[#8B949E] font-mono">{pos.lots} lotes</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`font-mono text-sm font-bold ${
                              isProfit ? 'text-[#00E676]' : 'text-[#FF5252]'
                            }`}
                          >
                            {isProfit ? '+' : ''}${pos.pnl.toFixed(2)}
                          </span>
                          <button
                            onClick={() => onClosePosition(pos.id)}
                            className="text-[11px] px-2 py-1 rounded bg-[#FF5252]/10 hover:bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/30 cursor-pointer transition-colors"
                          >
                            Cerrar
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-[#8B949E] font-mono border-t border-[#30363D]/60 pt-2">
                        <span>
                          Entrada: <strong className="text-[#F0F6FC]">{pos.entryPrice}</strong>
                        </span>
                        <span>
                          Actual: <strong className="text-[#F0F6FC]">{pos.currentPrice}</strong>
                        </span>
                        <span>SL: {pos.stopLoss}</span>
                        <span>TP: {pos.takeProfit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Disconnected Information Box */
          <div className="bg-[#161B22] rounded-2xl p-6 border border-[#30363D] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#21262D] flex items-center justify-center mx-auto text-[#8B949E]">
              <Unlink className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-[#F0F6FC]">cTrader Remote no enlazado</h3>
            <p className="text-xs text-[#8B949E] leading-relaxed max-w-sm mx-auto">
              Introduce el token del protocolo MCP provisto por tu terminal cTrader Remote y pulsa
              "Conectar" para sincronizar tus métricas de balance, equity y posiciones activas.
            </p>
          </div>
        )}
      </div>

      {/* Manual Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5 w-full max-w-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[#F0F6FC]">Nueva Posición cTrader</h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#8B949E] hover:text-[#F0F6FC]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs text-[#8B949E] block mb-1">Par / Símbolo</label>
              <select
                value={newPair}
                onChange={(e) => setNewPair(e.target.value)}
                className="w-full bg-[#21262D] border border-[#30363D] rounded-lg p-2 text-xs text-[#F0F6FC] outline-none"
              >
                <option value="EURUSD">EURUSD</option>
                <option value="XAUUSD">XAUUSD (Oro)</option>
                <option value="BTCUSD">BTCUSD (Bitcoin)</option>
                <option value="GBPUSD">GBPUSD</option>
                <option value="USDJPY">USDJPY</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-[#8B949E] block mb-1">Dirección</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewDir('BUY')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                    newDir === 'BUY'
                      ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676]'
                      : 'bg-[#21262D] border-[#30363D] text-[#8B949E]'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setNewDir('SELL')}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                    newDir === 'SELL'
                      ? 'bg-[#FF5252]/20 border-[#FF5252] text-[#FF5252]'
                      : 'bg-[#21262D] border-[#30363D] text-[#8B949E]'
                  }`}
                >
                  SELL
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-[#8B949E] block mb-1">Volumen (Lotes)</label>
              <input
                type="number"
                step="0.05"
                min="0.01"
                value={newLots}
                onChange={(e) => setNewLots(parseFloat(e.target.value) || 0.1)}
                className="w-full bg-[#21262D] border border-[#30363D] rounded-lg p-2 text-xs text-[#F0F6FC] outline-none font-mono"
              />
            </div>

            <button
              onClick={handleCreatePosition}
              className="w-full py-2.5 rounded-xl font-bold text-xs bg-[#00E676] text-[#003915] hover:bg-[#00c864]"
            >
              Ejecutar Orden
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
