import React, { useState } from 'react';
import { X, Unlock, Lock, ArrowDownLeft, ArrowUpRight, Printer, AlertTriangle } from 'lucide-react';
import { CashClosingSummary } from '../types';
import { useFinPdvStore } from '../../../core/finpdv/finpdvStore';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const parseToCents = (val: string | number) => {
  if (typeof val === 'number') return Math.round(val * 100);
  const clean = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : Math.round(num * 100);
};

// 1. MODAL: ABERTURA DE CAIXA
export function OpenCashModal({
  isOpen,
  onClose,
  onConfirm
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (initialAmountCents: number) => void;
}) {
  if (!isOpen) return null;
  const [amount, setAmount] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseToCents(amount);
    if (cents < 0) return;
    onConfirm(cents);
    setAmount('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <Unlock className="w-5 h-5 text-primary" />
            <span>Abertura de Caixa</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
              Fundo de Troco Inicial (R$) *
            </label>
            <input
              autoFocus
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex: 100.00"
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-lg font-mono font-bold focus:outline-none focus:border-primary"
            />
            <p className="text-[11px] text-textMuted mt-1">Valor físico em moedas/cédulas colocado na gaveta.</p>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              Confirmar Abertura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 2. MODAL: SUPRIMENTO / SANGRIA
export function CashMovementModal({
  isOpen,
  type,
  currentDrawerCents,
  onClose,
  onConfirm
}: {
  isOpen: boolean;
  type: 'SUPPLY' | 'WITHDRAW';
  currentDrawerCents: number;
  onClose: () => void;
  onConfirm: (amountCents: number, reason: string) => void;
}) {
  if (!isOpen) return null;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(type === 'SUPPLY' ? 'Reforço de troco' : 'Recolhimento para o cofre');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseToCents(amount);
    if (cents <= 0 || !reason.trim()) {
      alert('Informe um valor e uma justificativa válidos.');
      return;
    }

    if (type === 'WITHDRAW' && cents > currentDrawerCents) {
      alert(`A sangria não pode ser maior que o saldo atual em dinheiro na gaveta (${formatBRL(currentDrawerCents)}).`);
      return;
    }

    onConfirm(cents, reason.trim());
    setAmount('');
  };

  const isWithdraw = type === 'WITHDRAW';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            {isWithdraw ? (
              <ArrowUpRight className="w-5 h-5 text-amber-600" />
            ) : (
              <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
            )}
            <span>{isWithdraw ? 'Nova Sangria (Retirada)' : 'Novo Suprimento (Entrada)'}</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Valor da Operação (R$) *</label>
            <input
              autoFocus
              type="number"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-lg font-mono font-bold focus:outline-none focus:border-primary"
            />
            {isWithdraw && (
              <p className="text-[11px] text-textMuted mt-1">
                Disponível em gaveta: <strong className="font-mono">{formatBRL(currentDrawerCents)}</strong>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Justificativa / Motivo *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm ${
                isWithdraw ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary hover:bg-primary-hover'
              }`}
            >
              Confirmar Lançamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 3. MODAL: FECHAMENTO CEGO DE CAIXA
export function CloseCashBlindModal({
  isOpen,
  onClose,
  onConfirm
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (countedCents: number) => void;
}) {
  if (!isOpen) return null;
  const [countedInput, setCountedInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseToCents(countedInput);
    if (cents < 0) return;
    onConfirm(cents);
    setCountedInput('');
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <Lock className="w-5 h-5 text-danger" />
            <span>Conferência Cega de Fechamento</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start space-x-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p>
              Conte o total em cédulas e moedas físicas presentes na gaveta. O sistema fará a conferência com os lançamentos de vendas e sangrias.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
              Total Contado Fisicamente (R$) *
            </label>
            <input
              autoFocus
              type="number"
              step="0.01"
              required
              value={countedInput}
              onChange={(e) => setCountedInput(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-xl font-mono font-bold focus:outline-none focus:border-primary"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-danger hover:bg-red-700 text-white px-6 py-2 rounded-lg text-xs font-bold shadow"
            >
              Encerrar Caixa
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 4. MODAL: RELATÓRIO DO FECHAMENTO
export function CashClosingReportModal({
  summary,
  onClose
}: {
  summary: CashClosingSummary;
  onClose: () => void;
}) {
  const { businessProfile } = useFinPdvStore();
  const isExact = summary.differenceCents === 0;
  const isOver = summary.differenceCents > 0;

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 text-white px-5 py-3.5 flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-emerald-400">Resumo de Fechamento</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CUPOM DE CONFERÊNCIA */}
        <div className="p-6 bg-slate-50 font-mono text-xs text-slate-800 space-y-3 overflow-y-auto flex-1 border-b border-dashed border-slate-300">
          <div className="text-center pb-2 border-b border-dashed border-slate-300">
            <p className="font-bold text-sm font-sans">
              {businessProfile?.tradeName ? businessProfile.tradeName.toUpperCase() : 'FINPDV'}
            </p>
            <p className="text-[10px] text-textMuted">CONFERÊNCIA DE FECHAMENTO DE CAIXA</p>
          </div>

          <div className="text-[11px] text-slate-600 space-y-0.5">
            <p>SESSÃO: {summary.sessionId}</p>
            <p>OPERADOR: {summary.userName}</p>
            <p>ABERTURA: {summary.openedAt}</p>
            <p>FECHAMENTO: {summary.closedAt}</p>
          </div>

          <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>Fundo Inicial:</span>
              <span className="font-bold">{formatBRL(summary.initialAmountCents)}</span>
            </div>
            <div className="flex justify-between text-primary font-bold">
              <span>(+) Vendas em Dinheiro:</span>
              <span>{formatBRL(summary.salesCashCents)}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>(+) Suprimentos:</span>
              <span>{formatBRL(summary.suppliesCents)}</span>
            </div>
            <div className="flex justify-between text-danger font-bold">
              <span>(-) Sangrias:</span>
              <span>-{formatBRL(summary.withdrawsCents)}</span>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs font-bold text-slate-700">
              <span>Saldo Esperado (Sistema):</span>
              <span>{formatBRL(summary.expectedDrawerCents)}</span>
            </div>
            <div className="flex justify-between text-xs font-bold text-slate-900">
              <span>Valor Informado (Contado):</span>
              <span>{formatBRL(summary.countedCents)}</span>
            </div>
            <div className={`flex justify-between text-sm font-black pt-2 border-t border-slate-300 ${
              isExact ? 'text-primary' : isOver ? 'text-blue-600' : 'text-danger'
            }`}>
              <span>Diferença:</span>
              <span>
                {isExact ? 'R$ 0,00 (Exato)' : isOver ? `+${formatBRL(summary.differenceCents)} (Sobra)` : `${formatBRL(summary.differenceCents)} (Falta)`}
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 flex space-x-2">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Resumo</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-primary hover:bg-primary-hover text-white py-2.5 rounded-xl font-bold text-xs"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}