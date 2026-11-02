import React, { useState } from 'react';
import {
  History,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  XCircle,
  Search,
  Trash2,
  Calendar,
  Filter
} from 'lucide-react';
import { TradeOperation } from '../../utils/tradeLogic';

interface HistoryTabProps {
  history: TradeOperation[];
  onClearHistory: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({ history, onClearHistory }) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'CONFIRMED' | 'REJECTED'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredHistory = history.filter((item) => {
    if (filterStatus === 'CONFIRMED' && item.status !== 'Confirmada') return false;
    if (filterStatus === 'REJECTED' && item.status !== 'Rechazada') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.pair.toLowerCase().includes(q) ||
        item.direction.toLowerCase().includes(q) ||
        (item.notes && item.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const confirmedCount = history.filter((h) => h.status === 'Confirmada').length;
  const rejectedCount = history.filter((h) => h.status === 'Rechazada').length;

  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-[#F0F6FC] select-none">
      {/* Top Banner */}
      <div className="p-4 border-b border-[#30363D] bg-[#161B22]/90 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#00E676]/10 border border-[#00E676]/20 flex items-center justify-center text-[#00E676]">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F0F6FC]">Historial de Operaciones</h2>
            <p className="text-xs text-[#8B949E]">
              Auditoría de señales confirmadas y rechazadas
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('¿Deseas vaciar el historial de operaciones?')) {
                onClearHistory();
              }
            }}
            className="text-xs p-2 rounded-lg bg-[#21262D] hover:bg-[#FF5252]/20 border border-[#30363D] text-[#8B949E] hover:text-[#FF5252] transition-colors cursor-pointer"
            title="Limpiar Historial"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-[#30363D] bg-[#161B22] space-y-3">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8B949E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por par (EURUSD, XAUUSD)..."
            className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] rounded-xl pl-9 pr-3 py-2 text-xs text-[#F0F6FC] placeholder-[#8B949E] outline-none"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer ${
              filterStatus === 'ALL'
                ? 'bg-[#00E676] border-[#00E676] text-[#003915]'
                : 'bg-[#21262D] border-[#30363D] text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            Todos ({history.length})
          </button>
          <button
            onClick={() => setFilterStatus('CONFIRMED')}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              filterStatus === 'CONFIRMED'
                ? 'bg-[#00E676] border-[#00E676] text-[#003915]'
                : 'bg-[#21262D] border-[#30363D] text-[#8B949E] hover:text-[#00E676]'
            }`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span>Confirmadas ({confirmedCount})</span>
          </button>
          <button
            onClick={() => setFilterStatus('REJECTED')}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              filterStatus === 'REJECTED'
                ? 'bg-[#FF5252] border-[#FF5252] text-white'
                : 'bg-[#21262D] border-[#30363D] text-[#8B949E] hover:text-[#FF5252]'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rechazadas ({rejectedCount})</span>
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="p-8 text-center bg-[#161B22] rounded-2xl border border-[#30363D] my-auto">
            <History className="w-10 h-10 text-[#8B949E]/40 mx-auto mb-2" />
            <p className="text-sm font-semibold text-[#8B949E]">No hay operaciones registradas.</p>
            <p className="text-xs text-[#8B949E]/70 mt-1">
              Usa el Asistente IA para generar análisis y confirmar o rechazar trades.
            </p>
          </div>
        ) : (
          filteredHistory.map((item) => {
            const isConfirmed = item.status === 'Confirmada';
            const formattedDate = new Date(item.date).toLocaleString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={item.id}
                className="bg-[#161B22] rounded-xl p-3.5 border border-[#30363D] hover:border-[#30363D]/80 transition-all shadow-sm space-y-2.5"
              >
                {/* Top Row: Direction, Pair, and User Status Pill */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 ${
                        item.direction === 'BUY'
                          ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30'
                          : 'bg-[#FF5252]/15 text-[#FF5252] border border-[#FF5252]/30'
                      }`}
                    >
                      {item.direction === 'BUY' ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {item.direction}
                    </span>
                    <span className="font-bold text-sm text-[#F0F6FC]">{item.pair}</span>
                    <span className="text-[11px] text-[#8B949E] font-mono">{item.lots} lotes</span>
                  </div>

                  {/* Estado: Confirmada / Rechazada */}
                  <div
                    className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      isConfirmed
                        ? 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/30'
                        : 'bg-[#FF5252]/10 text-[#FF5252] border-[#FF5252]/30'
                    }`}
                  >
                    {isConfirmed ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-[#00E676]" />
                        <span>Confirmada</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3 text-[#FF5252]" />
                        <span>Rechazada</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Second Row: Resultado y Fecha */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-[#30363D]/60">
                  <div>
                    <span className="text-[10px] text-[#8B949E] block">Resultado</span>
                    <span
                      className={`font-mono font-bold ${
                        isConfirmed ? 'text-[#00E676]' : 'text-[#8B949E]'
                      }`}
                    >
                      {item.result}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-[#8B949E] block">Fecha y Hora</span>
                    <span className="text-[11px] text-[#8B949E] flex items-center gap-1 justify-end font-mono">
                      <Calendar className="w-3 h-3" />
                      {formattedDate}
                    </span>
                  </div>
                </div>

                {/* Notes or rationale if present */}
                {item.notes && (
                  <div className="text-[11px] text-[#8B949E] bg-[#21262D] rounded-lg p-2 leading-relaxed">
                    {item.notes}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
