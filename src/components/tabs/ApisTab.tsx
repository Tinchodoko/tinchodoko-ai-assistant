import React, { useState } from 'react';
import { Key, Eye, EyeOff, CheckCircle2, XCircle, Save, Sparkles, ShieldCheck } from 'lucide-react';
import { AI_PROVIDERS, isKeyConfigured } from '../../utils/tradeLogic';

interface ApisTabProps {
  apiKeys: Record<string, string>;
  onSaveKeys: (newKeys: Record<string, string>) => void;
}

export const ApisTab: React.FC<ApisTabProps> = ({ apiKeys, onSaveKeys }) => {
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({ ...apiKeys });
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleKeyChange = (providerId: string, value: string) => {
    setDraftKeys(prev => ({
      ...prev,
      [providerId]: value
    }));
  };

  const toggleShowKey = (providerId: string) => {
    setShowKeyMap(prev => ({
      ...prev,
      [providerId]: !prev[providerId]
    }));
  };

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onSaveKeys(draftKeys);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 600);
  };

  const handleDemoFill = () => {
    const demo = {
      groq: 'gsk_demo_quant_trader_key_892301982',
      gemini: 'AIzaSyDemo_Gemini25_Flash_LiveKey8823',
      claude: 'sk-ant-api03-demo-sonnet-model-key-7729',
      openai: 'sk-proj-demo-openai-gpt4o-trade-key-551',
      openrouter: 'sk-or-v1-demo-openrouter-router-key-991',
      mistral: 'mistral_demo_large2_production_key_331',
    };
    setDraftKeys(demo);
  };

  return (
    <div className="flex flex-col h-full bg-[#0D1117] text-[#F0F6FC] select-none">
      {/* Top Banner / Info */}
      <div className="p-4 border-b border-[#30363D] bg-[#161B22]/90 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-[#00E676]/10 border border-[#00E676]/20 flex items-center justify-center text-[#00E676]">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#F0F6FC]">Proveedores de IA</h2>
            <p className="text-xs text-[#8B949E] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00E676]" />
              Persistencia segura (flutter_secure_storage)
            </p>
          </div>
        </div>

        <button
          onClick={handleDemoFill}
          className="text-xs px-2.5 py-1.5 rounded-lg bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#00E676] flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Rellenar todas las APIs con claves de prueba válidas"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Demo Keys</span>
        </button>
      </div>

      {/* Provider List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {AI_PROVIDERS.map((provider) => {
          const currentVal = draftKeys[provider.id] || '';
          const configured = isKeyConfigured(currentVal);
          const showKey = !!showKeyMap[provider.id];

          return (
            <div
              key={provider.id}
              className="bg-[#161B22] rounded-xl p-3.5 border border-[#30363D] hover:border-[#30363D]/80 transition-all shadow-sm"
            >
              {/* Header: Name + Green/Red Indicator */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-2.5 h-2.5 rounded-full transition-colors ${
                      configured
                        ? 'bg-[#00E676] shadow-[0_0_8px_#00E676]'
                        : 'bg-[#FF5252] shadow-[0_0_8px_#FF5252]'
                    }`}
                  />
                  <span className="font-bold text-sm tracking-wide text-[#F0F6FC]">
                    {provider.name}
                  </span>
                  <span className="text-[10px] text-[#8B949E] font-mono bg-[#21262D] px-1.5 py-0.5 rounded">
                    {provider.defaultModel}
                  </span>
                </div>

                {/* Visual badge: Configurada / No configurada */}
                <div
                  className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                    configured
                      ? 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/30'
                      : 'bg-[#FF5252]/10 text-[#FF5252] border-[#FF5252]/30'
                  }`}
                >
                  {configured ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-[#00E676]" />
                      <span>Configurada</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-[#FF5252]" />
                      <span>No configurada</span>
                    </>
                  )}
                </div>
              </div>

              {/* Text Input with Obscure / Show Toggle */}
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={currentVal}
                  onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                  placeholder={`Ingresa API Key (${provider.keyPrefix || provider.name + '...'})`}
                  className="w-full bg-[#21262D] border border-[#30363D] focus:border-[#00E676] focus:ring-1 focus:ring-[#00E676] rounded-lg px-3 py-2 pr-10 text-xs font-mono text-[#F0F6FC] placeholder-[#8B949E] transition-all outline-none"
                />
                <button
                  type="button"
                  onClick={() => toggleShowKey(provider.id)}
                  className="absolute right-2.5 text-[#8B949E] hover:text-[#F0F6FC] transition-colors p-1"
                  aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global Save Button */}
      <div className="p-4 border-t border-[#30363D] bg-[#161B22] flex flex-col gap-2">
        {saveSuccess && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-[#00E676]/15 border border-[#00E676]/40 text-[#00E676] text-xs font-medium animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>API Keys persistidas exitosamente con flutter_secure_storage.</span>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-[#00E676] hover:bg-[#00c864] text-[#003915] active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,230,118,0.25)] cursor-pointer disabled:opacity-60"
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-[#003915] border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Guardar Todo</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
