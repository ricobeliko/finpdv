import React, { useState } from 'react';
import { 
  DollarSign, 
  Unlock, 
  Lock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Receipt, 
  ShieldCheck, 
  AlertCircle 
} from 'lucide-react';
import { useCashStore } from './cashStore';
import { 
  OpenCashModal, 
  CashMovementModal, 
  CloseCashBlindModal, 
  CashClosingReportModal 
} from './components/CashModals';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function CashPage() {
  const {
    currentSession,
    movements,
    lastClosingSummary,
    openSession,
    addMovement,
    closeSession,
    clearLastSummary,
    getExpectedDrawerCents,
    getSalesCashCents,
    getSuppliesCents,
    getWithdrawsCents
  } = useCashStore();

  const [activeModal, setActiveModal] = useState<'OPEN' | 'SUPPLY' | 'WITHDRAW' | 'CLOSE' | null>(null);

  const isSessionOpen = !!currentSession?.isOpen;
  const expectedDrawer = getExpectedDrawerCents();
  const salesCash = getSalesCashCents();
  const supplies = getSuppliesCents();
  const withdraws = getWithdrawsCents();

  return (
    <div className="h-full grid grid-cols-12 gap-4">
      {/* PAINEL LATERAL DE CONTROLE DA SESSÃO */}
      <div className="col-span-4 bg-surface rounded-xl border border-slate-200 p-5 flex flex-col justify-between shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-2">
              <DollarSign className="w-4 h-4 text-primary" />
              <span>Sessão Atual</span>
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              isSessionOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              {isSessionOpen ? 'ABERTO' : 'FECHADO'}
            </span>
          </div>

          {isSessionOpen ? (
            <div className="space-y-3 font-mono text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <div className="flex justify-between text-textMuted">
                  <span>Operador:</span>
                  <span className="font-sans font-semibold text-textMain">{currentSession.userName}</span>
                </div>
                <div className="flex justify-between text-textMuted">
                  <span>Aberto em:</span>
                  <span>{currentSession.openedAt}</span>
                </div>
                <div className="flex justify-between text-textMuted">
                  <span>Fundo Inicial:</span>
                  <span className="font-bold text-slate-800">{formatBRL(currentSession.initialAmountCents)}</span>
                </div>
                <div className="flex justify-between text-textMuted">
                  <span>Vendas em Dinheiro:</span>
                  <span className="font-bold text-primary">+{formatBRL(salesCash)}</span>
                </div>
                <div className="flex justify-between text-textMuted">
                  <span>Suprimentos:</span>
                  <span className="font-bold text-emerald-700">+{formatBRL(supplies)}</span>
                </div>
                <div className="flex justify-between text-textMuted">
                  <span>Sangrias:</span>
                  <span className="font-bold text-danger">-{formatBRL(withdraws)}</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-textMain font-sans">
                  <span>Dinheiro em Gaveta:</span>
                  <span className="text-primary font-mono">{formatBRL(expectedDrawer)}</span>
                </div>
              </div>

              {/* BOTÕES DE SUPRIMENTO E SANGRIA */}
              <div className="grid grid-cols-2 gap-2 pt-1 font-sans">
                <button
                  onClick={() => setActiveModal('SUPPLY')}
                  className="bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition-colors"
                >
                  <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                  <span>Suprimento [+]</span>
                </button>

                <button
                  onClick={() => setActiveModal('WITHDRAW')}
                  className="bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-xl text-xs font-bold flex flex-col items-center space-y-1 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4 text-amber-400" />
                  <span>Sangria [-]</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 space-y-3">
              <Lock className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs text-textMuted max-w-xs mx-auto">
                O caixa está fechado. Abra uma sessão com fundo de troco para liberar as vendas no PDV.
              </p>
            </div>
          )}
        </div>

        {/* BOTÃO PRINCIPAL (ABRIR OU FECHAR) */}
        <div>
          {isSessionOpen ? (
            <button
              onClick={() => setActiveModal('CLOSE')}
              className="w-full bg-danger hover:bg-red-700 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>Encerrar Caixa (Conferência Cega)</span>
            </button>
          ) : (
            <button
              onClick={() => setActiveModal('OPEN')}
              className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 shadow transition-colors"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Sessão de Caixa</span>
            </button>
          )}
        </div>
      </div>

      {/* LIVRO RAZÃO DE MOVIMENTAÇÕES DE CAIXA */}
      <div className="col-span-8 bg-surface rounded-xl border border-slate-200 p-5 flex flex-col shadow-sm overflow-hidden">
        <div className="flex justify-between items-center mb-3">
          <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-2">
            <Receipt className="w-4 h-4 text-primary" />
            <span>Livro Razão de Movimentações de Caixa</span>
          </span>
          <span className="text-[11px] text-textMuted font-mono">Registros: {movements.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Horário</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Justificativa / Motivo</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-textMuted font-sans">
                    Nenhuma movimentação registrada nesta sessão.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-textMuted">{m.timestamp}</td>
                    <td className="px-3 py-2 font-sans font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        m.type === 'INITIAL' ? 'bg-blue-100 text-blue-800' :
                        m.type === 'SALE' ? 'bg-emerald-100 text-emerald-800' :
                        m.type === 'SUPPLY' ? 'bg-indigo-100 text-indigo-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {m.type === 'INITIAL' ? 'ABERTURA' : m.type === 'SALE' ? 'VENDA' : m.type === 'SUPPLY' ? 'SUPRIMENTO' : 'SANGRIA'}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-sans text-slate-700">{m.reason}</td>
                    <td className={`px-3 py-2 text-right font-bold ${m.type === 'WITHDRAW' ? 'text-danger' : 'text-primary'}`}>
                      {m.type === 'WITHDRAW' ? `-${formatBRL(m.amountCents)}` : `+${formatBRL(m.amountCents)}`}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ABERTURA */}
      <OpenCashModal
        isOpen={activeModal === 'OPEN'}
        onClose={() => setActiveModal(null)}
        onConfirm={(cents) => {
          openSession(cents);
          setActiveModal(null);
        }}
      />

      {/* MODAL: SUPRIMENTO / SANGRIA */}
      {(activeModal === 'SUPPLY' || activeModal === 'WITHDRAW') && (
        <CashMovementModal
          isOpen={true}
          type={activeModal}
          currentDrawerCents={expectedDrawer}
          onClose={() => setActiveModal(null)}
          onConfirm={(cents, reason) => {
            addMovement(activeModal, cents, reason);
            setActiveModal(null);
          }}
        />
      )}

      {/* MODAL: FECHAMENTO CEGO */}
      <CloseCashBlindModal
        isOpen={activeModal === 'CLOSE'}
        onClose={() => setActiveModal(null)}
        onConfirm={(countedCents) => {
          closeSession(countedCents);
          setActiveModal(null);
        }}
      />

      {/* MODAL: RELATÓRIO DO FECHAMENTO */}
      {lastClosingSummary && (
        <CashClosingReportModal
          summary={lastClosingSummary}
          onClose={clearLastSummary}
        />
      )}
    </div>
  );
}