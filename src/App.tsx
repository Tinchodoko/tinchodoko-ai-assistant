import React, { useState, useEffect } from 'react';
import {
  Key,
  Bot,
  CandlestickChart,
  History as HistoryIcon,
  Smartphone,
  Maximize2,
  FileCode,
  Wifi,
  BatteryCharging,
  Signal,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { ApisTab } from './components/tabs/ApisTab';
import { AssistantTab } from './components/tabs/AssistantTab';
import { CTraderTab } from './components/tabs/CTraderTab';
import { HistoryTab } from './components/tabs/HistoryTab';
import { FlutterCodeModal } from './components/FlutterCodeModal';
import {
  AI_PROVIDERS,
  TradeOperation,
  Position,
  calculateAccountEquity
} from './utils/tradeLogic';
import { ExnessCredentials } from './utils/clientExness';

export default function App() {
  // Navigation: 0 = APIs, 1 = Assistant, 2 = cTrader, 3 = Historial
  const [activeTab, setActiveTab] = useState<number>(1);
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(true);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState<boolean>(false);

  // Local clock for Android status bar
  const [currentTime, setCurrentTime] = useState<string>('09:41');
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      setCurrentTime(`${hrs}:${mins}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 10000);
    return () => clearInterval(interval);
  }, []);

  // API Keys (Persisted with flutter_secure_storage simulation)
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('tinchodoko_secure_api_keys');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return {
      groq: 'gsk_demo_quant_trader_key_892301982',
      gemini: 'AIzaSyDemo_Gemini25_Flash_LiveKey8823',
      claude: '',
      openai: '',
      openrouter: '',
      mistral: '',
    };
  });

  const handleSaveKeys = (newKeys: Record<string, string>) => {
    setApiKeys(newKeys);
    try {
      localStorage.setItem('tinchodoko_secure_api_keys', JSON.stringify(newKeys));
    } catch (e) {
      console.error(e);
    }
  };

  // Broker selection: 'exness' (Exness Trading Gateway API) or 'ctrader' (cTrader Remote MCP)
  const [activeBroker, setActiveBroker] = useState<'exness' | 'ctrader'>('exness');

  // Exness API Credentials & State
  const [exnessCreds, setExnessCreds] = useState<ExnessCredentials>(() => {
    try {
      const saved = localStorage.getItem('tinchodoko_exness_creds');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // ignore
    }
    return {
      apiKey: 'exnsk-live-trading-789234',
      privateKey: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      accountId: '123456',
      discoveryBaseUrl: 'https://gateway.example',
    };
  });
  const [isExnessConnected, setIsExnessConnected] = useState<boolean>(true);

  const handleUpdateExnessCreds = (newCreds: ExnessCredentials) => {
    setExnessCreds(newCreds);
    try {
      localStorage.setItem('tinchodoko_exness_creds', JSON.stringify(newCreds));
    } catch (e) {
      console.error(e);
    }
  };

  const handleExnessConnectToggle = () => {
    setIsExnessConnected((prev) => !prev);
  };

  // cTrader State
  const [isCTraderConnected, setIsCTraderConnected] = useState<boolean>(true);
  const [mcpToken, setMcpToken] = useState<string>('mcp-ctrader-live-token-849204918237');
  const [balance, setBalance] = useState<number>(12450.0);
  const [positions, setPositions] = useState<Position[]>([
    {
      id: 'POS-9021',
      pair: 'EURUSD',
      direction: 'BUY',
      lots: 0.5,
      entryPrice: 1.0842,
      currentPrice: 1.0864,
      pnl: 112.5,
      stopLoss: 1.081,
      takeProfit: 1.092,
      openTime: '10:15:20',
    },
    {
      id: 'POS-9022',
      pair: 'XAUUSD',
      direction: 'SELL',
      lots: 0.2,
      entryPrice: 2742.8,
      currentPrice: 2738.2,
      pnl: 92.0,
      stopLoss: 2755.0,
      takeProfit: 2715.0,
      openTime: '11:42:05',
    },
    {
      id: 'POS-9023',
      pair: 'BTCUSD',
      direction: 'BUY',
      lots: 0.1,
      entryPrice: 68450.0,
      currentPrice: 69120.0,
      pnl: 67.0,
      stopLoss: 67200.0,
      takeProfit: 71000.0,
      openTime: '12:05:18',
    },
  ]);

  // Real-time market tick jitter for open positions when connected
  useEffect(() => {
    if (!isCTraderConnected || positions.length === 0) return;
    const interval = setInterval(() => {
      setPositions((prev) =>
        prev.map((pos) => {
          const delta = (Math.random() - 0.48) * 0.8;
          const newPnl = Number((pos.pnl + delta).toFixed(2));
          const step = pos.pair === 'BTCUSD' ? 5 : pos.pair === 'XAUUSD' ? 0.2 : 0.0001;
          const newPrice = Number(
            (pos.currentPrice + (pos.direction === 'BUY' ? delta * step * 0.05 : -delta * step * 0.05)).toFixed(
              pos.pair === 'BTCUSD' ? 1 : 4
            )
          );
          return {
            ...pos,
            pnl: newPnl,
            currentPrice: newPrice,
          };
        })
      );
    }, 3500);
    return () => clearInterval(interval);
  }, [isCTraderConnected, positions.length]);

  const equity = calculateAccountEquity(balance, positions);

  const handleConnectToggle = (token: string) => {
    if (isCTraderConnected) {
      setIsCTraderConnected(false);
    } else {
      setMcpToken(token);
      setIsCTraderConnected(true);
    }
  };

  const handleClosePosition = (id: string) => {
    const target = positions.find((p) => p.id === id);
    if (target) {
      setBalance((prev) => Number((prev + target.pnl).toFixed(2)));
      setPositions((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleAddPosition = (pos: Position) => {
    setPositions((prev) => [pos, ...prev]);
  };

  // Historial State
  const [history, setHistory] = useState<TradeOperation[]>([
    {
      id: 'TRD-1049',
      date: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
      pair: 'EURUSD',
      direction: 'BUY',
      lots: 0.5,
      entryPrice: 1.0842,
      stopLoss: 1.081,
      takeProfit: 1.092,
      result: '+$142.50 (Ganancia)',
      pnl: 142.5,
      status: 'Confirmada',
      notes: 'Análisis institucional Gemini 2.5 Flash con ruptura de resistencia en 1.0850.',
    },
    {
      id: 'TRD-1048',
      date: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
      pair: 'XAUUSD',
      direction: 'SELL',
      lots: 0.2,
      entryPrice: 2742.8,
      stopLoss: 2755.0,
      takeProfit: 2715.0,
      result: 'Descartada por usuario',
      pnl: 0,
      status: 'Rechazada',
      notes: 'Descartada por alta volatilidad en comparecencia macroeconómica.',
    },
    {
      id: 'TRD-1047',
      date: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
      pair: 'BTCUSD',
      direction: 'BUY',
      lots: 0.1,
      entryPrice: 68450.0,
      stopLoss: 67200.0,
      takeProfit: 71000.0,
      result: '+$210.00 (TP Alcanzado)',
      pnl: 210.0,
      status: 'Confirmada',
      notes: 'Soporte institucional en $68,200 validado por Claude 3.5 Sonnet.',
    },
    {
      id: 'TRD-1046',
      date: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
      pair: 'GBPUSD',
      direction: 'SELL',
      lots: 0.3,
      entryPrice: 1.298,
      stopLoss: 1.302,
      takeProfit: 1.291,
      result: 'Descartada',
      pnl: 0,
      status: 'Rechazada',
      notes: 'Filtro de riesgo activado en el panel Assistant.',
    },
  ]);

  const handleRecordTrade = (op: TradeOperation) => {
    setHistory((prev) => [op, ...prev]);
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const handleExecuteTraderOrder = (
    pair: string,
    direction: 'BUY' | 'SELL',
    entry: number,
    sl: number,
    tp: number
  ) => {
    if (!isCTraderConnected) return;
    const newPos: Position = {
      id: `POS-${Math.floor(1000 + Math.random() * 9000)}`,
      pair,
      direction,
      lots: 0.2,
      entryPrice: entry,
      currentPrice: entry,
      pnl: 0,
      stopLoss: sl,
      takeProfit: tp,
      openTime: new Date().toLocaleTimeString(),
    };
    setPositions((prev) => [newPos, ...prev]);
  };

  return (
    <div className="min-h-screen bg-[#070A0D] text-[#F0F6FC] flex flex-col items-center justify-start p-2 sm:p-4 select-none font-sans">
      {/* Top AI Studio Header Control Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-2 px-3 mb-2 bg-[#161B22]/80 border border-[#30363D] rounded-xl backdrop-blur-md">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#00E676] flex items-center justify-center text-[#003915] font-black text-sm shadow-[0_0_10px_#00E676]">
            ⚡
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-[#F0F6FC] flex items-center gap-1.5">
              Tinchodoko AI Assistant
              <span className="text-[10px] bg-[#00E676]/20 text-[#00E676] font-mono px-1.5 py-0.5 rounded border border-[#00E676]/40">
                Flutter Android M3
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Frame Mode Switcher */}
          <button
            onClick={() => setIsPhoneFrame(!isPhoneFrame)}
            className="px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-xs text-[#F0F6FC] flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Alternar entre modo teléfono y vista completa"
          >
            {isPhoneFrame ? (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#00E676]" />
                <span className="hidden sm:inline">Pantalla Completa</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-[#00E676]" />
                <span className="hidden sm:inline">Vista Móvil</span>
              </>
            )}
          </button>

          {/* View Flutter Source Code & ZIP Export Button */}
          <button
            onClick={() => setIsCodeModalOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-[#00E676] hover:bg-[#00c864] text-[#003915] text-xs font-bold flex items-center gap-1.5 transition-all shadow-[0_2px_8px_rgba(0,230,118,0.2)] cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Código Flutter / ZIP</span>
          </button>
        </div>
      </header>

      {/* Main Container / Mobile Device Wrapper */}
      <main
        className={`w-full transition-all duration-300 flex items-center justify-center ${
          isPhoneFrame ? 'max-w-[430px] my-auto' : 'max-w-4xl h-[calc(100vh-80px)]'
        }`}
      >
        <div
          className={`w-full bg-[#0D1117] flex flex-col overflow-hidden relative ${
            isPhoneFrame
              ? 'h-[840px] rounded-[44px] border-[8px] border-[#21262D] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_20px_rgba(0,230,118,0.08)]'
              : 'h-full rounded-2xl border border-[#30363D] shadow-2xl'
          }`}
        >
          {/* Android Camera Punch-Hole & Speaker (in Phone Frame mode) */}
          {isPhoneFrame && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center">
              <div className="w-4 h-4 rounded-full bg-black border border-[#30363D]/40" />
            </div>
          )}

          {/* Android System Status Bar (MD3 dark) */}
          <div className="h-8 px-6 bg-[#161B22] border-b border-[#30363D]/50 flex items-center justify-between text-xs text-[#F0F6FC] font-medium z-40 select-none">
            <span className="font-semibold text-xs tracking-tight">{currentTime}</span>
            <div className="flex items-center space-x-2 text-[#8B949E]">
              <Signal className="w-3.5 h-3.5 text-[#F0F6FC]" />
              <Wifi className="w-3.5 h-3.5 text-[#F0F6FC]" />
              <div className="flex items-center space-x-0.5 text-[#00E676]">
                <span className="text-[10px] font-mono">98%</span>
                <BatteryCharging className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Android App Bar */}
          <div className="h-14 px-4 bg-[#161B22] border-b border-[#30363D] flex items-center justify-between z-30 shadow-sm">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#00E676]/15 border border-[#00E676]/30 flex items-center justify-center text-[#00E676]">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-[#F0F6FC] leading-none">
                  Tinchodoko AI Assistant
                </h2>
                <span className="text-[10px] text-[#8B949E]">Material Design 3</span>
              </div>
            </div>

            {/* Active Broker Connection Pill in AppBar */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                (activeBroker === 'exness' ? isExnessConnected : isCTraderConnected)
                  ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40'
                  : 'bg-[#21262D] text-[#8B949E] border-[#30363D]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  (activeBroker === 'exness' ? isExnessConnected : isCTraderConnected)
                    ? 'bg-[#00E676] animate-pulse'
                    : 'bg-[#FF5252]'
                }`}
              />
              <span>
                {activeBroker === 'exness'
                  ? isExnessConnected ? 'Exness Live' : 'Exness Off'
                  : isCTraderConnected ? 'cTrader Live' : 'cTrader Off'}
              </span>
            </div>
          </div>

          {/* Active Tab Screen Area */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 0 && (
              <ApisTab apiKeys={apiKeys} onSaveKeys={handleSaveKeys} />
            )}
            {activeTab === 1 && (
              <AssistantTab
                apiKeys={apiKeys}
                onTradeRecorded={handleRecordTrade}
                onExecuteCTrader={handleExecuteTraderOrder}
                isCTraderConnected={activeBroker === 'exness' ? isExnessConnected : isCTraderConnected}
                activeBroker={activeBroker}
              />
            )}
            {activeTab === 2 && (
              <CTraderTab
                activeBroker={activeBroker}
                onBrokerChange={setActiveBroker}
                isConnected={isCTraderConnected}
                mcpToken={mcpToken}
                balance={balance}
                equity={equity}
                positions={positions}
                onConnectToggle={handleConnectToggle}
                onClosePosition={handleClosePosition}
                onAddPosition={handleAddPosition}
                exnessCreds={exnessCreds}
                onUpdateExnessCreds={handleUpdateExnessCreds}
                isExnessConnected={isExnessConnected}
                onExnessConnectToggle={handleExnessConnectToggle}
              />
            )}
            {activeTab === 3 && (
              <HistoryTab history={history} onClearHistory={handleClearHistory} />
            )}
          </div>

          {/* Android Material Design 3 BottomNavigationBar (4 Tabs) */}
          <nav
            aria-label="Navegación principal"
            className="h-16 bg-[#161B22] border-t border-[#30363D] grid grid-cols-4 items-center px-1 z-30"
          >
            {/* Tab 1: APIs */}
            <button
              onClick={() => setActiveTab(0)}
              className={`flex flex-col items-center justify-center py-1 transition-all cursor-pointer group ${
                activeTab === 0 ? 'text-[#00E676]' : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <div
                className={`px-4 py-1 rounded-full transition-all flex items-center justify-center ${
                  activeTab === 0 ? 'bg-[#00E676]/20' : 'bg-transparent'
                }`}
              >
                <Key className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold mt-0.5">APIs</span>
            </button>

            {/* Tab 2: Assistant */}
            <button
              onClick={() => setActiveTab(1)}
              className={`flex flex-col items-center justify-center py-1 transition-all cursor-pointer group ${
                activeTab === 1 ? 'text-[#00E676]' : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <div
                className={`px-4 py-1 rounded-full transition-all flex items-center justify-center ${
                  activeTab === 1 ? 'bg-[#00E676]/20' : 'bg-transparent'
                }`}
              >
                <Bot className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold mt-0.5">Assistant</span>
            </button>

            {/* Tab 3: cTrader */}
            <button
              onClick={() => setActiveTab(2)}
              className={`flex flex-col items-center justify-center py-1 transition-all cursor-pointer group ${
                activeTab === 2 ? 'text-[#00E676]' : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <div
                className={`px-4 py-1 rounded-full transition-all flex items-center justify-center ${
                  activeTab === 2 ? 'bg-[#00E676]/20' : 'bg-transparent'
                }`}
              >
                <CandlestickChart className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-semibold mt-0.5">
                {activeBroker === 'exness' ? 'Exness' : 'cTrader'}
              </span>
            </button>

            {/* Tab 4: Historial */}
            <button
              onClick={() => setActiveTab(3)}
              className={`flex flex-col items-center justify-center py-1 transition-all cursor-pointer group ${
                activeTab === 3 ? 'text-[#00E676]' : 'text-[#8B949E] hover:text-[#F0F6FC]'
              }`}
            >
              <div
                className={`px-4 py-1 rounded-full transition-all flex items-center justify-center relative ${
                  activeTab === 3 ? 'bg-[#00E676]/20' : 'bg-transparent'
                }`}
              >
                <HistoryIcon className="w-5 h-5" />
                {history.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#00E676]" />
                )}
              </div>
              <span className="text-[11px] font-semibold mt-0.5">Historial</span>
            </button>
          </nav>

          {/* Android Gesture Bar at very bottom (in Phone Frame mode) */}
          {isPhoneFrame && (
            <div className="h-4 bg-[#161B22] flex items-center justify-center pb-1">
              <div className="w-32 h-1 bg-[#8B949E]/40 rounded-full" />
            </div>
          )}
        </div>
      </main>

      {/* Flutter Source Code Modal & Zip Downloader */}
      <FlutterCodeModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
      />
    </div>
  );
}
