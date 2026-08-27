import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Search, 
  User, 
  CreditCard, 
  Banknote, 
  QrCode, 
  Trash2, 
  Printer, 
  Check, 
  PauseCircle, 
  Percent, 
  DollarSign,
  PlusCircle,
  Barcode,
  PackagePlus,
  Layers
} from 'lucide-react';
import { Product } from '../../products/types';
import { CartItem, CompletedSale, Customer, PaymentEntry, PaymentMethod, SuspendedSale } from '../types';
import { printReceipt } from '../../../core/hardware/printer';
import { useCashStore } from '../../cash/cashStore';

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

// 1. QUANTIDADE DO ITEM AO BIPAR
interface ItemQuantityModalProps {
  product: Product;
  defaultQuantity?: number;
  onConfirm: (quantity: number) => void;
  onClose: () => void;
}

export function ItemQuantityModal({
  product,
  defaultQuantity = 1,
  onConfirm,
  onClose
}: ItemQuantityModalProps) {
  const [qtyInput, setQtyInput] = useState(defaultQuantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 40);
  }, []);

  const parsedQty = parseFloat(qtyInput.replace(',', '.')) || 0;

  let unitPriceCents = product.retailPriceCents || 0;
  let isTier = false;
  if (product.tierPrices && product.tierPrices.length > 0) {
    const sorted = [...product.tierPrices].sort((a, b) => b.minQuantity - a.minQuantity);
    const matched = sorted.find(t => parsedQty >= t.minQuantity);
    if (matched) {
      unitPriceCents = matched.priceCents;
      isTier = true;
    }
  }
  const totalCents = Math.round(parsedQty * unitPriceCents);

  const handleConfirm = () => {
    if (parsedQty <= 0) return;
    onConfirm(parsedQty);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-highlight" />
            <div>
              <h3 className="font-bold text-base leading-tight">Quantidade do Item</h3>
              <p className="text-xs text-emerald-100 mt-0.5 font-mono">
                Cód: {product.internalCode} • Unidade: {product.unitMeasure || 'UN'}
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white">ESC cancela</span>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-textMuted block">Produto</span>
            <p className="font-bold text-sm text-textMain mt-0.5 leading-snug">{product.name}</p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200 text-xs">
              <span className="text-slate-500">Valor Unitário:</span>
              <span className="font-mono font-bold text-slate-800">
                {formatBRL(product.retailPriceCents)}
                {isTier && <span className="ml-1 text-[9px] bg-primary text-white px-1 py-0.5 rounded font-sans">ATACADO</span>}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-primary uppercase mb-1.5 flex justify-between">
              <span>Informe a Quantidade:</span>
              <span className="text-[10px] text-textMuted lowercase font-normal font-mono">(1 para confirmar)</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={qtyInput}
              onChange={(e) => setQtyInput(e.target.value)}
              className="w-full px-4 py-3 bg-surface border-2 border-primary rounded-xl font-mono text-3xl font-black text-textMain focus:outline-none focus:ring-4 focus:ring-primary/20 text-center"
              placeholder="1"
            />
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">Total do Item:</span>
            <span className="text-xl font-mono font-black text-primary">{formatBRL(totalCents)}</span>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar [ESC]
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={parsedQty <= 0}
              className="bg-primary hover:bg-primary-hover disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow flex items-center space-x-1.5 transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Inserir Item [ENTER]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 2. RECEBIMENTO DA VENDA COM LANÇAMENTO DETERMINÍSTICO E SEM DUPLICIDADE
export function PaymentModal({
  totalCents,
  cart,
  customer,
  discountCents,
  onClose,
  onFinishSale
}: {
  totalCents: number; cart: CartItem[]; customer: Customer | null; discountCents: number; onClose: () => void; onFinishSale: (sale: CompletedSale) => void;
}) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [inputAmount, setInputAmount] = useState((totalCents / 100).toFixed(2));
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const isFinalizingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalPaidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const remainingCents = Math.max(0, totalCents - totalPaidCents);
  const changeCents = totalPaidCents > totalCents ? totalPaidCents - totalCents : 0;
  const isReady = totalPaidCents >= totalCents;

  useEffect(() => {
    if (remainingCents > 0) {
      setInputAmount((remainingCents / 100).toFixed(2));
    } else {
      setInputAmount('0.00');
    }
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, [payments, remainingCents]);

  const handleAddPayment = () => {
    const amount = parseToCents(inputAmount);
    if (amount <= 0) return;

    if (selectedMethod !== 'CASH' && amount > remainingCents) {
      alert('Pagamentos eletrônicos (Cartão/PIX) não podem exceder o saldo restante.');
      return;
    }

    setPayments(prev => [...prev, { method: selectedMethod, amountCents: amount }]);
  };

  const handleFinalize = async () => {
    if (isFinalizingRef.current) return;

    const currentTotalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0);
    if (currentTotalPaid < totalCents) {
      return;
    }

    isFinalizingRef.current = true;

    const calculatedChange = currentTotalPaid > totalCents ? currentTotalPaid - totalCents : 0;
    const saleId = `CUPOM-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    onFinishSale({
      id: saleId,
      date: new Date().toLocaleString('pt-BR'),
      customer,
      items: cart,
      subtotalCents: totalCents + discountCents,
      discountCents,
      totalCents,
      totalPaidCents: currentTotalPaid,
      changeCents: calculatedChange,
      payments: payments,
      status: 'COMPLETED'
    });
  };


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'F1' || e.key === 'F2') {
        e.preventDefault();
        if (isReady) {
          handleFinalize();
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (remainingCents > 0) {
          handleAddPayment();
        } else if (isReady) {
          handleFinalize();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputAmount, selectedMethod, remainingCents, isReady, payments]);

  return (
    <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-primary text-white px-7 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Recebimento da Venda</h3>
            <p className="text-xs text-white/80">Escolha uma forma de pagamento e pressione ENTER</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 md:p-7 space-y-6 flex-1 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3.5 text-center">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] text-textMuted uppercase font-bold tracking-wider">Total a Pagar</span>
              <p className="text-2xl font-mono font-black text-textMain mt-1">{formatBRL(totalCents)}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] text-textMuted uppercase font-bold tracking-wider">Recebido</span>
              <p className="text-2xl font-mono font-black text-emerald-700 mt-1">{formatBRL(totalPaidCents)}</p>
            </div>
            <div className={`p-4 rounded-xl border shadow-sm ${remainingCents > 0 ? 'bg-red-50 border-red-200 text-danger' : 'bg-emerald-50 border-emerald-200 text-primary'}`}>
              <span className="text-[11px] uppercase font-bold tracking-wider">{remainingCents > 0 ? 'Falta Pagar' : 'Troco'}</span>
              <p className="text-2xl font-mono font-black mt-1">
                {remainingCents > 0 ? formatBRL(remainingCents) : formatBRL(changeCents)}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2.5">
              {[
                { key: 'CASH', label: 'Dinheiro', icon: Banknote },
                { key: 'PIX', label: 'PIX', icon: QrCode },
                { key: 'DEBIT', label: 'Débito', icon: CreditCard },
                { key: 'CREDIT', label: 'Crédito', icon: CreditCard },
              ].map(m => {
                const Icon = m.icon;
                const isSelected = selectedMethod === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => {
                      setSelectedMethod(m.key as PaymentMethod);
                      inputRef.current?.focus();
                      inputRef.current?.select();
                    }}
                    className={`p-3.5 rounded-xl border text-sm font-bold flex flex-col items-center space-y-1.5 transition-all shadow-sm ${
                      isSelected ? 'bg-primary text-white border-primary shadow' : 'bg-surface text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex space-x-2.5">
              <div className="relative flex-1">
                <span className="absolute left-3.5 top-3 text-sm font-bold text-slate-400">R$</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  className="w-full pl-11 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-xl font-mono font-bold focus:outline-none focus:border-primary shadow-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleAddPayment}
                className="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold text-sm flex items-center space-x-1.5 shadow-sm transition-all"
              >
                <span>+ Lançar [↵]</span>
              </button>
            </div>
          </div>

          {payments.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-2">
              <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Pagamentos Efetuados</span>
              {payments.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between bg-surface p-2.5 rounded-lg border border-slate-200 text-sm">
                  <span className="font-bold text-primary">
                    {p.method === 'CASH' ? 'DINHEIRO' : p.method === 'PIX' ? 'PIX' : p.method === 'DEBIT' ? 'CARTÃO DÉBITO' : 'CARTÃO CRÉDITO'}
                  </span>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold text-base">{formatBRL(p.amountCents)}</span>
                    <button
                      type="button"
                      onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-7 py-4 border-t border-slate-200 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
          >
            [ESC] Voltar
          </button>
          <button
            type="button"
            onClick={handleFinalize}
            disabled={!isReady}
            className={`px-7 py-3 rounded-xl font-bold text-sm shadow transition-all flex items-center space-x-2 ${
              isReady
                ? 'bg-primary hover:bg-primary-hover text-white cursor-pointer'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-60'
            }`}
          >
            <Check className="w-5 h-5" />
            <span>Concluir Venda [ENTER]</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 3. BUSCA RÁPIDA DE PRODUTOS [F3]
export function ProductSearchModal({
  catalog,
  onSelectProduct,
  onClose
}: {
  catalog: Product[];
  onSelectProduct: (product: Product) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const filtered = catalog.filter(p =>
    p.name.toLowerCase().includes(term.toLowerCase()) ||
    p.internalCode.toLowerCase().includes(term.toLowerCase()) ||
    (p.barcodes || []).some(b => b.includes(term))
  );

  return (
    <div 
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-2">
            <Search className="w-4 h-4 text-primary" />
            <span>Pesquisa de Produtos [F3]</span>
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 border-b border-slate-200">
          <input
            autoFocus
            type="text"
            placeholder="Digite nome, código interno ou código de barras..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0">
              <tr>
                <th className="px-3 py-2">Cód.</th>
                <th className="px-3 py-2">Descrição</th>
                <th className="px-3 py-2 text-center">Estoque</th>
                <th className="px-3 py-2 text-right">Varejo</th>
                <th className="px-3 py-2 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-bold text-slate-700">{p.internalCode}</td>
                  <td className="px-3 py-2 font-sans font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-center">{p.currentStock} {p.unitMeasure}</td>
                  <td className="px-3 py-2 text-right font-bold text-primary">{formatBRL(p.retailPriceCents)}</td>
                  <td className="px-3 py-2 text-right font-sans">
                    <button
                      onClick={() => onSelectProduct(p)}
                      className="bg-primary hover:bg-primary-hover text-white px-2.5 py-1 rounded text-[11px] font-bold"
                    >
                      Inserir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// 4. IDENTIFICAÇÃO DE CLIENTE [F4]
export function CustomerModal({
  customers,
  currentCustomer,
  onSelectCustomer,
  onClose
}: {
  customers: Customer[];
  currentCustomer: Customer | null;
  onSelectCustomer: (customer: Customer | null) => void;
  onClose: () => void;
}) {
  const [term, setTerm] = useState('');
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(term.toLowerCase()) || 
    (c.document && c.document.includes(term)) ||
    (c.phone && c.phone.includes(term))
  );

  return (
    <div 
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-2">
            <User className="w-4 h-4 text-primary" />
            <span>Identificar Cliente [F4]</span>
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-slate-200">
          <input
            autoFocus
            type="text"
            placeholder="Buscar por Nome ou CPF/CNPJ..."
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
          />
        </div>
        <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
          {filtered.map(c => (
            <div key={c.id} className="p-3 hover:bg-slate-50 flex items-center justify-between">
              <div>
                <p className="font-bold text-xs text-textMain">{c.name}</p>
                <p className="text-[10px] text-textMuted font-mono">Doc: {c.document || 'Não informado'}</p>
              </div>
              <button
                onClick={() => onSelectCustomer(c)}
                className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1 rounded text-xs font-semibold"
              >
                Selecionar
              </button>
            </div>
          ))}
        </div>
        {currentCustomer && (
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
            <button
              onClick={() => onSelectCustomer(null)}
              className="text-xs text-red-600 hover:underline font-semibold"
            >
              Remover Cliente da Venda
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 5. DESCONTO GERAL [F5]
export function DiscountModal({
  subtotalCents,
  onApply,
  onClose
}: {
  subtotalCents: number;
  onApply: (discountCents: number) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<'VALUE' | 'PERCENT'>('VALUE');
  const [inputVal, setInputVal] = useState('');

  const handleConfirm = () => {
    let discount = 0;
    if (type === 'VALUE') {
      discount = parseToCents(inputVal);
    } else {
      const pct = parseFloat(inputVal) || 0;
      discount = Math.round((subtotalCents * pct) / 100);
    }

    if (discount > subtotalCents) {
      alert('O desconto não pode ultrapassar o subtotal da venda.');
      return;
    }
    onApply(discount);
  };

  return (
    <div 
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface w-full max-w-xs rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-1.5">
            <Percent className="w-4 h-4 text-primary" />
            <span>Desconto Geral [F5]</span>
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex rounded-lg border border-slate-200 p-1 bg-slate-100">
            <button
              onClick={() => setType('VALUE')}
              className={`flex-1 py-1 rounded text-xs font-bold ${type === 'VALUE' ? 'bg-surface text-primary shadow' : 'text-slate-600'}`}
            >
              Em Reais (R$)
            </button>
            <button
              onClick={() => setType('PERCENT')}
              className={`flex-1 py-1 rounded text-xs font-bold ${type === 'PERCENT' ? 'bg-surface text-primary shadow' : 'text-slate-600'}`}
            >
              Percentual (%)
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-textMuted uppercase mb-1">
              {type === 'VALUE' ? 'Valor do Desconto (R$)' : 'Percentual (%)'}
            </label>
            <input
              autoFocus
              type="number"
              step="0.01"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base font-mono font-bold"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-slate-600">Cancelar</button>
            <button onClick={handleConfirm} className="bg-primary hover:bg-primary-hover text-white px-4 py-1.5 rounded-lg text-xs font-bold">
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 6. VENDAS SUSPENSAS [F7]
export function SuspendedSalesModal({
  suspendedSales,
  onResume,
  onDelete,
  onClose
}: {
  suspendedSales: SuspendedSale[];
  onResume: (sale: SuspendedSale) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div 
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-xs uppercase tracking-wider text-textMain flex items-center space-x-1.5">
            <PauseCircle className="w-4 h-4 text-amber-500" />
            <span>Vendas Suspensas [F7]</span>
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto divide-y divide-slate-100">
          {suspendedSales.length === 0 ? (
            <p className="text-center py-10 text-xs text-textMuted">Nenhuma venda em espera.</p>
          ) : (
            suspendedSales.map(s => (
              <div key={s.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-bold text-xs text-textMain">
                    {s.customer ? s.customer.name : 'Consumidor Não Identificado'}
                  </p>
                  <p className="text-[10px] text-textMuted font-mono">
                    {s.timestamp} • {s.itemCount} itens • {formatBRL(s.totalCents)}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onDelete(s.id)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded"
                    title="Descartar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onResume(s)}
                    className="bg-primary hover:bg-primary-hover text-white px-3 py-1 rounded text-xs font-bold"
                  >
                    Recuperar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// 7. COMPROVANTE TÉRMICO [F1] E [ENTER]
export function ReceiptModal({
  sale,
  onClose
}: {
  sale: CompletedSale;
  onClose: () => void;
}) {
  const nextBtnRef = useRef<HTMLButtonElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleDirectPrint = async () => {
    if (isPrinting) return;
    const savedPrinter = localStorage.getItem('mercado_selected_printer') || '';
    if (!savedPrinter) {
      alert('Selecione e salve uma impressora na aba "Configurações & Backup > Periféricos" primeiro.');
      return;
    }
    setIsPrinting(true);
    try {
      await printReceipt(sale, savedPrinter);
    } catch (err: any) {
      alert(`Falha ao imprimir: ${err.message || err}`);
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    nextBtnRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        handleDirectPrint();
      } else if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isPrinting]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md min-h-[600px] rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <span className="font-bold text-sm uppercase tracking-wider text-emerald-400">Venda Concluída</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* PRÉVIA DO CUPOM FORMATADO */}
        <div className="p-7 bg-amber-50/20 font-mono text-slate-800 space-y-4 overflow-y-auto flex-1 border-b border-dashed border-slate-300 flex flex-col justify-between">
          <div className="space-y-3.5">
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <p className="font-black text-lg md:text-xl tracking-wide text-slate-900">MERCEARIA UBER</p>
              <p className="text-xs font-semibold text-slate-600 mt-1">DOCUMENTO AUXILIAR DE VENDA</p>
              <p className="text-xs text-slate-400">SEM VALOR FISCAL</p>
            </div>

            <div className="text-xs md:text-sm text-slate-700 space-y-1.5 font-medium">
              <p>ID: {sale.id}</p>
              <p>DATA: {sale.date}</p>
              <p>CLIENTE: {sale.customer ? sale.customer.name : 'CONSUMIDOR'}</p>
            </div>

            <div className="border-t border-b border-dashed border-slate-300 py-3 space-y-2">
              {sale.items.map((i, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm md:text-base font-semibold">
                  <span>{i.quantity}x {i.name}</span>
                  <span className="font-bold font-mono">{formatBRL(i.totalCents)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-right pt-3">
            <div className="flex justify-between text-xs md:text-sm text-slate-700 font-medium">
              <span>SUBTOTAL:</span>
              <span className="font-mono">{formatBRL(sale.subtotalCents)}</span>
            </div>
            {sale.discountCents > 0 && (
              <div className="flex justify-between text-xs md:text-sm text-red-600 font-bold">
                <span>DESCONTO:</span>
                <span className="font-mono">-{formatBRL(sale.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-2xl border-t-2 border-slate-300 pt-2 text-slate-900">
              <span>TOTAL:</span>
              <span className="font-mono">{formatBRL(sale.totalCents)}</span>
            </div>
            <div className="flex justify-between text-sm md:text-base text-slate-700 font-bold">
              <span>PAGO:</span>
              <span className="font-mono">{formatBRL(sale.totalPaidCents || sale.totalCents)}</span>
            </div>
            {sale.changeCents > 0 && (
              <div className="flex justify-between font-black text-2xl text-primary">
                <span>TROCO:</span>
                <span className="font-mono">{formatBRL(sale.changeCents)}</span>
              </div>
            )}
          </div>
        </div>

        {/* BOTÕES DE AÇÃO COM ATALHO [F1] */}
        <div className="p-4 bg-slate-50 flex space-x-3">
          <button
            onClick={handleDirectPrint}
            disabled={isPrinting}
            className="flex-1 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 text-white py-3.5 rounded-xl font-bold text-sm flex items-center justify-center space-x-2 shadow transition-all"
          >
            <Printer className="w-5 h-5 text-emerald-400" />
            <span>{isPrinting ? 'Imprimindo...' : '[F1] Imprimir'}</span>
          </button>
          <button
            ref={nextBtnRef}
            onClick={onClose}
            className="flex-1 bg-primary hover:bg-primary-hover text-white py-3.5 rounded-xl font-bold text-sm shadow transition-all"
          >
            Próxima [↵]
          </button>
        </div>
      </div>
    </div>
  );
}

// 8. PREÇO LIVRE / VAREJO
interface OpenPriceModalProps {
  product: Product;
  quantity: number;
  onConfirm: (priceCents: number, customQuantity: number, customName?: string) => void;
  onClose: () => void;
}

export function OpenPriceModal({
  product,
  quantity = 1,
  onConfirm,
  onClose
}: OpenPriceModalProps) {
  const [priceInput, setPriceInput] = useState('');
  const [qtyInput, setQtyInput] = useState(quantity.toString());
  const [customName, setCustomName] = useState(product.name || 'Varejo Diversos');

  const priceRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => {
      priceRef.current?.focus();
    }, 40);
  }, []);

  const handleConfirm = () => {
    const parsedPrice = parseFloat(priceInput.replace(',', '.'));
    const parsedQty = parseFloat(qtyInput.replace(',', '.')) || 1;

    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      priceRef.current?.focus();
      return;
    }

    if (parsedQty <= 0) {
      qtyRef.current?.focus();
      return;
    }

    const priceCents = Math.round(parsedPrice * 100);
    onConfirm(priceCents, parsedQty, customName.trim() || product.name);
  };

  const handlePriceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const parsedPrice = parseFloat(priceInput.replace(',', '.'));
      if (!isNaN(parsedPrice) && parsedPrice > 0) {
        qtyRef.current?.focus();
        qtyRef.current?.select();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const handleQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const parsedPriceNum = parseFloat(priceInput.replace(',', '.')) || 0;
  const parsedQtyNum = parseFloat(qtyInput.replace(',', '.')) || 0;
  const totalCalculatedCents = Math.round(parsedPriceNum * 100 * parsedQtyNum);

  return (
    <div 
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base leading-tight">Informe o Valor do Item</h3>
            <p className="text-xs text-emerald-100 mt-0.5 font-mono">
              Cód. {product.internalCode} • Venda Avulsa / Varejo
            </p>
          </div>
          <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded text-white">ESC volta</span>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-primary uppercase mb-1">
                Valor Unitário (R$):
              </label>
              <input
                ref={priceRef}
                type="text"
                placeholder="0,00"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={handlePriceKeyDown}
                className="w-full px-4 py-3 bg-surface border-2 border-primary rounded-xl font-mono text-2xl font-black text-textMain focus:outline-none focus:ring-4 focus:ring-primary/20 text-center"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Qtd:
              </label>
              <input
                ref={qtyRef}
                type="text"
                placeholder="1"
                value={qtyInput}
                onChange={(e) => setQtyInput(e.target.value)}
                onKeyDown={handleQtyKeyDown}
                className="w-full px-3 py-3 bg-surface border-2 border-slate-300 focus:border-primary rounded-xl font-mono text-2xl font-black text-textMain focus:outline-none focus:ring-4 focus:ring-primary/20 text-center"
              />
            </div>
          </div>

          {totalCalculatedCents > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>Total Calculado:</span>
              <span className="text-base font-mono text-primary font-black">{formatBRL(totalCalculatedCents)}</span>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">
              Descrição / Detalhe no Cupom (Opcional):
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose();
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar [ESC]
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Inserir Item [ENTER]</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 9. CADASTRO RÁPIDO DE PRODUTO
interface QuickProductRegisterModalProps {
  scannedCode: string;
  quantity: number;
  onSaveAndAdd: (product: {
    name: string;
    internalCode: string;
    barcode: string;
    retailPriceCents: number;
    costPriceCents: number;
    unitMeasure: string;
  }) => void;
  onClose: () => void;
}

export function QuickProductRegisterModal({
  scannedCode,
  quantity,
  onSaveAndAdd,
  onClose
}: QuickProductRegisterModalProps) {
  const [name, setName] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [costPrice, setCostPrice] = useState('0.00');
  const [unitMeasure, setUnitMeasure] = useState('UN');

  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const handleConfirm = () => {
    if (!name.trim()) {
      nameRef.current?.focus();
      return;
    }
    const retailCents = parseToCents(retailPrice);
    if (retailCents <= 0) {
      priceRef.current?.focus();
      return;
    }

    onSaveAndAdd({
      name: name.trim(),
      internalCode: scannedCode,
      barcode: scannedCode,
      retailPriceCents: retailCents,
      costPriceCents: parseToCents(costPrice),
      unitMeasure
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div onKeyDown={handleKeyDown} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <PackagePlus className="w-6 h-6 text-highlight" />
            <div>
              <h3 className="font-bold text-base leading-tight">Cadastrar Novo Produto</h3>
              <p className="text-xs text-white/80 mt-0.5">
                Código: <strong className="font-mono bg-white/20 px-1.5 py-0.2 rounded">{scannedCode}</strong> • Inserir {quantity}x na venda
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-textMuted uppercase mb-1">
              Descrição / Nome do Produto *
            </label>
            <input
              ref={nameRef}
              type="text"
              required
              placeholder="Ex: Biscoito Recheado 140g"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  priceRef.current?.focus();
                  priceRef.current?.select();
                }
              }}
              className="w-full px-3.5 py-2.5 bg-surface border-2 border-slate-200 focus:border-primary rounded-xl text-sm font-semibold text-textMain focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-primary uppercase mb-1">
                Preço de Venda (R$) *
              </label>
              <input
                ref={priceRef}
                type="text"
                required
                placeholder="0,00"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-surface border-2 border-primary rounded-xl text-lg font-mono font-black text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-textMuted uppercase mb-1">
                Unidade
              </label>
              <select
                value={unitMeasure}
                onChange={(e) => setUnitMeasure(e.target.value)}
                className="w-full px-3.5 py-3 bg-surface border-2 border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-primary"
              >
                <option value="UN">UN (Unidade)</option>
                <option value="KG">KG (Quilo)</option>
                <option value="LT">LT (Litro)</option>
                <option value="CX">CX (Caixa)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-textMuted font-mono">
              [ENTER] grava e insere na venda • [ESC] cancela
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl text-xs font-bold shadow flex items-center space-x-1.5 transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Salvar & Inserir [↵]</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}