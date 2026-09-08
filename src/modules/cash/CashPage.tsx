import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  Unlock, 
  DollarSign, 
  Clock, 
  AlertCircle, 
  X, 
  Plus, 
  Minus, 
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  Check,
  Ban
} from 'lucide-react';
import { useCashStore, CashMovement } from './cashStore';
import { useUserStore } from '../users/userStore';
import { usePosStore } from '../pos/posStore';
import { getSessionSaleItemsMapDb } from '../../core/database/db';
import { sanitizeErrorMessage } from '../../core/utils/errorSanitizer';

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

export function CashPage() {
  const { 
    currentSession, 
    movements, 
    initCash, 
    openSession, 
    closeSession, 
    addMovement,
    refundMovement,
    getExpectedDrawerCents,
    getSalesCashCents,
    getSuppliesCents,
    getWithdrawsCents
  } = useCashStore();

  const { currentUser } = useUserStore();

  const [initialAmountInput, setInitialAmountInput] = useState('');
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isSupplyModalOpen, setIsSupplyModalOpen] = useState(false);
  const [isBleedModalOpen, setIsBleedModalOpen] = useState(false);
  
  // Modal de Estorno
  const [selectedMovForRefund, setSelectedMovForRefund] = useState<CashMovement | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const [countedAmountInput, setCountedAmountInput] = useState('');
  const [movementAmountInput, setMovementAmountInput] = useState('');
  const [movementReasonInput, setMovementReasonInput] = useState('');
  const [saleItemsMap, setSaleItemsMap] = useState<Record<string, Array<{ name: string; quantity: number; totalCents: number }>>>({});

  const countedInputRef = useRef<HTMLInputElement>(null);
  const movementInputRef = useRef<HTMLInputElement>(null);
  const refundInputRef = useRef<HTMLInputElement>(null);

  const loadSaleItems = async () => {
    try {
      const itemsMap = await getSessionSaleItemsMapDb(currentSession?.id);
      setSaleItemsMap(itemsMap);
    } catch (err) {
      console.error('Erro ao buscar itens de vendas para o livro razão:', err);
    }
  };

  useEffect(() => {
    initCash(currentUser?.id || 'usr-admin', currentUser?.name || 'Administrador');
    loadSaleItems();
  }, [currentSession?.id, movements.length]);

  const renderMovementReason = (m: CashMovement) => {
    let saleId = '';
    if (m.id.startsWith('mov-sale-')) {
      saleId = m.id.replace('mov-sale-', '');
    } else {
      const match = m.reason.match(/CUPOM-[A-Z0-9_-]+/i) || m.reason.match(/#([A-Z0-9_-]+)/i);
      if (match) saleId = match[1] || match[0];
    }


    const items = saleId ? saleItemsMap[saleId] : undefined;

    let mainTitle = m.reason;
    let inlineItems = '';
    if (m.reason.includes(' • ')) {
      const parts = m.reason.split(' • ');
      mainTitle = parts[0];
      inlineItems = parts[1];
    }

    const hasItems = (items && items.length > 0) || Boolean(inlineItems);

    return (
      <div className="space-y-0.5">
        {/* 1. TOPO: DESCRIÇÃO DOS ITENS VENDIDOS */}
        {items && items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {items.map((it, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-800 font-bold"
              >
                <span className="text-primary mr-1">{it.quantity}x</span>
                <span>{it.name}</span>
              </span>
            ))}
          </div>
        ) : inlineItems ? (
          <div className="flex flex-wrap gap-1.5 items-center">
            {inlineItems.split(', ').map((itStr, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-xs font-mono text-slate-800 font-bold"
              >
                <span>{itStr}</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="font-bold text-slate-800 text-xs">
            {mainTitle}
          </div>
        )}

        {/* 2. BAIXO: INFORMAÇÕES DO CUPOM */}
        {hasItems && (
          <div className="text-[10px] text-slate-400 font-mono font-medium">
            {mainTitle}
          </div>
        )}
      </div>
    );
  };

  const isCashOpen = !!currentSession?.isOpen;
  const expectedDrawerCents = getExpectedDrawerCents();
  const salesCashCents = getSalesCashCents();
  const suppliesCents = getSuppliesCents();
  const withdrawsCents = getWithdrawsCents();

  const handleOpenCloseModal = () => {
    const posState = usePosStore.getState();
    if (posState.hasActiveSale()) {
      alert(`⚠️ ATENÇÃO: Há uma venda em andamento no PDV com ${posState.cart.length} item(ns).\n\nConclua a venda ou cancele os itens no PDV antes de realizar o fechamento do caixa.`);
      return;
    }
    const defaultVal = (expectedDrawerCents / 100).toFixed(2);
    setCountedAmountInput(defaultVal);
    setIsCloseModalOpen(true);
    setTimeout(() => {
      countedInputRef.current?.focus();
      countedInputRef.current?.select();
    }, 50);
  };

  const handleConfirmClose = async (e: React.FormEvent) => {
    e.preventDefault();
    const posState = usePosStore.getState();
    if (posState.hasActiveSale()) {
      alert(`⚠️ ATENÇÃO: Há uma venda em andamento no PDV com ${posState.cart.length} item(ns).\n\nConclua ou cancele a venda antes de encerrar o caixa.`);
      setIsCloseModalOpen(false);
      return;
    }
    const countedCents = parseToCents(countedAmountInput);
    await closeSession(countedCents, 'Fechamento Manual de Caixa');
    setIsCloseModalOpen(false);
  };

  const handleAddSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseToCents(movementAmountInput);
    if (cents <= 0) return;
    await addMovement('SUPPLEMENT', cents, movementReasonInput.trim() || 'Suprimento / Troco');
    setMovementAmountInput('');
    setMovementReasonInput('');
    setIsSupplyModalOpen(false);
  };

  const handleAddBleed = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = parseToCents(movementAmountInput);
    if (cents <= 0) return;
    await addMovement('BLEED', cents, movementReasonInput.trim() || 'Sangria de Caixa');
    setMovementAmountInput('');
    setMovementReasonInput('');
    setIsBleedModalOpen(false);
  };

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'danger' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const isRefundingRef = useRef(false);

  const handleConfirmRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMovForRefund) return;
    if (isRefundingRef.current) return;
    isRefundingRef.current = true;

    try {
      await refundMovement(selectedMovForRefund, refundReason.trim());
      showToast('Lançamento estornado com sucesso!', 'success');
      setSelectedMovForRefund(null);
      setRefundReason('');
    } catch (err: any) {
      console.error('Erro ao estornar lançamento:', err);
      showToast(sanitizeErrorMessage(err, 'Erro ao realizar estorno.'), 'danger');
    } finally {
      isRefundingRef.current = false;
    }
  };

  return (
    <div className="h-full grid grid-cols-12 gap-4 overflow-hidden select-none">
      {toast && (
        <div className={`fixed top-16 right-6 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-xs font-bold flex items-center space-x-2 border animate-fade-in ${
          toast.type === 'danger' ? 'bg-red-600 border-red-700' : toast.type === 'warning' ? 'bg-amber-600 border-amber-700' : 'bg-slate-800 border-slate-700'
        }`}>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* COLUNA ESQUERDA: RESUMO DA SESSÃO ATUAL */}
      <div className="col-span-5 flex flex-col justify-between space-y-4">
        <div className="bg-surface rounded-xl border border-slate-200 p-6 shadow-sm flex-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-sm text-textMain uppercase tracking-wider">Sessão Atual</h2>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center space-x-1 ${
                isCashOpen ? 'bg-emerald-50 text-primary border border-emerald-200' : 'bg-red-50 text-danger border border-red-200'
              }`}>
                {isCashOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{isCashOpen ? 'ABERTO' : 'FECHADO'}</span>
              </span>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Operador:</span>
                <span className="font-bold text-slate-800">{currentSession?.userName || currentUser?.name || 'Administrador'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Aberto em:</span>
                <span className="font-mono font-semibold text-slate-700">{currentSession?.openedAt || '--'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Fundo Inicial:</span>
                <span className="font-mono font-bold text-slate-800">{formatBRL(currentSession?.initialCents || 0)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Vendas em Dinheiro:</span>
                <span className="font-mono font-bold text-primary">+{formatBRL(salesCashCents)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Suprimentos:</span>
                <span className="font-mono font-bold text-teal-600">+{formatBRL(suppliesCents)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-textMuted">Sangrias:</span>
                <span className="font-mono font-bold text-red-600">-{formatBRL(withdrawsCents)}</span>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-textMuted block">Dinheiro em Gaveta:</span>
            <div className="text-3xl font-black font-mono text-primary mt-1">
              {formatBRL(expectedDrawerCents)}
            </div>
          </div>
        </div>

        {/* BOTÕES DE AÇÃO */}
        <div className="space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!isCashOpen}
              onClick={() => {
                setMovementAmountInput('');
                setMovementReasonInput('');
                setIsSupplyModalOpen(true);
                setTimeout(() => movementInputRef.current?.focus(), 40);
              }}
              className="bg-surface hover:bg-slate-50 disabled:bg-slate-100 text-slate-800 py-3 rounded-xl border border-slate-200 text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Suprimento [+]</span>
            </button>

            <button
              disabled={!isCashOpen}
              onClick={() => {
                setMovementAmountInput('');
                setMovementReasonInput('');
                setIsBleedModalOpen(true);
                setTimeout(() => movementInputRef.current?.focus(), 40);
              }}
              className="bg-surface hover:bg-slate-50 disabled:bg-slate-100 text-slate-800 py-3 rounded-xl border border-slate-200 text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-all"
            >
              <Minus className="w-4 h-4 text-red-600" />
              <span>Sangria [-]</span>
            </button>
          </div>

          {isCashOpen ? (
            <button
              onClick={handleOpenCloseModal}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl text-xs font-bold shadow-md flex items-center justify-center space-x-2 transition-all"
            >
              <Lock className="w-4 h-4" />
              <span>Encerrar Caixa</span>
            </button>
          ) : (
            <button
              onClick={() => openSession(0, currentUser?.id || 'usr-admin', currentUser?.name || 'Administrador')}
              className="w-full bg-primary hover:bg-primary-hover text-white py-3 rounded-xl text-xs font-bold shadow-md flex items-center justify-center space-x-2 transition-all"
            >
              <Unlock className="w-4 h-4" />
              <span>Abrir Sessão de Caixa</span>
            </button>
          )}
        </div>
      </div>

      {/* COLUNA DIREITA: LIVRO RAZÃO COM STATUS DE ESTORNO */}
      <div className="col-span-7 bg-surface rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <span className="text-xs font-bold text-textMain uppercase tracking-wider flex items-center space-x-2">
            <Clock className="w-4 h-4 text-primary" />
            <span>Livro Razão de Movimentações de Caixa</span>
          </span>
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => {
                initCash(currentUser?.id || 'usr-admin', currentUser?.name || 'Administrador');
                loadSaleItems();
              }}
              className="text-slate-400 hover:text-slate-700 p-1"
              title="Recarregar Movimentações"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-textMuted">{movements.length} lançamentos</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10 font-sans">
              <tr>
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3 text-center">Tipo</th>
                <th className="px-4 py-3">Justificativa / Motivo</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-slate-400 font-sans text-xs">
                    Nenhuma movimentação registrada nesta sessão.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const isSale = m.type === 'SALE';
                  const isSupp = m.type === 'SUPPLEMENT';
                  const isRefund = m.type === 'REFUND';
                  const isRefundedSale = m.type === 'REFUNDED_SALE';

                  return (
                    <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${isRefundedSale ? 'opacity-60 bg-slate-50/50' : ''}`}>
                      <td className="px-4 py-3 text-slate-600 text-[11px]">{m.timestamp}</td>
                      <td className="px-4 py-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isSale 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : isSupp 
                            ? 'bg-teal-100 text-teal-800' 
                            : isRefund 
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : isRefundedSale
                            ? 'bg-slate-200 text-slate-600' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {isSale ? 'VENDA' : isSupp ? 'SUPRIMENTO' : isRefund ? 'ESTORNO' : isRefundedSale ? 'ESTORNADA' : 'SANGRIA'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-sans font-medium ${isRefundedSale ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                        {isSale || isRefundedSale ? renderMovementReason(m) : m.reason}
                      </td>
                      <td className={`px-4 py-3 text-right font-bold text-xs ${
                        isRefundedSale ? 'line-through text-slate-400' : isSale || isSupp ? 'text-primary' : 'text-red-600'
                      }`}>
                        {isSale || isSupp ? `+${formatBRL(m.amountCents)}` : `-${formatBRL(m.amountCents)}`}
                      </td>
                      <td className="px-4 py-3 text-center font-sans">
                        {isSale && isCashOpen && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMovForRefund(m);
                              setRefundReason('');
                              setTimeout(() => refundInputRef.current?.focus(), 40);
                            }}
                            className="text-amber-700 hover:bg-amber-100 px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center space-x-1 mx-auto"
                            title="Cancelar / Estornar este lançamento"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Estornar</span>
                          </button>
                        )}
                        {isRefundedSale && (
                          <span className="text-[10px] font-bold text-slate-400 flex items-center justify-center space-x-1">
                            <Ban className="w-3 h-3 text-slate-400" />
                            <span>Cancelada</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE ESTORNO */}
      {selectedMovForRefund && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Confirmar Estorno de Venda</h3>
              </div>
              <button onClick={() => setSelectedMovForRefund(null)} className="text-white/80 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmRefund} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1 text-xs">
                <p className="text-slate-600">Lançamento Selecionado:</p>
                <p className="font-bold text-slate-900">{selectedMovForRefund.reason}</p>
                <p className="font-mono font-black text-sm text-red-600">
                  Valor a estornar: {formatBRL(selectedMovForRefund.amountCents)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motivo do Estorno / Devolução (Opcional)
                </label>
                <input
                  ref={refundInputRef}
                  type="text"
                  placeholder="Ex: Devolução de produto / Erro de cobrança"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-600"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedMovForRefund(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar Estorno</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE FECHAMENTO */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Lock className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-sm text-textMain">Conferência de Fechamento</h3>
              </div>
              <button onClick={() => setIsCloseModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmClose} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  O valor calculado na gaveta (<strong>{formatBRL(expectedDrawerCents)}</strong>) já foi preenchido. Pressione <strong>ENTER</strong> para confirmar ou informe o valor físico contado.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Total Contado Fisicamente (R$) *
                </label>
                <input
                  ref={countedInputRef}
                  type="text"
                  required
                  value={countedAmountInput}
                  onChange={(e) => setCountedAmountInput(e.target.value)}
                  className="w-full px-4 py-3 bg-surface border-2 border-slate-300 focus:border-red-600 rounded-xl font-mono text-2xl font-black text-slate-800 focus:outline-none text-center"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar [ESC]
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all"
                >
                  Encerrar Caixa [ENTER]
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE SUPRIMENTO */}
      {isSupplyModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-sm text-textMain flex items-center space-x-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Lançar Suprimento de Caixa</span>
              </span>
              <button onClick={() => setIsSupplyModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddSupply} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-primary uppercase mb-1">Valor do Suprimento (R$) *</label>
                <input
                  ref={movementInputRef}
                  type="text"
                  required
                  placeholder="0,00"
                  value={movementAmountInput}
                  onChange={(e) => setMovementAmountInput(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-primary rounded-xl font-mono text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted uppercase mb-1">Motivo / Justificativa</label>
                <input
                  type="text"
                  placeholder="Ex: Troco inicial extra"
                  value={movementReasonInput}
                  onChange={(e) => setMovementReasonInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsSupplyModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">
                  Cancelar
                </button>
                <button type="submit" className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl text-xs font-bold shadow">
                  Confirmar Suprimento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE SANGRIA */}
      {isBleedModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="font-bold text-sm text-textMain flex items-center space-x-2">
                <Minus className="w-4 h-4 text-red-600" />
                <span>Lançar Sangria de Caixa</span>
              </span>
              <button onClick={() => setIsBleedModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddBleed} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-red-600 uppercase mb-1">Valor da Sangria (R$) *</label>
                <input
                  ref={movementInputRef}
                  type="text"
                  required
                  placeholder="0,00"
                  value={movementAmountInput}
                  onChange={(e) => setMovementAmountInput(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-red-500 rounded-xl font-mono text-xl font-bold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-textMuted uppercase mb-1">Motivo / Justificativa</label>
                <input
                  type="text"
                  placeholder="Ex: Recolhimento para cofre"
                  value={movementReasonInput}
                  onChange={(e) => setMovementReasonInput(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-xs"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-2">
                <button type="button" onClick={() => setIsBleedModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-600">
                  Cancelar
                </button>
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow">
                  Confirmar Sangria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}