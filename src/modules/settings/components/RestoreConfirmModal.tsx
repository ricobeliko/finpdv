import React, { useState } from 'react';
import { X, AlertTriangle, Database, ShieldAlert, Check } from 'lucide-react';
import { BackupRecord } from '../types';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';

interface RestoreConfirmModalProps {
  isOpen: boolean;
  backup: BackupRecord | null;
  onClose: () => void;
  onConfirm: () => void;
  isRestoring: boolean;
}

export function RestoreConfirmModal({
  isOpen,
  backup,
  onClose,
  onConfirm,
  isRestoring,
}: RestoreConfirmModalProps) {
  if (!isOpen || !backup) return null;

  const [confirmationWord, setConfirmationWord] = useState('');
  const isConfirmed = confirmationWord.trim().toUpperCase() === 'RESTAURAR';
  const trapRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: !isRestoring ? onClose : undefined,
  });

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div ref={trapRef} className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-red-200 overflow-hidden">
        <div className="bg-red-50 px-6 py-4 border-b border-red-200 flex items-center justify-between">
          <h3 className="font-bold text-danger text-base flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-danger" />
            <span>Restauração Crítica de Banco</span>
          </h3>
          <button onClick={onClose} disabled={isRestoring} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Atenção: Os dados atuais serão sobrescritos!</p>
              <p className="mt-0.5 text-slate-700">
                Ao restaurar a cópia de <strong>{backup.createdAt}</strong>, qualquer venda ou produto cadastrado após este horário será substituído pelo conteúdo do backup.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-xs space-y-1">
            <div className="flex justify-between text-textMuted"><span>Arquivo:</span><span className="font-bold text-slate-800">{backup.filename}</span></div>
            <div className="flex justify-between text-textMuted"><span>Data da Cópia:</span><span>{backup.createdAt}</span></div>
            <div className="flex justify-between text-textMuted"><span>Integridade:</span><span className="text-primary font-bold">SHA-256 Verificado</span></div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
              Digite <strong className="text-danger">RESTAURAR</strong> para confirmar:
            </label>
            <input
              autoFocus
              type="text"
              placeholder="RESTAURAR"
              value={confirmationWord}
              onChange={(e) => setConfirmationWord(e.target.value)}
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg text-sm font-mono font-bold focus:outline-none focus:border-danger"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              disabled={isRestoring}
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!isConfirmed || isRestoring}
              onClick={onConfirm}
              className="bg-danger hover:bg-red-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-xs font-bold shadow flex items-center space-x-1.5"
            >
              {isRestoring ? (
                <span>Restaurando Banco...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirmar Restauração</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}