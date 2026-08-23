import React, { useState, useEffect } from 'react';
import { Sparkles, Download, RefreshCw, X, CheckCircle2, AlertCircle, ArrowUpCircle } from 'lucide-react';
import { checkForAppUpdates, installAndRestartApp, UpdateStatus } from '../../core/updater/updaterService';

function parseReleaseHighlights(body?: string): string[] {
  if (!body) {
    return [
      'Backup físico completo e salvaguarda por e-mail',
      'Auditoria e histórico de estoque nas vendas',
      'Livro Razão com produtos em destaque',
      'Fechamento automático de caixa silencioso'
    ];
  }

  const lines = body
    .split(/[\r\n]+/)
    .map((l) => l.trim().replace(/^[-*•]\s*/, '').replace(/^feat(\([^)]+\))?:\s*/i, '').replace(/^fix(\([^)]+\))?:\s*/i, ''))
    .filter((l) => l.length > 4 && !l.toLowerCase().includes('atualização automática'));

  if (lines.length === 0) {
    return [
      'Backup físico completo e salvaguarda por e-mail',
      'Auditoria e histórico de estoque nas vendas',
      'Livro Razão com produtos em destaque',
      'Fechamento automático de caixa silencioso'
    ];
  }

  return lines.slice(0, 4);
}

export function AutoUpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'IDLE' });
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // 1. Checagem inicial 4 segundos após abrir o sistema
    const initialTimer = setTimeout(() => {
      checkSilently();
    }, 4000);

    // 2. Checagem periódica a cada 45 minutos em segundo plano
    const periodicInterval = setInterval(() => {
      checkSilently();
    }, 45 * 60 * 1000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(periodicInterval);
    };
  }, []);

  const checkSilently = async () => {
    try {
      const status = await checkForAppUpdates();
      if (status.state === 'AVAILABLE') {
        setUpdateStatus(status);
        setIsDismissed(false); // Reabre o aviso se houver nova versão
      }
    } catch (_) {}
  };

  const handleStartUpdate = async () => {
    setIsInstalling(true);
    await installAndRestartApp((status) => {
      setUpdateStatus(status);
    });
  };

  // Se não houver atualização disponível ou se o usuário minimizou temporariamente
  if (isDismissed || updateStatus.state === 'IDLE' || updateStatus.state === 'CHECKING' || updateStatus.state === 'UP_TO_DATE') {
    return null;
  }

  const percent = updateStatus.totalBytes && updateStatus.downloadedBytes 
    ? Math.min(100, Math.round((updateStatus.downloadedBytes / updateStatus.totalBytes) * 100))
    : 0;

  const downloadedMB = ((updateStatus.downloadedBytes || 0) / (1024 * 1024)).toFixed(1);
  const totalMB = ((updateStatus.totalBytes || 0) / (1024 * 1024)).toFixed(1);
  const highlights = parseReleaseHighlights(updateStatus.body);

  return (
    <aside aria-label="Notificação de Atualização" className="fixed bottom-6 right-6 z-50 max-w-md w-full animate-slide-up shadow-2xl rounded-2xl border border-emerald-500/40 bg-slate-900/95 backdrop-blur-md text-white p-5 select-none font-sans overflow-hidden">
      {/* GLOW DECORATIVO DE FUNDO */}
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-emerald-500/25 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-3.5">
        {/* CABEÇALHO */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-950/60 shrink-0">
              <ArrowUpCircle className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">Nova Versão Disponível</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  v{updateStatus.version}
                </span>
              </div>
              <h4 className="text-sm font-bold text-slate-100 mt-0.5">Atualização Pronta para Instalar</h4>
            </div>
          </div>

          {!isInstalling && (
            <button
              onClick={() => setIsDismissed(true)}
              title="Lembrar mais tarde"
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* CORPO: DESTAQUES DA VERSÃO */}
        {updateStatus.state === 'AVAILABLE' && (
          <div className="space-y-3">
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide flex items-center space-x-1">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                <span>O que há de novo nesta versão:</span>
              </p>
              <ul className="space-y-1 text-xs text-slate-200">
                {highlights.map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="leading-tight">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <button
                onClick={handleStartUpdate}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-center space-x-2 transition-all active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>Atualizar e Reiniciar Agora</span>
              </button>

              <button
                onClick={() => setIsDismissed(true)}
                className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors font-medium"
              >
                Depois
              </button>
            </div>
          </div>
        )}

        {/* ESTADO: BAIXANDO */}
        {updateStatus.state === 'DOWNLOADING' && (
          <div className="space-y-2 pt-1">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>Baixando atualização com segurança...</span>
              </span>
              <span className="font-mono text-emerald-400 font-bold">{percent}%</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden border border-slate-700">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300 rounded-full"
                style={{ width: `${percent}%` }}
              />
            </div>

            <p className="text-[11px] text-slate-400 text-right font-mono">
              {downloadedMB} MB / {totalMB} MB
            </p>
          </div>
        )}

        {/* ESTADO: PRONTO PARA REINICIAR */}
        {updateStatus.state === 'DOWNLOADED' && (
          <div className="flex items-center space-x-2 text-xs text-emerald-300 font-semibold bg-emerald-950/60 p-3 rounded-xl border border-emerald-800 animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Download concluído! Reiniciando o sistema agora...</span>
          </div>
        )}

        {/* ESTADO: ERRO */}
        {updateStatus.state === 'ERROR' && (
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs text-red-400 bg-red-950/50 p-2.5 rounded-xl border border-red-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{updateStatus.error || 'Falha ao atualizar.'}</span>
            </div>
            <button
              onClick={() => setUpdateStatus({ state: 'AVAILABLE', version: updateStatus.version })}
              className="text-xs text-emerald-400 hover:underline font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
