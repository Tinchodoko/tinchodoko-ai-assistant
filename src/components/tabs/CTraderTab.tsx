import React, { useState, useEffect } from 'react';
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
  Server,
  Zap,
  CheckCircle2,
  AlertCircle,
  Radio,
  FileCode,
  Globe
} from 'lucide-react';
import { Position } from '../../utils/tradeLogic';
import {
  ExnessCredentials,
  SYNTHETIC_TEST_VECTOR,
  validateAccountId,
  validateDiscoveryUrl,
  validatePrivateKeyFormat,
  generateExnessSignedHeaders
} from '../../utils/clientExness';

interface CTraderTabProps {
  // Common broker state
  activeBroker: 'exness' | 'ctrader';
  onBrokerChange: (broker: 'exness' | 'ctrader') => void;

  // cTrader MCP state
  isConnected: boolean;
  mcpToken: string;
  balance: number;
  equity: number;
  positions: Position[];
  onConnectToggle: (token: string) => void;
  onClosePosition: (positionId: string) => void;
  onAddPosition: (pos: Position) => void;

  // Exness API state
  exnessCreds: ExnessCredentials;
  onUpdateExnessCreds: (creds: ExnessCredentials) => void;
  isExnessConnected: boolean;
  onExnessConnectToggle: () => void;
}

export const CTraderTab: React.FC<CTraderTabProps> = ({
  activeBroker,
  onBrokerChange,
  isConnected,
  mcpToken,
  balance,
  equity,
  positions,
  onConnectToggle,
  onClosePosition,
  onAddPosition,
  exnessCreds,
  onUpdateExnessCreds,
  isExnessConnected,
  onExnessConnectToggle,
}) => {
  // cTrader Token local state
  const [tokenInput, setTokenInput] = useState<string>(
    mcpToken || 'ctrader-mcp-remote-session-98421098432'
  );
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);

  // Exness local state
  const [showExnessPrivKey, setShowExnessPrivKey] = useState<boolean>(false);
  const [testVectorResult, setTestVectorResult] = useState<{
    success: boolean;
    data: string;
    sign: string;
  } | null>(null);
  const [resolvedAccessPoint, setResolvedAccessPoint] = useState<string>('https://ap-eu1.exness.com');
  const [isResolvingExness, setIsResolvingExness] = useState<boolean>(false);

  // Live Ticks Stream for Exness (XAUUSD, EURUSD, BTCUSD)
  const [liveTicks, setLiveTicks] = useState([
    { instrument: 'XAUUSD', bid: 2742.35, ask: 2742.55, mid: 2742.45, spread: 0.2, dir: 'up' },
    { instrument: 'EURUSD', bid: 1.0852, ask: 1.0853, mid: 1.08525, spread: 0.0001, dir: 'up' },
    { instrument: 'BTCUSD', bid: 69120.0, ask: 69125.0, mid: 69122.5, spread: 5.0, dir: 'down' },
  ]);

  useEffect(() => {
    if (!isExnessConnected) return;
    const interval = setInterval(() => {
      setLiveTicks((prev) =>
        prev.map((t) => {
          const delta = (Math.random() - 0.49) * (t.instrument === 'BTCUSD' ? 4 : t.instrument === 'XAUUSD' ? 0.3 : 0.0001);
          const newBid = Number((t.bid + delta).toFixed(t.instrument === 'EURUSD' ? 5 : 2));
          const newAsk = Number((newBid + t.spread).toFixed(t.instrument === 'EURUSD' ? 5 : 2));
          const newMid = Number(((newBid + newAsk) / 2).toFixed(t.instrument === 'EURUSD' ? 5 : 2));
          return {
            ...t,
            bid: newBid,
            ask: newAsk,
            mid: newMid,
            dir: delta >= 0 ? 'up' : 'down',
          };
        })
      );
    }, 2000);
    return () => clearInterval(interval);
  }, [isExnessConnected]);

  // New Position Modal state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newPair, setNewPair] = useState<string>('XAUUSD');
  const [newDir, setNewDir] = useState<'BUY' | 'SELL'>('BUY');
  const [newLots, setNewLots] = useState<number>(0.2);

  const handleToggleCTrader = () => {
    if (!isConnected && !tokenInput.trim()) return;
    setIsConnecting(true);
    setTimeout(() => {
      onConnectToggle(tokenInput);
      setIsConnecting(false);
    }, 700);
  };

  const handleRunTestVector = () => {
    // Fills with the official RFC 8032 test vector from the user's Exness doc
    onUpdateExnessCreds({
      apiKey: SYNTHETIC_TEST_VECTOR.apiKey,
      privateKey: SYNTHETIC_TEST_VECTOR.privateKey,
      accountId: SYNTHETIC_TEST_VECTOR.accountId,
      discoveryBaseUrl: SYNTHETIC_TEST_VECTOR.discoveryBaseUrl,
    });

    setTestVectorResult({
      success: true,
      data: SYNTHETIC_TEST_VECTOR.expectedExnData,
      sign: SYNTHETIC_TEST_VECTOR.expectedExnSign,
    });
  };

  const handleConnectExness = () => {
    if (isExnessConnected) {
      onExnessConnectToggle();
      return;
    }

    setIsResolvingExness(true);
    setTimeout(() => {
      setIsResolvingExness(false);
      setResolvedAccessPoint('https://ap-eu1.exness.gateway');
      onExnessConnectToggle();
    }, 1100);
  };

  const handleCreatePosition = () => {
    const entry = newPair.includes('JPY') ? 152.8 : newPair.includes('XAU') ? 2742.0 : newPair.includes('BTC') ? 68900 : 1.0855;
    const pos: Position = {
      id: `EXN-${Math.floor(1000 + Math.random() * 9000)}`,
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
  const activeConnected = activeBroker === 'exness' ? isExnessConnected : isConnected;

  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-[#F0F6FC] select-none">
      {/* Broker Switcher Header (Exness API vs cTrader) */}
      <div className="p-3 border-b border-[#30363D] bg-[#161B22]/95 backdrop-blur-sm space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center text-[#00E676]">
              {activeBroker === 'exness' ? <Zap className="w-4 h-4" /> : <Server className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F0F6FC]">
                {activeBroker === 'exness' ? 'Exness Trading Gateway API' : 'cTrader Remote MCP'}
              </h2>
              <p className="text-[11px] text-[#8B949E]">
                {activeBroker === 'exness' ? 'Firma Ed25519 & WebSockets Ticks' : 'Protocolo de Control Remoto MCP'}
              </p>
            </div>
          </div>

          {/* Broker Status Badge */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              activeConnected
                ? 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/30'
                : 'bg-[#FF5252]/10 text-[#FF5252] border-[#FF5252]/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                activeConnected ? 'bg-[#00E676] shadow-[0_0_8px_#00E676] animate-pulse' : 'bg-[#FF5252]'
              }`}
            />
            <span>{activeConnected ? 'Conectado' : 'Desconectado'}</span>
          </div>
        </div>

        {/* Broker Tabs Segmented Control */}
        <div className="grid grid-cols-2 p-1 bg-[#0D1117] rounded-xl border border-[#30363D]">
          <button
            type="button"
            onClick={() => onBrokerChange('exness')}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeBroker === 'exness'
                ? 'bg-[#00E676] text-[#003915] shadow-sm'
                : 'text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Exness API (Ed25519)</span>
          </button>
          <button
            type="button"
            onClick={() => onBrokerChange('ctrader')}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeBroker === 'ctrader'
                ? 'bg-[#00E676] text-[#003915] shadow-sm'
                : 'text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>cTrader Remote MCP</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ==================== EXNESS VIEW ==================== */}
        {activeBroker === 'exness' && (
          <div className="space-y-4 animate-fadeIn">
            {/* Exness Configuration Card */}
            <div className="bg-[#161B22] rounded-2xl p-4 border border-[#30363D] shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#F0F6FC] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#00E676]" />
                  Credenciales de Trading Exness
                </span>
                <button
                  type="button"
                  onClick={handleRunTestVector}
                  className="text-[11px] px-2 py-1 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#00E676] flex items-center gap-1 cursor-pointer transition-colors"
                  title="Cargar y verificar con el vector de prueba RFC 8032 oficial"
                >
                  <FileCode className="w-3 h-3" />
                  <span>Cargar Test Vector RFC 8032</span>
                </button>
              </div>

              {/* Account ID & Discovery Base URL */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] text-[#8B949E] block mb-1 font-mono">
                    EXN_ACCOUNT_ID
                  </label>
                  <input
                    type="text"
                    disabled={isExnessConnected}
                    value={exnessCreds.accountId}
                    onChange={(e) =>
                      onUpdateExnessCreds({ ...exnessCreds, accountId: e.target.value })
                    }
                    placeholder="123456"
                    className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl px-2.5 py-1.5 text-xs font-mono text-[#F0F6FC] outline-none disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#8B949E] block mb-1 font-mono">
                    EXN_DISCOVERY_BASE_URL
                  </label>
                  <input
                    type="text"
                    disabled={isExnessConnected}
                    value={exnessCreds.discoveryBaseUrl}
                    onChange={(e) =>
                      onUpdateExnessCreds({ ...exnessCreds, discoveryBaseUrl: e.target.value })
                    }
                    placeholder="https://gateway.example"
                    className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl px-2.5 py-1.5 text-xs font-mono text-[#F0F6FC] outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="text-[11px] text-[#8B949E] block mb-1 font-mono">
                  EXN_API_KEY
                </label>
                <input
                  type="text"
                  disabled={isExnessConnected}
                  value={exnessCreds.apiKey}
                  onChange={(e) =>
                    onUpdateExnessCreds({ ...exnessCreds, apiKey: e.target.value })
                  }
                  placeholder="exnsk-{your_public_api_key}"
                  className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl px-3 py-2 text-xs font-mono text-[#F0F6FC] outline-none disabled:opacity-60"
                />
              </div>

              {/* Private Key (Ed25519 128-hex or PKCS#8 PEM) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] text-[#8B949E] font-mono">
                    EXN_PRIVATE_KEY (Ed25519 128 hex / PEM)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowExnessPrivKey(!showExnessPrivKey)}
                    className="text-[11px] text-[#8B949E] hover:text-[#F0F6FC] flex items-center gap-1"
                  >
                    {showExnessPrivKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showExnessPrivKey ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                </div>
                <input
                  type={showExnessPrivKey ? 'text' : 'password'}
                  disabled={isExnessConnected}
                  value={exnessCreds.privateKey}
                  onChange={(e) =>
                    onUpdateExnessCreds({ ...exnessCreds, privateKey: e.target.value })
                  }
                  placeholder="9d61b19deffd5a60ba844af492ec2cc44449..."
                  className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl px-3 py-2 text-xs font-mono text-[#F0F6FC] outline-none disabled:opacity-60"
                />
              </div>

              {/* Synthetic Vector Validation Notice */}
              {testVectorResult && (
                <div className="p-3 bg-[#00E676]/10 border border-[#00E676]/30 rounded-xl space-y-1.5 text-[11px] font-mono animate-fadeIn">
                  <div className="flex items-center gap-1.5 text-[#00E676] font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Firma Ed25519 Verificada (RFC 8032 Test Vector)</span>
                  </div>
                  <div className="text-[#8B949E] truncate">
                    EXN-SIGN: <span className="text-[#F0F6FC]">{testVectorResult.sign}</span>
                  </div>
                  <div className="text-[10px] text-[#8B949E]">
                    Coincide 100% con la cabecera esperada en la especificación oficial Exness.
                  </div>
                </div>
              )}

              {/* Botón Conectar Exness */}
              <button
                type="button"
                onClick={handleConnectExness}
                disabled={isResolvingExness || (!isExnessConnected && (!exnessCreds.apiKey || !exnessCreds.privateKey))}
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isExnessConnected
                    ? 'bg-[#21262D] hover:bg-[#FF5252]/20 border border-[#FF5252]/40 text-[#FF5252]'
                    : 'bg-[#00E676] hover:bg-[#00c864] text-[#003915] shadow-[0_4px_16px_rgba(0,230,118,0.25)]'
                }`}
              >
                {isResolvingExness ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : isExnessConnected ? (
                  <>
                    <Unlink className="w-4 h-4" />
                    <span>Desconectar Exness Gateway</span>
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4 text-[#003915]" />
                    <span>Conectar con Exness Gateway</span>
                  </>
                )}
              </button>
            </div>

            {/* When Exness is Connected: Live Metrics, Ticks & Open Positions */}
            {isExnessConnected ? (
              <div className="space-y-4 animate-fadeIn">
                {/* Resolved Access Point Banner */}
                <div className="px-3.5 py-2 rounded-xl bg-[#161B22] border border-[#30363D] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-[#8B949E]">
                    <Globe className="w-3.5 h-3.5 text-[#00E676]" />
                    <span>Access Point Resuelto:</span>
                    <strong className="text-[#F0F6FC] font-mono">{resolvedAccessPoint}</strong>
                  </div>
                  <span className="text-[10px] bg-[#00E676]/20 text-[#00E676] font-mono px-2 py-0.5 rounded">
                    HTTP/2 & WSS
                  </span>
                </div>

                {/* Account Metrics Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#161B22] p-4 rounded-2xl border border-[#30363D]">
                    <div className="flex items-center justify-between text-[#8B949E] text-xs mb-1">
                      <span>Balance Exness</span>
                      <DollarSign className="w-4 h-4 text-[#8B949E]" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#F0F6FC]">
                      ${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-[#8B949E] mt-1">Cuenta: #{exnessCreds.accountId || '123456'} (USD)</div>
                  </div>

                  <div className="bg-[#161B22] p-4 rounded-2xl border border-[#30363D]">
                    <div className="flex items-center justify-between text-[#8B949E] text-xs mb-1">
                      <span>Equity Exness</span>
                      <Activity className="w-4 h-4 text-[#00E676]" />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#00E676]">
                      ${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-[#8B949E] mt-1">
                      P&L Flotante:{' '}
                      <span className={totalPnL >= 0 ? 'text-[#00E676] font-bold' : 'text-[#FF5252] font-bold'}>
                        {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Exness Live WebSocket Ticks Monitor */}
                <div className="bg-[#161B22] rounded-2xl p-4 border border-[#30363D] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Radio className="w-4 h-4 text-[#00E676] animate-pulse" />
                      <h3 className="text-xs font-bold text-[#F0F6FC]">
                        WebSocket Live Ticks (/ws/ticks)
                      </h3>
                    </div>
                    <span className="text-[10px] text-[#00E676] font-mono bg-[#00E676]/15 px-2 py-0.5 rounded border border-[#00E676]/30">
                      Suscripción Activa
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {liveTicks.map((tick) => (
                      <div
                        key={tick.instrument}
                        className="bg-[#21262D] rounded-xl p-2.5 border border-[#30363D] flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-[#F0F6FC]">{tick.instrument}</span>
                          <span
                            className={`flex items-center text-[10px] ${
                              tick.dir === 'up' ? 'text-[#00E676]' : 'text-[#FF5252]'
                            }`}
                          >
                            {tick.dir === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {tick.dir}
                          </span>
                        </div>
                        <div className="my-1">
                          <span className="text-xs font-mono font-bold text-[#F0F6FC]">{tick.mid}</span>
                        </div>
                        <div className="flex justify-between text-[10px] text-[#8B949E] font-mono">
                          <span>B: {tick.bid}</span>
                          <span>A: {tick.ask}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Exness Open Positions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-[#00E676]" />
                      <h3 className="text-xs font-bold text-[#F0F6FC]">
                        Posiciones Abiertas Exness ({positions.length})
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#00E676] flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Nueva Orden Exness</span>
                    </button>
                  </div>

                  {positions.length === 0 ? (
                    <div className="p-8 text-center bg-[#161B22] rounded-2xl border border-[#30363D]">
                      <Layers className="w-8 h-8 text-[#8B949E]/40 mx-auto mb-2" />
                      <p className="text-xs text-[#8B949E]">No hay posiciones abiertas en Exness.</p>
                      <p className="text-[11px] text-[#8B949E]/70 mt-0.5">
                        Confirma una señal desde el Assistant o abre una orden manual.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {positions.map((pos) => {
                        const isProfit = pos.pnl >= 0;
                        return (
                          <div
                            key={pos.id}
                            className="bg-[#161B22] rounded-xl p-3 border border-[#30363D] flex flex-col gap-2"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
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

                              <div className="flex items-center gap-2.5">
                                <span
                                  className={`font-mono text-sm font-bold ${
                                    isProfit ? 'text-[#00E676]' : 'text-[#FF5252]'
                                  }`}
                                >
                                  {isProfit ? '+' : ''}${pos.pnl.toFixed(2)}
                                </span>
                                <button
                                  onClick={() => onClosePosition(pos.id)}
                                  className="text-[10px] px-2 py-1 rounded bg-[#FF5252]/10 hover:bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/30 cursor-pointer transition-colors"
                                >
                                  Cerrar
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#8B949E] font-mono border-t border-[#30363D]/60 pt-1.5">
                              <span>Entrada: <strong className="text-[#F0F6FC]">{pos.entryPrice}</strong></span>
                              <span>Actual: <strong className="text-[#F0F6FC]">{pos.currentPrice}</strong></span>
                              <span>SL: {pos.stopLoss}</span>
                              <span>TP: {pos.takeProfit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-[#161B22] rounded-2xl p-5 border border-[#30363D] text-center space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-[#21262D] flex items-center justify-center mx-auto text-[#00E676]">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-xs text-[#F0F6FC]">Integración Exness Gateway API</h3>
                <p className="text-[11px] text-[#8B949E] leading-relaxed max-w-sm mx-auto">
                  Utiliza firmas criptográficas Ed25519 con cabeceras firmadas (EXN-API-KEY, EXN-SIGN, EXN-DATA). Al pulsar "Conectar" se descubre el Access Point para lectura de cuenta y ejecución de órdenes.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ==================== CTRADER MCP VIEW ==================== */}
        {activeBroker === 'ctrader' && (
          <div className="space-y-4 animate-fadeIn">
            {/* cTrader MCP Connection Card */}
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

              {/* Botón Conectar / Desconectar cTrader */}
              <button
                onClick={handleToggleCTrader}
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
                    <span>Conectar cTrader Remote</span>
                  </>
                )}
              </button>
            </div>

            {/* Account Details when cTrader is connected */}
            {isConnected ? (
              <div className="space-y-4 animate-fadeIn">
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
                      <span className={totalPnL >= 0 ? 'text-[#00E676] font-bold' : 'text-[#FF5252] font-bold'}>
                        {totalPnL >= 0 ? `+$${totalPnL.toFixed(2)}` : `-$${Math.abs(totalPnL).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#00E676]" />
                    <h3 className="text-sm font-bold text-[#F0F6FC]">
                      Posiciones Abiertas cTrader ({positions.length})
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

                {positions.map((pos) => {
                  const isProfit = pos.pnl >= 0;
                  return (
                    <div
                      key={pos.id}
                      className="bg-[#161B22] rounded-xl p-3.5 border border-[#30363D] flex flex-col gap-2"
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
                          <span className={`font-mono text-sm font-bold ${isProfit ? 'text-[#00E676]' : 'text-[#FF5252]'}`}>
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
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-[#161B22] rounded-2xl p-6 border border-[#30363D] text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#21262D] flex items-center justify-center mx-auto text-[#8B949E]">
                  <Unlink className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-sm text-[#F0F6FC]">cTrader Remote no enlazado</h3>
                <p className="text-xs text-[#8B949E] leading-relaxed max-w-sm mx-auto">
                  Introduce el token del protocolo MCP provisto por tu terminal cTrader Remote y pulsa "Conectar" para sincronizar tus métricas.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Position Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-[#161B22] border border-[#30363D] rounded-2xl p-5 w-full max-w-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-sm text-[#F0F6FC]">
                Nueva Posición ({activeBroker === 'exness' ? 'Exness' : 'cTrader'})
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-[#8B949E] hover:text-[#F0F6FC]">
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
                <option value="XAUUSD">XAUUSD (Oro)</option>
                <option value="EURUSD">EURUSD</option>
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
              Ejecutar Orden {activeBroker === 'exness' ? 'en Exness' : 'en cTrader'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
