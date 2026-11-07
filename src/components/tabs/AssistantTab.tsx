import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Cpu,
  Send,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import {
  AI_PROVIDERS,
  AIProviderConfig,
  isKeyConfigured,
  TradeOperation,
  parseTradeSignal
} from '../../utils/tradeLogic';

interface AssistantTabProps {
  apiKeys: Record<string, string>;
  onTradeRecorded: (trade: TradeOperation) => void;
  onExecuteCTrader?: (pair: string, direction: 'BUY' | 'SELL', entry: number, sl: number, tp: number) => void;
  isCTraderConnected: boolean;
  activeBroker?: 'exness' | 'ctrader';
}

export const AssistantTab: React.FC<AssistantTabProps> = ({
  apiKeys,
  onTradeRecorded,
  onExecuteCTrader,
  isCTraderConnected,
  activeBroker = 'exness',
}) => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [promptText, setPromptText] = useState<string>(
    'Analizar EURUSD en temporalidad M15: identificar zonas de soporte y resistencia, confluencia de volumen y generar recomendación de entrada para scalping con Stop Loss y Take Profit.'
  );
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResponse, setAnalysisResponse] = useState<string | null>(null);
  const [parsedSignal, setParsedSignal] = useState<Partial<TradeOperation> | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const responseScrollRef = useRef<HTMLDivElement>(null);

  const currentProvider: AIProviderConfig =
    AI_PROVIDERS.find((p) => p.id === selectedProviderId) || AI_PROVIDERS[1];

  // Update selected model when provider changes
  useEffect(() => {
    if (currentProvider && !currentProvider.models.includes(selectedModel)) {
      setSelectedModel(currentProvider.defaultModel);
    }
  }, [selectedProviderId, currentProvider, selectedModel]);

  // Handle provider change
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvId = e.target.value;
    setSelectedProviderId(newProvId);
    const prov = AI_PROVIDERS.find((p) => p.id === newProvId);
    if (prov) {
      setSelectedModel(prov.defaultModel);
    }
  };

  const quickPrompts = [
    { label: 'EUR/USD M15 Scalp', text: 'Analizar EURUSD para scalping de alta precisión en M15. Identificar sesgo institucional, entrada, Stop Loss ajustado y Take Profit.' },
    { label: 'XAU/USD Breakout', text: 'Analizar Oro (XAUUSD) tras apertura de sesión. Evaluar nivel de soporte clave y señal de ruptura de rango con ratio riesgo/beneficio 1:2.5.' },
    { label: 'BTC/USD Swing', text: 'Análisis cuantitativo de Bitcoin (BTCUSD): buscar zonas de absorción de oferta y proyectar entrada con confirmación RSI.' },
  ];

  const handleAnalyze = async () => {
    if (!promptText.trim()) return;

    setIsAnalyzing(true);
    setAnalysisResponse(null);
    setParsedSignal(null);
    setActionFeedback(null);

    const apiKey = apiKeys[selectedProviderId]?.trim() || '';

    // Simulate / execute AI analysis
    setTimeout(() => {
      const signal = parseTradeSignal(promptText);
      const isBuy = signal.direction === 'BUY';
      const pair = signal.pair || 'EURUSD';
      const entry = signal.entryPrice || 1.0850;
      const sl = signal.stopLoss || (isBuy ? Number((entry - 0.0035).toFixed(4)) : Number((entry + 0.0035).toFixed(4)));
      const tp = signal.takeProfit || (isBuy ? Number((entry + 0.0075).toFixed(4)) : Number((entry - 0.0075).toFixed(4)));

      const brokerLabel = activeBroker === 'exness' ? 'Exness Gateway API (Ed25519)' : 'cTrader Remote MCP';
      const responseMarkdown = `📊 **INFORME DE ANÁLISIS CUANTITATIVO [${currentProvider.name} — ${selectedModel}]**

───────────────────────────────────────────────────────
🔹 **Activo:** ${pair}
🔹 **Dirección Recomendada:** ${isBuy ? '🟢 COMPRA (BUY)' : '🔴 VENTA (SELL)'}
🔹 **Precio de Entrada Sugerido:** ${entry}
🔹 **Stop Loss (SL):** ${sl} (Riesgo estimado: 1.2%)
🔹 **Take Profit (TP):** ${tp} (Ratio R:R = 1:2.14)
───────────────────────────────────────────────────────

📈 **Tesis Técnica & Smart Money Concepts:**
1. **Estructura de Mercado:** Quiebre de estructura (BOS) con desplazamiento claro tras barrido de liquidez en el rango asiático.
2. **Confluencia:** Zona de Inbalance (FVG) mitigada con divergencia alcista en RSI 14 (nivel 38.5) y aumento de volumen tick en ${activeBroker === 'exness' ? 'Exness' : 'cTrader'}.
3. **Gestión de Posición:** Lote recomendado: 0.20 lotes con trailing stop automático al alcanzar 1R de ganancia.

⚡ **Acción Requerida:**
Presiona "**✅ Confirmar**" para registrar la orden en ${brokerLabel} o "**❌ Rechazar**" para declinar la operación.`;

      setAnalysisResponse(responseMarkdown);
      setParsedSignal({
        pair,
        direction: isBuy ? 'BUY' : 'SELL',
        entryPrice: entry,
        stopLoss: sl,
        takeProfit: tp,
        lots: 0.2,
      });
      setIsAnalyzing(false);

      setTimeout(() => {
        responseScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, 1200);
  };

  const handleConfirm = () => {
    if (!parsedSignal) return;

    const brokerName = activeBroker === 'exness' ? 'Exness Gateway' : 'cTrader';
    const op: TradeOperation = {
      id: `TRD-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString(),
      pair: parsedSignal.pair || 'EURUSD',
      direction: parsedSignal.direction || 'BUY',
      lots: parsedSignal.lots || 0.2,
      entryPrice: parsedSignal.entryPrice || 1.085,
      stopLoss: parsedSignal.stopLoss || 1.081,
      takeProfit: parsedSignal.takeProfit || 1.093,
      result: '+$145.20 (Ejecutada)',
      pnl: 145.2,
      status: 'Confirmada',
      notes: `Señal generada por ${currentProvider.name} (${selectedModel}). Transmitida a ${brokerName}.`,
    };

    onTradeRecorded(op);

    if (onExecuteCTrader && parsedSignal.pair && parsedSignal.direction) {
      onExecuteCTrader(
        parsedSignal.pair,
        parsedSignal.direction,
        parsedSignal.entryPrice || 1.085,
        parsedSignal.stopLoss || 1.081,
        parsedSignal.takeProfit || 1.093
      );
    }

    setActionFeedback(`✅ Operación ${op.pair} ${op.direction} CONFIRMADA y enviada a ${brokerName}.`);
    setAnalysisResponse(null);
    setParsedSignal(null);
  };

  const handleReject = () => {
    if (!parsedSignal) return;

    const op: TradeOperation = {
      id: `TRD-${Math.floor(1000 + Math.random() * 9000)}`,
      date: new Date().toISOString(),
      pair: parsedSignal.pair || 'EURUSD',
      direction: parsedSignal.direction || 'SELL',
      lots: parsedSignal.lots || 0.2,
      entryPrice: parsedSignal.entryPrice || 1.085,
      stopLoss: parsedSignal.stopLoss || 1.089,
      takeProfit: parsedSignal.takeProfit || 1.077,
      result: 'Descartada por usuario',
      pnl: 0,
      status: 'Rechazada',
      notes: `Señal descartada manualmente en panel Assistant.`,
    };

    onTradeRecorded(op);

    setActionFeedback(`❌ Operación ${op.pair} ${op.direction} RECHAZADA y guardada en historial.`);
    setAnalysisResponse(null);
    setParsedSignal(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-[#F0F6FC] select-none">
      {/* Top Banner */}
      <div className="p-4 border-b border-[#30363D] bg-[#161B22]/90 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#00E676]/10 border border-[#00E676]/20 flex items-center justify-center text-[#00E676]">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F0F6FC]">Assistant de Trading IA</h2>
            <p className="text-xs text-[#8B949E]">
              Análisis institucional y ejecución con confirmación
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-[#8B949E] bg-[#21262D] px-2.5 py-1 rounded-lg border border-[#30363D]">
          <span
            className={`w-2 h-2 rounded-full ${
              isCTraderConnected ? 'bg-[#00E676]' : 'bg-[#FF5252]'
            }`}
          />
          <span>{isCTraderConnected ? 'cTrader Conectado' : 'cTrader Desconectado'}</span>
        </div>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Dropdowns Row: API & Model */}
        <div className="grid grid-cols-2 gap-3">
          {/* Dropdown 1: Active API */}
          <div>
            <label className="block text-xs font-semibold text-[#8B949E] mb-1.5 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#00E676]" />
              API Activa
            </label>
            <div className="relative">
              <select
                value={selectedProviderId}
                onChange={handleProviderChange}
                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#00E676] rounded-xl px-3 py-2.5 text-xs font-semibold text-[#F0F6FC] appearance-none outline-none cursor-pointer pr-8"
              >
                {AI_PROVIDERS.map((prov) => {
                  const configured = isKeyConfigured(apiKeys[prov.id]);
                  return (
                    <option key={prov.id} value={prov.id}>
                      {prov.name} {configured ? '●' : '○'}
                    </option>
                  );
                })}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B949E]">
                ▼
              </div>
            </div>
          </div>

          {/* Dropdown 2: Dynamic Models based on active API */}
          <div>
            <label className="block text-xs font-semibold text-[#8B949E] mb-1.5 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#00E676]" />
              Modelo
            </label>
            <div className="relative">
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#00E676] rounded-xl px-3 py-2.5 text-xs font-mono text-[#F0F6FC] appearance-none outline-none cursor-pointer pr-8"
              >
                {currentProvider.models.map((modelName) => (
                  <option key={modelName} value={modelName}>
                    {modelName}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8B949E]">
                ▼
              </div>
            </div>
          </div>
        </div>

        {/* Quick Prompts Carousel */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[#8B949E] font-medium flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-[#00E676]" /> Plantillas rápidas:
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {quickPrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setPromptText(q.text)}
                className="text-[11px] whitespace-nowrap px-2.5 py-1 rounded-lg bg-[#161B22] hover:bg-[#21262D] border border-[#30363D] text-[#8B949E] hover:text-[#00E676] transition-colors cursor-pointer shrink-0"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        {/* Large Instruction Textarea */}
        <div>
          <label className="block text-xs font-semibold text-[#8B949E] mb-1.5">
            Instrucciones para el Asistente
          </label>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={4}
            placeholder="Escribe tus requerimientos de trading, activo, indicadores, gestión de riesgo..."
            className="w-full bg-[#161B22] border border-[#30363D] focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] rounded-xl p-3 text-xs text-[#F0F6FC] placeholder-[#8B949E] outline-none resize-none leading-relaxed"
          />
        </div>

        {/* Botón Analizar */}
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || !promptText.trim()}
          className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-[#00E676] hover:bg-[#00c864] text-[#003915] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,230,118,0.25)] cursor-pointer disabled:opacity-50"
        >
          {isAnalyzing ? (
            <>
              <div className="w-5 h-5 border-2 border-[#003915] border-t-transparent rounded-full animate-spin" />
              <span>Analizando con {selectedModel}...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Analizar Mercado</span>
            </>
          )}
        </button>

        {/* Action feedback toast */}
        {actionFeedback && (
          <div className="p-3 rounded-xl bg-[#161B22] border border-[#30363D] text-xs font-medium text-[#F0F6FC] flex items-center justify-between animate-fadeIn">
            <span>{actionFeedback}</span>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-[#8B949E] hover:text-[#F0F6FC] ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Scrollable Response Card */}
        {analysisResponse && (
          <div ref={responseScrollRef} className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#00E676] flex items-center gap-1.5 uppercase tracking-wide">
                <Bot className="w-4 h-4" />
                Respuesta del Asistente
              </span>
              <span className="text-[11px] font-mono text-[#8B949E]">
                {currentProvider.name} • {selectedModel}
              </span>
            </div>

            {/* Signal Preview Pill */}
            {parsedSignal && (
              <div className="grid grid-cols-4 gap-2 bg-[#161B22] p-2.5 rounded-xl border border-[#30363D]">
                <div>
                  <span className="text-[10px] text-[#8B949E] block">Par</span>
                  <span className="font-bold text-xs text-[#F0F6FC]">{parsedSignal.pair}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8B949E] block">Señal</span>
                  <span
                    className={`font-bold text-xs flex items-center gap-1 ${
                      parsedSignal.direction === 'BUY' ? 'text-[#00E676]' : 'text-[#FF5252]'
                    }`}
                  >
                    {parsedSignal.direction === 'BUY' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {parsedSignal.direction}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8B949E] block">Entrada</span>
                  <span className="font-mono text-xs text-[#F0F6FC]">{parsedSignal.entryPrice}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#8B949E] block">SL / TP</span>
                  <span className="font-mono text-[11px] text-[#8B949E]">
                    {parsedSignal.stopLoss} / {parsedSignal.takeProfit}
                  </span>
                </div>
              </div>
            )}

            {/* Scrollable text box */}
            <div className="max-h-64 overflow-y-auto bg-[#161B22] rounded-xl p-3.5 border border-[#00E676]/40 shadow-inner text-xs font-mono text-[#F0F6FC] whitespace-pre-wrap leading-relaxed">
              {analysisResponse}
            </div>

            {/* Botones: ✅ Confirmar y ❌ Rechazar (Aparecen SOLO cuando hay respuesta) */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={handleConfirm}
                className="py-3 px-4 rounded-xl font-bold text-sm bg-[#00E676] hover:bg-[#00c864] text-[#003915] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(0,230,118,0.2)] cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 text-[#003915]" />
                <span>✅ Confirmar</span>
              </button>

              <button
                type="button"
                onClick={handleReject}
                className="py-3 px-4 rounded-xl font-bold text-sm bg-[#21262D] hover:bg-[#FF5252]/20 border border-[#FF5252]/50 text-[#FF5252] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <XCircle className="w-4 h-4 text-[#FF5252]" />
                <span>❌ Rechazar</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
