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
  Lock,
  KeyRound
} from 'lucide-react';
import { Product, UnitMeasure, OPEN_PRICE_PRODUCT_ID } from '../products/types';
import { CartItem, CompletedSale, Customer, SuspendedSale } from './types';

import { useCashStore } from '../cash/cashStore';
import { useCustomerStore } from '../customers/customerStore';
import { useProductStore } from '../products/productStore';
import { useUserStore } from '../users/userStore';
import { saveSaleDb } from '../../core/database/db';
import { triggerDrawer } from '../../core/hardware/printer';
import { getSelectedPrinter } from '../../core/utils/storageMigration';
import { 
  PaymentModal, 
  ProductSearchModal, 
  CustomerModal, 
  DiscountModal, 
  SuspendedSalesModal, 
  ReceiptModal, 
  OpenPriceModal,
  QuickProductRegisterModal,
  ItemQuantityModal
} from './components/PosModals';
import { usePosStore } from './posStore';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function PosPage() {
  const { currentSession } = useCashStore();
  const { customers } = useCustomerStore();
  const { products, loadFromDb, saveProduct } = useProductStore();
  const isCashOpen = !!currentSession?.isOpen;


  const {
    cart,
    setCart,
    selectedCartIndex,
    setSelectedCartIndex,
    currentCustomer,
    setCurrentCustomer,
    generalDiscountCents,
    setGeneralDiscountCents,
    suspendedSales,
    setSuspendedSales,
    completedSale,
    setCompletedSale
  } = usePosStore();

  const [barcodeInput, setBarcodeInput] = useState('');

  // Estados de Modais
  const [pendingQuantityProduct, setPendingQuantityProduct] = useState<{ product: Product; defaultQty: number } | null>(null);
  const [pendingOpenPrice, setPendingOpenPrice] = useState<{ product: Product; quantity: number } | null>(null);
  const [pendingQuickRegister, setPendingQuickRegister] = useState<{ code: string; quantity: number } | null>(null);
  const [activeModal, setActiveModal] = useState<'PAYMENT' | 'SEARCH' | 'CUSTOMER' | 'DISCOUNT' | 'SUSPENDED' | 'RECEIPT' | 'OPEN_PRICE' | 'QUICK_REGISTER' | 'QUANTITY' | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'danger' } | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const lastModalClosedAt = useRef(0);

  const handleCloseActiveModal = () => {
    lastModalClosedAt.current = Date.now();
    setActiveModal(null);
    setPendingQuantityProduct(null);
    setPendingOpenPrice(null);
    setPendingQuickRegister(null);
  };

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
    let unitPrice = product.retailPriceCents || 0;
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

  const handleOpenDrawer = () => {
    const savedPrinter = getSelectedPrinter();
    if (savedPrinter) {
      triggerDrawer(savedPrinter);
      showToast('Gaveta de dinheiro acionada [F8]!', 'success');
    } else {
      showToast('Nenhuma impressora térmica configurada.', 'warning');
    }
  };

  // INCLUSÃO / BIPAGEM DO PRODUTO
  const handleAddItem = (rawQuery: string, explicitQty?: number) => {
    if (!isCashOpen) {
      showToast('O caixa está fechado. Abra uma sessão antes de vender.', 'warning');
      return;
    }
    if (!rawQuery || !rawQuery.trim()) return;

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

    // REGRA DO CÓDIGO 1: PREÇO LIVRE / VAREJO DIVERSOS
    if (query === '1') {
      const existingProd1 = products.find(p => p.internalCode === '1');
      const virtualProd1: Product = existingProd1 || {
        id: OPEN_PRICE_PRODUCT_ID,
        internalCode: '1',
        name: 'Varejo Diversos',

        categoryId: 'cat-1',
        unitMeasure: 'UN',
        barcodes: ['1'],
        costPriceCents: 0,
        retailPriceCents: 0,
        tierPrices: [],
        minStock: 0,
        maxStock: 0,
        currentStock: 999,
        isWeighable: false,
        isOpenPrice: true,
        isActive: true
      };

      setPendingOpenPrice({ product: virtualProd1, quantity: qty });
      setActiveModal('OPEN_PRICE');
      setBarcodeInput('');
      return;
    }

    const prod = products.find(p => {
      const barcodes = p.barcodes || [];
      const code = p.internalCode || '';
      const name = p.name || '';
      return (
        barcodes.includes(query) ||
        code.toLowerCase() === query.toLowerCase() ||
        name.toLowerCase() === query.toLowerCase()
      );
    });

    if (!prod) {
      setPendingQuickRegister({ code: query, quantity: qty });
      setActiveModal('QUICK_REGISTER');
      setBarcodeInput('');
      return;
    }

    if (prod.isOpenPrice || !prod.retailPriceCents || prod.retailPriceCents === 0) {
      setPendingOpenPrice({ product: prod, quantity: qty });
      setActiveModal('OPEN_PRICE');
      setBarcodeInput('');
      return;
    }

    // PRODUTO NORMAL: ABRE O MODAL DE CONFIRMAÇÃO DE QUANTIDADE (DEFAULT 1)
    setPendingQuantityProduct({ product: prod, defaultQty: qty });
    setActiveModal('QUANTITY');
    setBarcodeInput('');
  };

  // CONFIRMAÇÃO DA QUANTIDADE E INCLUSÃO NO CARRINHO (PRODUTOS NORMAIS)
  const handleConfirmQuantity = (qty: number) => {
    if (!pendingQuantityProduct) return;
    const { product: prod } = pendingQuantityProduct;

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
          internalCode: prod.internalCode || '1',
          name: prod.name || 'Produto',
          unitMeasure: prod.unitMeasure || 'UN',
          costPriceCents: prod.costPriceCents || 0,
          retailPriceCents: prod.retailPriceCents || 0,
          quantity: qty,
          unitPriceCents: pricing.unitPrice,
          totalCents: pricing.total,
          isTierApplied: pricing.isTier,
          isWeighable: Boolean(prod.isWeighable)
        };
        setSelectedCartIndex(prev.length);
        return [...prev, newItem];
      }
    });

    setActiveModal(null);
    setPendingQuantityProduct(null);
    showToast(`${qty}x ${prod.name} inserido`, 'success');
  };

  const handleSaveAndAddQuickProduct = async (productData: {
    name: string;
    internalCode: string;
    barcode: string;
    retailPriceCents: number;
    costPriceCents: number;
    unitMeasure: UnitMeasure | string;
  }) => {
    const qty = pendingQuickRegister?.quantity || 1;
    const newId = `prod-${Date.now()}`;

    const newProd: Product = {
      id: newId,
      internalCode: productData.internalCode,
      name: productData.name,
      categoryId: 'cat-1',
      unitMeasure: (productData.unitMeasure as UnitMeasure) || 'UN',
      barcodes: [productData.barcode],
      costPriceCents: productData.costPriceCents,
      retailPriceCents: productData.retailPriceCents,
      tierPrices: [],
      minStock: 5,
      maxStock: 100,
      currentStock: 50,
      isWeighable: false,
      isOpenPrice: false,
      isActive: true
    };

    await saveProduct(newProd);

    const newItem: CartItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: newId,
      internalCode: newProd.internalCode,
      name: newProd.name,
      unitMeasure: newProd.unitMeasure,
      costPriceCents: newProd.costPriceCents,
      retailPriceCents: newProd.retailPriceCents,
      quantity: qty,
      unitPriceCents: newProd.retailPriceCents,
      totalCents: Math.round(qty * newProd.retailPriceCents),
      isTierApplied: false,
      isWeighable: false
    };

    setCart(prev => {
      setSelectedCartIndex(prev.length);
      return [...prev, newItem];
    });

    setActiveModal(null);
    setPendingQuickRegister(null);
    showToast(`Produto "${newProd.name}" cadastrado e inserido na venda!`, 'success');
  };

  // CONFIRMAÇÃO DO PREÇO LIVRE / VAREJO DIVERSOS COM QUANTIDADE DINÂMICA
  const handleConfirmOpenPrice = (priceCents: number, customQty: number, customName?: string) => {
    if (!pendingOpenPrice) return;
    const { product: prod } = pendingOpenPrice;
    const qty = customQty || pendingOpenPrice.quantity || 1;
    const itemName = customName?.trim() || prod.name || 'Varejo Diversos';

    const newItem: CartItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      productId: prod.id,
      internalCode: prod.internalCode || '1',
      name: itemName,
      unitMeasure: prod.unitMeasure || 'UN',
      costPriceCents: 0,
      retailPriceCents: priceCents,
      quantity: qty,
      unitPriceCents: priceCents,
      totalCents: Math.round(qty * priceCents),
      isTierApplied: false,
      isWeighable: false
    };

    setCart(prev => [...prev, newItem]);
    setSelectedCartIndex(cart.length);
    setActiveModal(null);
    setPendingOpenPrice(null);
    showToast(`${qty}x ${itemName} (${formatBRL(priceCents)}) inserido`, 'success');
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

  const isCompletingSaleRef = useRef(false);

  const handleCompleteSale = async (sale: CompletedSale) => {
    if (isCompletingSaleRef.current) return;
    isCompletingSaleRef.current = true;

    // FASE 1: PERSISTÊNCIA CRÍTICA TRANSACIONAL NO SQLITE
    try {
      const currentUser = useUserStore.getState().currentUser;
      const payload = {
        ...sale,
        sessionId: currentSession?.id,
        userId: currentSession?.userId || currentUser?.id,
        userName: currentSession?.userName || currentUser?.name || 'Operador de Caixa'
      };

      await saveSaleDb(payload);
    } catch (err: any) {
      console.error('FALHA CRÍTICA AO COMPLETAR VENDA NO BANCO:', err);
      const msg = err?.message || String(err) || 'Erro crítico ao salvar a venda no banco de dados.';
      showToast(msg, 'danger');
      isCompletingSaleRef.current = false;
      // IMPORTANTE: Carrinho e estado permanecem intactos para correção ou nova tentativa
      return;
    }

    // FASE 2: PÓS-COMMIT (A VENDA JÁ EXISTE NO SQLITE E NÃO PODE SER RETENTADA)
    try {
      // 1. Limpa imediatamente o carrinho e prepara o modal de comprovante
      setCompletedSale(sale);
      setCart([]);
      setCurrentCustomer(null);
      setGeneralDiscountCents(0);
      setActiveModal('RECEIPT');
      showToast(`Venda de ${formatBRL(sale.totalCents)} finalizada com sucesso!`);

      // 2. Sincronização em memória dos stores (somente leitura / recarga do SQLite)
      useProductStore.getState().loadFromDb().catch(e => console.warn('Aviso: falha ao recarregar produtos pós-venda:', e));
      useCashStore.getState().initCash().catch(e => console.warn('Aviso: falha ao recarregar caixa pós-venda:', e));
      useCustomerStore.getState().loadFromDb().catch(e => console.warn('Aviso: falha ao recarregar clientes pós-venda:', e));

      // 3. Efeitos de hardware pós-commit (falha na gaveta não invalida a venda)
      const savedPrinter = getSelectedPrinter();
      if (savedPrinter) {
        try {
          triggerDrawer(savedPrinter);
        } catch (e) {
          console.warn('Aviso: falha ao acionar gaveta pós-venda:', e);
        }
      }
    } catch (postCommitErr) {
      console.warn('Aviso pós-commit (venda já gravada com sucesso no SQLite):', postCommitErr);
      showToast('Venda registrada com sucesso! (Aviso na atualização da interface)', 'warning');
    } finally {
      isCompletingSaleRef.current = false;
    }
  };



  // TECLAS DE ATALHO GLOBAIS (F1 até F8)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        // Se houver qualquer modal aberto ou inclusão de item pendente, fecha apenas o modal
        if (activeModal || pendingQuantityProduct || pendingOpenPrice || pendingQuickRegister) {
          handleCloseActiveModal();
          return;
        }
        // Se um modal acabou de ser fechado (ex: nos últimos 350ms), ignora o Escape para evitar falso cancelamento de toda a venda
        if (Date.now() - lastModalClosedAt.current < 350) {
          return;
        }
        handleCancelSale();
        return;
      }

      if (e.key === 'F8') {
        e.preventDefault();
        handleOpenDrawer();
        return;
      }

      if (activeModal || pendingQuantityProduct || pendingOpenPrice || pendingQuickRegister) return;

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
        case 'Delete':
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
  }, [activeModal, pendingQuantityProduct, pendingOpenPrice, pendingQuickRegister, cart, selectedCartIndex, suspendedSales, cartTotals, isCashOpen]);

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
              <div className="h-full flex flex-col items-center justify-center text-textMuted p-6 animate-fade-in">
                <img src="/icon.png" alt="FinPDV" className="w-16 h-16 rounded-2xl shadow-md mb-3 object-cover opacity-95" />
                <p className="text-sm font-bold text-slate-700">Caixa Livre para Registro</p>
                <p className="text-xs text-slate-400 mt-1">
                  Passe o código de barras, pressione <strong className="text-primary font-mono font-bold">[F3]</strong> para busca ou digite <strong className="text-primary font-mono font-bold">[1 + ENTER]</strong> para Preço Livre
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
  <thead className="bg-slate-100 text-textMuted uppercase text-xs sticky top-0 border-b border-slate-200 z-10">
    <tr>
      <th className="px-3.5 py-2.5 text-center w-10">#</th>
      <th className="px-3.5 py-2.5">Item / Descrição</th>
      <th className="px-3.5 py-2.5 text-center w-20">Qtd</th>
      <th className="px-3.5 py-2.5 text-right w-28">Unitário</th>
      <th className="px-3.5 py-2.5 text-right w-28">Total</th>
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
          <td className="px-3.5 py-2.5 text-center text-slate-400 text-xs font-semibold">{idx + 1}</td>
          <td className="px-3.5 py-2.5 font-sans">
            <div className="font-bold text-textMain text-sm flex items-center space-x-1.5 leading-snug">
              <span>{item.name}</span>
              {item.isTierApplied && (
                <span className="bg-primary text-white text-[10px] px-1.5 py-0.5 rounded font-bold">ATACADO</span>
              )}
            </div>
            <span className="text-xs text-textMuted font-mono">Cód: {item.internalCode}</span>
          </td>
          <td className="px-3.5 py-2.5 text-center font-bold text-sm">{item.quantity} {item.unitMeasure}</td>
          <td className="px-3.5 py-2.5 text-right text-sm">
            {item.isTierApplied && (
              <span className="line-through text-slate-400 text-xs block">
                {formatBRL(item.retailPriceCents)}
              </span>
            )}
            <span className="font-semibold">{formatBRL(item.unitPriceCents)}</span>
          </td>
          <td className="px-3.5 py-2.5 text-right font-black text-sm text-primary">{formatBRL(item.totalCents)}</td>
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
                placeholder={isCashOpen ? "Bipe o código de barras ou digite '1' para Preço Livre..." : "Caixa fechado para vendas"}
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

          {/* BOTÕES INFERIORES: GAVETA (F8), SUSPENDER (F7) E CANCELAR (ESC) */}
          <div className="grid grid-cols-3 gap-2 shrink-0">
            <button
              onClick={handleOpenDrawer}
              className="bg-emerald-800 hover:bg-emerald-700 text-emerald-100 py-3 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 border border-emerald-700 shadow-sm"
              title="Abrir Gaveta de Dinheiro"
            >
              <KeyRound className="w-4 h-4 text-emerald-300" />
              <span>[F8] Gaveta</span>
            </button>

            <button
              onClick={cart.length > 0 ? handleSuspendSale : () => setActiveModal('SUSPENDED')}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 border border-slate-700"
            >
              <PauseCircle className="w-4 h-4 text-amber-400" />
              <span>[F7] {cart.length > 0 ? 'Suspender' : `Espera (${suspendedSales.length})`}</span>
            </button>

            <button
              onClick={handleCancelSale}
              className="bg-red-950/80 hover:bg-red-900 text-red-200 py-3 px-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-1 border border-red-800"
            >
              <Trash2 className="w-4 h-4 text-red-400" />
              <span>[ESC] Cancelar</span>
            </button>
          </div>
        </div>
      </div>

      {/* MODAL DE QUANTIDADE AO BIPAR */}
      {activeModal === 'QUANTITY' && pendingQuantityProduct && (
        <ItemQuantityModal
          product={pendingQuantityProduct.product}
          defaultQuantity={pendingQuantityProduct.defaultQty}
          onConfirm={handleConfirmQuantity}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE PAGAMENTO */}
      {activeModal === 'PAYMENT' && (
        <PaymentModal
          totalCents={cartTotals.finalTotalCents}
          cart={cart}
          customer={currentCustomer}
          discountCents={generalDiscountCents}
          onClose={handleCloseActiveModal}
          onFinishSale={handleCompleteSale}
        />
      )}

      {/* MODAL DE BUSCA */}
      {activeModal === 'SEARCH' && (
        <ProductSearchModal
          catalog={products}
          onSelectProduct={(p) => {
            handleAddItem(p.internalCode);
            handleCloseActiveModal();
          }}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE PREÇO LIVRE / VAREJO (COM CAMPO DE QUANTIDADE E SALTO NO ENTER) */}
      {activeModal === 'OPEN_PRICE' && pendingOpenPrice && (
        <OpenPriceModal
          product={pendingOpenPrice.product}
          quantity={pendingOpenPrice.quantity}
          onConfirm={handleConfirmOpenPrice}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE CADASTRO RÁPIDO */}
      {activeModal === 'QUICK_REGISTER' && pendingQuickRegister && (
        <QuickProductRegisterModal
          scannedCode={pendingQuickRegister.code}
          quantity={pendingQuickRegister.quantity}
          onSaveAndAdd={handleSaveAndAddQuickProduct}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE CLIENTES */}
      {activeModal === 'CUSTOMER' && (
        <CustomerModal
          customers={customers}
          currentCustomer={currentCustomer}
          onSelectCustomer={(c: Customer | null) => {
            setCurrentCustomer(c);
            handleCloseActiveModal();
            showToast(`Cliente ${c ? c.name : 'removido'} vinculado.`);
          }}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE DESCONTO */}
      {activeModal === 'DISCOUNT' && (
        <DiscountModal
          subtotalCents={cartTotals.subtotalCents}
          onApply={(d: number) => {
            setGeneralDiscountCents(d);
            handleCloseActiveModal();
            showToast(`Desconto de ${formatBRL(d)} aplicado.`);
          }}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DE VENDAS SUSPENSAS */}
      {activeModal === 'SUSPENDED' && (
        <SuspendedSalesModal
          suspendedSales={suspendedSales}
          onResume={handleResumeSale}
          onDelete={(id: string) => setSuspendedSales(prev => prev.filter(s => s.id !== id))}
          onClose={handleCloseActiveModal}
        />
      )}

      {/* MODAL DO RECIBO */}
      {activeModal === 'RECEIPT' && completedSale && (
        <ReceiptModal
          sale={completedSale}
          onClose={() => {
            handleCloseActiveModal();
            setCompletedSale(null);
          }}
        />
      )}
    </div>
  );
}