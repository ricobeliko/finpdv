import { saveSaleDb } from '../../core/database/db';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ShoppingCart, 
  Barcode, 
  CreditCard, 
  Search, 
  UserCheck, 
  Percent, 
  PauseCircle, 
  Trash2, 
  Tag,
  Lock
} from 'lucide-react';
import { Product } from '../products/types';
import { CartItem, CompletedSale, Customer, SuspendedSale } from './types';
import { useCashStore } from '../cash/cashStore';
import { useCustomerStore } from '../customers/customerStore';
import { useProductStore } from '../products/productStore';
import { 
  PaymentModal, 
  ProductSearchModal, 
  CustomerModal, 
  DiscountModal, 
  SuspendedSalesModal, 
  ReceiptModal 
} from './components/PosModals';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function PosPage() {
  const { currentSession, addMovement } = useCashStore();
  const { customers, recordCustomerSale } = useCustomerStore();
  const { products, loadFromDb, deductStockFromSale } = useProductStore();
  const isCashOpen = !!currentSession?.isOpen;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCartIndex, setSelectedCartIndex] = useState(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const [generalDiscountCents, setGeneralDiscountCents] = useState(0);
  const [suspendedSales, setSuspendedSales] = useState<SuspendedSale[]>([]);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);

  const [activeModal, setActiveModal] = useState<'PAYMENT' | 'SEARCH' | 'CUSTOMER' | 'DISCOUNT' | 'SUSPENDED' | 'RECEIPT' | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'danger' } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadFromDb();
  }, []);

  const showToast = (msg: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!activeModal && isCashOpen && barcodeRef.current) {
      barcodeRef.current.focus();
    }
  }, [activeModal, cart, isCashOpen]);

  const calculatePricing = (product: Product, quantity: number) => {
    let unitPrice = product.retailPriceCents;
    let isTier = false;

    if (product.tierPrices && product.tierPrices.length > 0) {
      const sorted = [...product.tierPrices].sort((a, b) => b.minQuantity - a.minQuantity);
      const matched = sorted.find(t => quantity >= t.minQuantity);
      if (matched) {
        unitPrice = matched.priceCents;
        isTier = true;
      }
    }

    return { unitPrice, total: Math.round(quantity * unitPrice), isTier };
  };

  // INCLUSÃO NO CARRINHO
  const handleAddItem = (rawQuery: string, explicitQty?: number) => {
    if (!isCashOpen) {
      showToast('O caixa está fechado. Abra uma sessão antes de vender.', 'warning');
      return;
    }
    if (!rawQuery.trim()) return;

    let query = rawQuery.trim();
    let qty = explicitQty || 1;

    if (query.includes('*')) {
      const parts = query.split('*');
      const parsed = parseFloat(parts[0].replace(',', '.'));
      if (!isNaN(parsed) && parsed > 0) {
        qty = parsed;
        query = parts[1].trim();
      }
    }

    // Busca no catálogo geral de produtos da store
    const prod = products.find(p =>
      p.barcodes.includes(query) || 
      p.internalCode.toLowerCase() === query.toLowerCase() ||
      p.name.toLowerCase() === query.toLowerCase()
    );

    if (!prod) {
      showToast(`Item "${query}" não encontrado no catálogo.`, 'danger');
      setBarcodeInput('');
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.productId === prod.id);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const item = updated[existingIdx];
        const newQty = item.quantity + qty;
        const pricing = calculatePricing(prod, newQty);

        updated[existingIdx] = {
          ...item,
          quantity: newQty,
          unitPriceCents: pricing.unitPrice,
          totalCents: pricing.total,
          isTierApplied: pricing.isTier
        };
        setSelectedCartIndex(existingIdx);
        return updated;
      } else {
        const pricing = calculatePricing(prod, qty);
        const newItem: CartItem = {
          id: `item-${Date.now()}-${Math.random()}`,
          productId: prod.id,
          internalCode: prod.internalCode,
          name: prod.name,
          unitMeasure: prod.unitMeasure,
          costPriceCents: prod.costPriceCents,
          retailPriceCents: prod.retailPriceCents,
          quantity: qty,
          unitPriceCents: pricing.unitPrice,
          totalCents: pricing.total,
          isTierApplied: pricing.isTier,
          isWeighable: prod.isWeighable
        };
        setSelectedCartIndex(prev.length);
        return [...prev, newItem];
      }
    });

    setBarcodeInput('');
    showToast(`${qty}x ${prod.name} inserido`, 'success');
  };

  const handleRemoveItem = () => {
    if (cart.length === 0) return;
    const item = cart[selectedCartIndex];
    setCart(prev => prev.filter((_, idx) => idx !== selectedCartIndex));
    setSelectedCartIndex(prev => Math.max(0, prev - 1));
    showToast(`Item "${item.name}" cancelado.`, 'warning');
  };

  const handleSuspendSale = () => {
    if (cart.length === 0) {
      showToast('Carrinho vazio para suspender.', 'warning');
      return;
    }
    const susp: SuspendedSale = {
      id: `susp-${Date.now()}`,
      cart: [...cart],
      customer: currentCustomer,
      generalDiscountCents,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      itemCount: cart.reduce((acc, i) => acc + i.quantity, 0),
      totalCents: cartTotals.finalTotalCents
    };
    setSuspendedSales(prev => [susp, ...prev]);
    setCart([]);
    setCurrentCustomer(null);
    setGeneralDiscountCents(0);
    showToast('Venda suspensa [F7]', 'success');
  };

  const handleResumeSale = (susp: SuspendedSale) => {
    setCart(susp.cart);
    setCurrentCustomer(susp.customer);
    setGeneralDiscountCents(susp.generalDiscountCents);
    setSuspendedSales(prev => prev.filter(s => s.id !== susp.id));
    setActiveModal(null);
    showToast('Venda recuperada para o caixa.', 'success');
  };

  const handleCancelSale = () => {
    if (cart.length === 0) return;
    if (confirm('Deseja realmente cancelar toda a venda atual?')) {
      setCart([]);
      setCurrentCustomer(null);
      setGeneralDiscountCents(0);
      showToast('Venda cancelada pelo operador.', 'danger');
    }
  };

  const cartTotals = useMemo(() => {
    const subtotalCents = cart.reduce((sum, item) => sum + item.totalCents, 0);
    const finalTotalCents = Math.max(0, subtotalCents - generalDiscountCents);
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalSavingsCents = cart.reduce((sum, item) => {
      return sum + (item.quantity * item.retailPriceCents - item.totalCents);
    }, 0) + generalDiscountCents;

    return { subtotalCents, finalTotalCents, totalCount, totalSavingsCents };
  }, [cart, generalDiscountCents]);

  const handleCompleteSale = async (sale: CompletedSale) => {
    const cashEntry = sale.payments.find(p => p.method === 'CASH');
    if (cashEntry) {
      const netCashReceived = cashEntry.amountCents - sale.changeCents;
      if (netCashReceived > 0) {
        await addMovement('SALE', netCashReceived, `Venda PDV Cupom #${sale.id}`);
      }
    }

    if (currentCustomer) {
      const mainPayment = sale.payments[0]?.method || 'DINHEIRO';
      recordCustomerSale(currentCustomer.id, sale.totalCents, cartTotals.totalCount, mainPayment);
    }

    // Baixa de estoque física
    await deductStockFromSale(
      sale.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      sale.id
    );

    // Grava a venda com itens no SQLite
    try {
      await saveSaleDb({
        ...sale,
        sessionId: currentSession?.id,
        userId: currentSession?.userId
      });
    } catch (err) {
      console.error('Erro ao gravar venda no banco:', err);
    }

    setCompletedSale(sale);
    setCart([]);
    setCurrentCustomer(null);
    setGeneralDiscountCents(0);
    setActiveModal('RECEIPT');
    showToast(`Venda de ${formatBRL(sale.totalCents)} finalizada com sucesso!`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeModal) setActiveModal(null);
        else handleCancelSale();
        return;
      }

      if (activeModal) return;

      switch (e.key) {
        case 'F1':
        case 'F2':
          e.preventDefault();
          if (!isCashOpen) showToast('Abra o caixa primeiro!', 'warning');
          else if (cart.length > 0) setActiveModal('PAYMENT');
          else showToast('Adicione itens antes do pagamento.', 'warning');
          break;
        case 'F3':
          e.preventDefault();
          setActiveModal('SEARCH');
          break;
        case 'F4':
          e.preventDefault();
          setActiveModal('CUSTOMER');
          break;
        case 'F5':
          e.preventDefault();
          if (cart.length > 0) setActiveModal('DISCOUNT');
          else showToast('Adicione itens antes de aplicar desconto.', 'warning');
          break;
        case 'F6':
          e.preventDefault();
          handleRemoveItem();
          break;
        case 'F7':
          e.preventDefault();
          if (cart.length > 0) handleSuspendSale();
          else if (suspendedSales.length > 0) setActiveModal('SUSPENDED');
          break;
        case 'ArrowDown':
          if (cart.length > 0) {
            e.preventDefault();
            setSelectedCartIndex(prev => Math.min(cart.length - 1, prev + 1));
          }
          break;
        case 'ArrowUp':
          if (cart.length > 0) {
            e.preventDefault();
            setSelectedCartIndex(prev => Math.max(0, prev - 1));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, cart, selectedCartIndex, suspendedSales, cartTotals, isCashOpen]);

  return (
    <div className="h-full flex flex-col space-y-4">
      {toast && (
        <div className={`fixed top-16 right-6 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-xs font-bold flex items-center space-x-2 border animate-fade-in ${
          toast.type === 'danger' ? 'bg-red-600 border-red-700' : toast.type === 'warning' ? 'bg-amber-600 border-amber-700' : 'bg-slate-800 border-slate-700'
        }`}>
          <span>{toast.msg}</span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-12 gap-4 overflow-hidden">
        {/* COLUNA ESQUERDA: LISTA DE ITENS */}
        <div className="col-span-7 bg-surface rounded-xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
            <span className="font-bold text-xs uppercase tracking-wider text-textMuted flex items-center space-x-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <span>Itens Registrados ({cartTotals.totalCount})</span>
            </span>
            {!isCashOpen ? (
              <span className="text-[11px] font-bold text-danger bg-red-50 px-2 py-0.5 rounded border border-red-200 flex items-center space-x-1">
                <Lock className="w-3.5 h-3.5" />
                <span>Caixa Fechado</span>
              </span>
            ) : currentCustomer && (
              <span className="text-xs font-bold bg-emerald-50 text-primary px-2.5 py-0.5 rounded border border-emerald-200">
                Cliente: {currentCustomer.name}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!isCashOpen ? (
              <div className="h-full flex flex-col items-center justify-center text-textMuted p-6">
                <Lock className="w-12 h-12 text-red-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-semibold text-slate-700">Terminal Bloqueado</p>
                <p className="text-xs text-slate-400 mt-0.5">Acesse o menu "Movimento de Caixa" para abrir a sessão de vendas.</p>
              </div>
            ) : cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-textMuted p-6">
                <Barcode className="w-12 h-12 text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-semibold text-slate-600">Caixa Livre para Registro</p>
                <p className="text-xs text-slate-400 mt-0.5">Passe o código de barras ou use [F3] para buscar ({products.length} itens no catálogo)</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-3 py-2 text-center w-8">#</th>
                    <th className="px-3 py-2">Item / Descrição</th>
                    <th className="px-3 py-2 text-center w-16">Qtd</th>
                    <th className="px-3 py-2 text-right w-24">Unitário</th>
                    <th className="px-3 py-2 text-right w-24">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {cart.map((item, idx) => {
                    const isSelected = idx === selectedCartIndex;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedCartIndex(idx)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-emerald-50 text-emerald-950 font-bold border-l-4 border-primary' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-3 py-2 text-center text-slate-400 text-[11px]">{idx + 1}</td>
                        <td className="px-3 py-2 font-sans">
                          <div className="font-bold text-textMain text-xs flex items-center space-x-1.5">
                            <span>{item.name}</span>
                            {item.isTierApplied && (
                              <span className="bg-primary text-white text-[9px] px-1 rounded font-bold">ATACADO</span>
                            )}
                          </div>
                          <span className="text-[10px] text-textMuted font-mono">Cód: {item.internalCode}</span>
                        </td>
                        <td className="px-3 py-2 text-center font-bold text-xs">{item.quantity} {item.unitMeasure}</td>
                        <td className="px-3 py-2 text-right text-xs">
                          {item.isTierApplied && (
                            <span className="line-through text-slate-400 text-[10px] block">
                              {formatBRL(item.retailPriceCents)}
                            </span>
                          )}
                          <span>{formatBRL(item.unitPriceCents)}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-xs text-primary">{formatBRL(item.totalCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddItem(barcodeInput);
              }}
              className="relative"
            >
              <input
                ref={barcodeRef}
                disabled={!isCashOpen}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder={isCashOpen ? "Código de barras ou quantidade*código (Ex: 10*00101)..." : "Caixa fechado para vendas"}
                className="w-full pl-4 pr-24 py-3 bg-surface border-2 border-primary/40 rounded-xl font-mono text-sm font-bold text-textMain focus:outline-none focus:border-primary disabled:bg-slate-100 disabled:border-slate-300 shadow-inner"
              />
              <button
                type="submit"
                disabled={!isCashOpen}
                className="absolute right-2 top-2 bg-primary hover:bg-primary-hover disabled:bg-slate-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
              >
                ENTER [↵]
              </button>
            </form>
          </div>
        </div>

        {/* COLUNA DIREITA: TOTAIS E AÇÕES */}
        <div className="col-span-5 flex flex-col justify-between space-y-4">
          <div className="bg-surface rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold text-textMuted uppercase tracking-wider">Subtotal</span>
              <p className="text-xl font-mono font-semibold text-slate-700 mt-0.5">{formatBRL(cartTotals.subtotalCents)}</p>
            </div>

            {cartTotals.totalSavingsCents > 0 && (
              <div className="my-2 bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg flex items-center justify-between text-xs text-emerald-900 font-semibold">
                <span className="flex items-center space-x-1">
                  <Tag className="w-3.5 h-3.5 text-primary" />
                  <span>Economia no Atacado/Desconto:</span>
                </span>
                <span className="font-mono text-sm font-bold text-primary">-{formatBRL(cartTotals.totalSavingsCents)}</span>
              </div>
            )}

            <div className="border-t border-slate-200 pt-3 mt-1">
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Total a Pagar</span>
              <div className="text-4xl font-mono font-black text-primary tracking-tight mt-1">
                {formatBRL(cartTotals.finalTotalCents)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 flex-1">
            <button
              onClick={() => {
                if (!isCashOpen) showToast('Abra o caixa primeiro!', 'warning');
                else if (cart.length > 0) setActiveModal('PAYMENT');
                else showToast('Adicione itens antes do pagamento.', 'warning');
              }}
              className="bg-primary hover:bg-primary-hover text-white rounded-xl p-4 flex flex-col justify-between shadow text-left transition-all"
            >
              <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-mono font-bold w-fit">F1 / F2</span>
              <div>
                <span className="text-base font-bold block">PAGAMENTO</span>
                <span className="text-xs text-emerald-200">Dinheiro, PIX, Cartão</span>
              </div>
            </button>

            <button
              onClick={() => setActiveModal('SEARCH')}
              className="bg-surface hover:bg-slate-50 text-textMain rounded-xl p-4 flex flex-col justify-between shadow border border-slate-200 text-left transition-all"
            >
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono font-bold w-fit">F3</span>
              <div>
                <span className="text-base font-bold block">BUSCAR PRODUTO</span>
                <span className="text-xs text-textMuted">Consulta rápida</span>
              </div>
            </button>

            <button
              onClick={() => setActiveModal('CUSTOMER')}
              className="bg-surface hover:bg-slate-50 text-textMain rounded-xl p-4 flex flex-col justify-between shadow border border-slate-200 text-left transition-all"
            >
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono font-bold w-fit">F4</span>
              <div>
                <span className="text-base font-bold block">IDENTIFICAR CLIENTE</span>
                <span className="text-xs text-textMuted">{currentCustomer ? currentCustomer.name : 'CPF/CNPJ na nota'}</span>
              </div>
            </button>

            <button
              onClick={() => {
                if (cart.length > 0) setActiveModal('DISCOUNT');
                else showToast('Adicione produtos para aplicar desconto.', 'warning');
              }}
              className="bg-surface hover:bg-slate-50 text-textMain rounded-xl p-4 flex flex-col justify-between shadow border border-slate-200 text-left transition-all"
            >
              <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono font-bold w-fit">F5</span>
              <div>
                <span className="text-base font-bold block">DESCONTO GERAL</span>
                <span className="text-xs text-textMuted">{generalDiscountCents > 0 ? `${formatBRL(generalDiscountCents)} aplicado` : 'Valor em R$ ou %'}</span>
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 shrink-0">
            <button
              onClick={cart.length > 0 ? handleSuspendSale : () => setActiveModal('SUSPENDED')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 border border-slate-700"
            >
              <PauseCircle className="w-4 h-4 text-amber-400" />
              <span>[F7] {cart.length > 0 ? 'Suspender Venda' : `Recuperar (${suspendedSales.length})`}</span>
            </button>

            <button
              onClick={handleCancelSale}
              className="bg-red-950/80 hover:bg-red-900 text-red-200 py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 border border-red-800"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>[ESC] Cancelar Venda</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE PAGAMENTO */}
      {activeModal === 'PAYMENT' && (
        <PaymentModal
          totalCents={cartTotals.finalTotalCents}
          cart={cart}
          customer={currentCustomer}
          discountCents={generalDiscountCents}
          onClose={() => setActiveModal(null)}
          onFinishSale={handleCompleteSale}
        />
      )}

      {/* MODAL DE BUSCA LENDO DA STORE REAL */}
      {activeModal === 'SEARCH' && (
        <ProductSearchModal
          catalog={products}
          onSelectProduct={(p) => {
            handleAddItem(p.internalCode);
            setActiveModal(null);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL DE CLIENTES */}
      {activeModal === 'CUSTOMER' && (
        <CustomerModal
          customers={customers}
          currentCustomer={currentCustomer}
          onSelectCustomer={(c) => {
            setCurrentCustomer(c);
            setActiveModal(null);
            showToast(`Cliente ${c ? c.name : 'removido'} vinculado.`);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL DE DESCONTO */}
      {activeModal === 'DISCOUNT' && (
        <DiscountModal
          subtotalCents={cartTotals.subtotalCents}
          onApply={(d) => {
            setGeneralDiscountCents(d);
            setActiveModal(null);
            showToast(`Desconto de ${formatBRL(d)} aplicado.`);
          }}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL DE VENDAS SUSPENSAS */}
      {activeModal === 'SUSPENDED' && (
        <SuspendedSalesModal
          suspendedSales={suspendedSales}
          onResume={handleResumeSale}
          onDelete={(id) => setSuspendedSales(prev => prev.filter(s => s.id !== id))}
          onClose={() => setActiveModal(null)}
        />
      )}

      {/* MODAL DO RECIBO */}
      {activeModal === 'RECEIPT' && completedSale && (
        <ReceiptModal
          sale={completedSale}
          onClose={() => {
            setActiveModal(null);
            setCompletedSale(null);
          }}
        />
      )}
    </div>
  );
}