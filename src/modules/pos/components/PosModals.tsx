import React, { useState, useEffect } from 'react';
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
  DollarSign 
} from 'lucide-react';
import { Product } from '../../products/types';
import { CartItem, CompletedSale, Customer, PaymentEntry, PaymentMethod, SuspendedSale } from '../types';

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

// 1. MODAL DE PAGAMENTO MÚLTIPLO E TROCO (F1 / F2)
export function PaymentModal({
  totalCents,
  cart,
  customer,
  discountCents,
  onClose,
  onFinishSale
}: {
  totalCents: number;
  cart: CartItem[];
  customer: Customer | null;
  discountCents: number;
  onClose: () => void;
  onFinishSale: (sale: CompletedSale) => void;
}) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [inputAmount, setInputAmount] = useState('');
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  const totalPaidCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const remainingCents = Math.max(0, totalCents - totalPaidCents);
  const changeCents = totalPaidCents > totalCents ? totalPaidCents - totalCents : 0;

  useEffect(() => {
    if (remainingCents > 0) {
      setInputAmount((remainingCents / 100).toFixed(2));
    } else {
      setInputAmount('0.00');
    }
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

  const isReady = totalPaidCents >= totalCents;

  const handleFinalize = () => {
    if (!isReady) return;
    onFinishSale({
      id: `CUPOM-${Math.floor(100000 + Math.random() * 900000)}`,
      date: new Date().toLocaleString('pt-BR'),
      customer,
      items: cart,
      subtotalCents: totalCents + discountCents,
      discountCents,
      totalCents,
      totalPaidCents,
      changeCents,
      payments
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-primary text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">Recebimento da Venda</h3>
            <p className="text-xs text-white/70">Escolha uma ou mais formas de pagamento</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          {/* DISPLAY DE VALORES */}
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] text-textMuted uppercase font-bold">Total a Pagar</span>
              <p className="text-lg font-mono font-bold text-textMain mt-0.5">{formatBRL(totalCents)}</p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-[10px] text-textMuted uppercase font-bold">Recebido</span>
              <p className="text-lg font-mono font-bold text-emerald-700 mt-0.5">{formatBRL(totalPaidCents)}</p>
            </div>
            <div className={`p-3 rounded-xl border ${remainingCents > 0 ? 'bg-red-50 border-red-200 text-danger' : 'bg-emerald-50 border-emerald-200 text-primary'}`}>
              <span className="text-[10px] uppercase font-bold">{remainingCents > 0 ? 'Falta Pagar' : 'Troco'}</span>
              <p className="text-lg font-mono font-black mt-0.5">
                {remainingCents > 0 ? formatBRL(remainingCents) : formatBRL(changeCents)}
              </p>
            </div>
          </div>

          {/* BOTÕES DE MÉTODO */}
          {remainingCents > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
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
                      onClick={() => setSelectedMethod(m.key as PaymentMethod)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center space-y-1 transition-all ${
                        isSelected ? 'bg-primary text-white border-primary shadow' : 'bg-surface text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border-2 border-slate-200 rounded-xl text-base font-mono font-bold focus:outline-none focus:border-primary"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddPayment}
                  className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-xl font-bold text-xs"
                >
                  + Lançar
                </button>
              </div>
            </div>
          )}

          {/* LISTA DE PAGAMENTOS LANÇADOS */}
          {payments.length > 0 && (
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-1.5">
              <span className="text-[10px] font-bold text-textMuted uppercase">Pagamentos Efetuados</span>
              {payments.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between bg-surface p-2 rounded-lg border border-slate-200 text-xs">
                  <span className="font-bold text-primary">
                    {p.method === 'CASH' ? 'DINHEIRO' : p.method === 'PIX' ? 'PIX' : p.method === 'DEBIT' ? 'CARTÃO DÉBITO' : 'CARTÃO CRÉDITO'}
                  </span>
                  <div className="flex items-center space-x-3">
                    <span className="font-mono font-bold">{formatBRL(p.amountCents)}</span>
                    <button
                      type="button"
                      onClick={() => setPayments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            [ESC] Voltar
          </button>
          <button
            type="button"
            disabled={!isReady}
            onClick={handleFinalize}
            className="bg-primary hover:bg-primary-hover disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow transition-all flex items-center space-x-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Concluir Venda [F1]</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// 2. MODAL DE BUSCA RÁPIDA DE PRODUTOS (F3)
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
    p.barcodes.some(b => b.includes(term))
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
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

// 3. MODAL DE IDENTIFICAÇÃO DE CLIENTE (F4)
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
    c.name.toLowerCase().includes(term.toLowerCase()) || c.doc.includes(term)
  );

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
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
                <p className="text-[10px] text-textMuted font-mono">Doc: {c.doc}</p>
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

// 4. MODAL DE DESCONTO GERAL (F5)
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
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

// 5. MODAL DE VENDAS SUSPENSAS (F7)
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
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
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

// 6. MODAL DE COMPROVANTE TÉRMICO (80MM)
export function ReceiptModal({
  sale,
  onClose
}: {
  sale: CompletedSale;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-xs rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-3.5 bg-slate-900 text-white flex items-center justify-between">
          <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-400">Venda Concluída</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* IMPRESSÃO TÉRMICA (80MM) */}
        <div className="p-5 bg-amber-50/20 font-mono text-[11px] text-slate-800 space-y-2.5 overflow-y-auto flex-1 border-b border-dashed border-slate-300">
          <div className="text-center pb-2 border-b border-dashed border-slate-300">
            <p className="font-black text-xs">MERCADO POS</p>
            <p className="text-[9px]">DOCUMENTO AUXILIAR DE VENDA</p>
            <p className="text-[9px] text-slate-500">SEM VALOR FISCAL</p>
          </div>

          <div className="text-[10px] text-slate-600 space-y-0.5">
            <p>ID: {sale.id}</p>
            <p>DATA: {sale.date}</p>
            <p>CLIENTE: {sale.customer ? sale.customer.name : 'CONSUMIDOR'}</p>
          </div>

          <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-1">
            {sale.items.map((i, idx) => (
              <div key={idx} className="flex justify-between">
                <span>{i.quantity}x {i.name}</span>
                <span className="font-bold">{formatBRL(i.totalCents)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1 text-right text-[11px]">
            <div className="flex justify-between">
              <span>SUBTOTAL:</span>
              <span>{formatBRL(sale.subtotalCents)}</span>
            </div>
            {sale.discountCents > 0 && (
              <div className="flex justify-between text-red-600 font-bold">
                <span>DESCONTO:</span>
                <span>-{formatBRL(sale.discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-sm border-t border-slate-300 pt-1">
              <span>TOTAL:</span>
              <span>{formatBRL(sale.totalCents)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>PAGO:</span>
              <span>{formatBRL(sale.totalPaidCents)}</span>
            </div>
            {sale.changeCents > 0 && (
              <div className="flex justify-between font-bold text-primary">
                <span>TROCO:</span>
                <span>{formatBRL(sale.changeCents)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-50 flex space-x-2">
          <button
            onClick={() => window.print()}
            className="flex-1 bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center space-x-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir</span>
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-primary hover:bg-primary-hover text-white py-2 rounded-xl font-bold text-xs"
          >
            Próxima [↵]
          </button>
        </div>
      </div>
    </div>
  );
}