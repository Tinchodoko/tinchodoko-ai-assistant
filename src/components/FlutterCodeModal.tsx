import React, { useState } from 'react';
import {
  FileCode,
  Download,
  Copy,
  Check,
  X,
  Folder,
  File,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import JSZip from 'jszip';
import { FLUTTER_PROJECT_FILES, FlutterFileItem } from '../data/flutterFiles';

interface FlutterCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FlutterCodeModal: React.FC<FlutterCodeModalProps> = ({ isOpen, onClose }) => {
  const [selectedFile, setSelectedFile] = useState<FlutterFileItem>(FLUTTER_PROJECT_FILES[0]);
  const [copied, setCopied] = useState<boolean>(false);
  const [isZipping, setIsZipping] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();

      // Add all project files into zip
      for (const item of FLUTTER_PROJECT_FILES) {
        zip.file(item.path, item.content);
      }

      // Add README and android configuration
      zip.file(
        'README.md',
        `# Tinchodoko AI Assistant — Android (Flutter)

Proyecto Flutter completo con Material Design 3 (tema oscuro verde y negro).

## 4 Pestañas:
1. APIs (Groq, Gemini, Claude, OpenAI, OpenRouter, Mistral) con flutter_secure_storage.
2. Assistant (dropdowns de API y modelos, prompt, Analizar, respuesta scrolleable y confirmación/rechazo).
3. cTrader (Token Remote MCP, estado de conexión, balance, equity y posiciones abiertas).
4. Historial (operaciones con fecha, par, dirección, resultado y confirmación).

## Ejecución en Android:
flutter pub get
flutter run
`
      );

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'tinchodoko_ai_assistant_flutter.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to create zip:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 animate-fadeIn">
      <div className="bg-[#0D1117] border border-[#30363D] rounded-2xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#30363D] bg-[#161B22] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-[#00E676]/10 border border-[#00E676]/20 flex items-center justify-center text-[#00E676]">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm md:text-base text-[#F0F6FC] flex items-center gap-2">
                Código Fuente del Proyecto Flutter
                <span className="text-[10px] font-mono bg-[#00E676]/15 text-[#00E676] px-2 py-0.5 rounded-full border border-[#00E676]/30">
                  Android / Dart
                </span>
              </h3>
              <p className="text-xs text-[#8B949E]">
                Estructura limpia, Material Design 3, tema verde y negro
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download ZIP Button */}
            <button
              onClick={handleDownloadZip}
              disabled={isZipping}
              className="px-3.5 py-1.5 rounded-xl bg-[#00E676] hover:bg-[#00c864] text-[#003915] font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-[0_2px_10px_rgba(0,230,118,0.2)] disabled:opacity-50"
            >
              {isZipping ? (
                <div className="w-3.5 h-3.5 border-2 border-[#003915] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isZipping ? 'Comprimiendo...' : 'Descargar Proyecto (.ZIP)'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Sidebar Files Tree + Code Editor */}
        <div className="flex-1 flex overflow-hidden">
          {/* File Explorer Tree */}
          <div className="w-64 border-r border-[#30363D] bg-[#161B22]/50 overflow-y-auto p-3 space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8B949E] px-2 py-1 mb-1">
              Archivos Flutter
            </div>

            {FLUTTER_PROJECT_FILES.map((file) => {
              const isSelected = selectedFile.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-mono flex items-center gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#00E676]/15 text-[#00E676] font-semibold border border-[#00E676]/30'
                      : 'text-[#8B949E] hover:text-[#F0F6FC] hover:bg-[#21262D]'
                  }`}
                >
                  <File className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{file.path}</span>
                </button>
              );
            })}
          </div>

          {/* Code Viewer */}
          <div className="flex-1 flex flex-col bg-[#0D1117] overflow-hidden">
            {/* Viewer Header */}
            <div className="px-4 py-2 border-b border-[#30363D] bg-[#161B22]/80 flex items-center justify-between text-xs">
              <span className="font-mono text-[#F0F6FC] font-semibold">{selectedFile.path}</span>
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 rounded bg-[#21262D] hover:bg-[#30363D] border border-[#30363D] text-[#8B949E] hover:text-[#00E676] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#00E676]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>

            {/* Code Content */}
            <div className="flex-1 overflow-auto p-4 font-mono text-xs text-[#E6EDF3] leading-relaxed select-text whitespace-pre">
              {selectedFile.content}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
