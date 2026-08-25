import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Tag, Barcode, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Category, Product, TierPrice, UnitMeasure } from '../types';
import { lookupBarcodeInfo } from '../../../core/services/barcodeLookupService';
import { useProductStore, generateNextInternalCode } from '../productStore';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: any) => Promise<void> | void;
  categories: Category[];
  initialData?: Product | null;
}

export function ProductFormModal({ isOpen, onClose, onSave, categories, initialData }: ProductFormModalProps) {
  const products = useProductStore(state => state.products);

  // Determina categoria padrão inicial (Memória do último uso ou 'Mercearia & Grãos')
  const getInitialCategoryId = () => {
    if (initialData?.categoryId) return initialData.categoryId;
    const savedLastCat = localStorage.getItem('mercado_pos_last_category_id');
    if (savedLastCat && categories.some(c => c.id === savedLastCat)) {
      return savedLastCat;
    }
    const defaultCat = categories.find(c => c.name.toLowerCase().includes('mercearia') || c.name.toLowerCase().includes('grãos'));
    return defaultCat ? defaultCat.id : (categories[0]?.id || '');
  };

  const [name, setName] = useState(initialData?.name || '');
  const [internalCode, setInternalCode] = useState(initialData?.internalCode || '');
  const [categoryId, setCategoryId] = useState(getInitialCategoryId());
  const [unitMeasure, setUnitMeasure] = useState<UnitMeasure>(initialData?.unitMeasure || 'UN');
  const [barcodesInput, setBarcodesInput] = useState(initialData?.barcodes?.join(', ') || '');
  const [costPrice, setCostPrice] = useState(initialData ? (initialData.costPriceCents / 100).toFixed(2) : '0.00');
  const [retailPrice, setRetailPrice] = useState(initialData ? (initialData.retailPriceCents / 100).toFixed(2) : '');
  const [minStock, setMinStock] = useState(initialData?.minStock ?? 0);
  const [maxStock, setMaxStock] = useState(initialData?.maxStock ?? 0);
  const [initialStock, setInitialStock] = useState(0);
  const [isWeighable, setIsWeighable] = useState(initialData?.isWeighable || false);

  // Estados de Controle de Busca & Submissão
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refs de Foco, Concorrência e Mutex de Submissão
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const retailPriceInputRef = useRef<HTMLInputElement>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef<number>(0);
  const isNameManuallyEditedRef = useRef<boolean>(false);
  const isCategoryManuallyEditedRef = useRef<boolean>(false);
  const barcodesInputRef = useRef<string>(initialData?.barcodes?.join(', ') || '');
  const submittingRef = useRef<boolean>(false);

  // Faixas de Atacado
  const [tierPrices, setTierPrices] = useState<TierPrice[]>(initialData?.tierPrices || []);
  const [tierQty, setTierQty] = useState('');
  const [tierPriceVal, setTierPriceVal] = useState('');

  // Sincroniza formulário ao abrir ou alterar produto em edição
  useEffect(() => {
    if (isOpen) {
      setName(initialData?.name || '');
      setInternalCode(initialData?.internalCode || '');
      setCategoryId(getInitialCategoryId());
      setUnitMeasure(initialData?.unitMeasure || 'UN');
      const initialBarcodes = initialData?.barcodes?.join(', ') || '';
      setBarcodesInput(initialBarcodes);
      barcodesInputRef.current = initialBarcodes;
      setCostPrice(initialData ? (initialData.costPriceCents / 100).toFixed(2) : '0.00');
      setRetailPrice(initialData ? (initialData.retailPriceCents / 100).toFixed(2) : '');
      setMinStock(initialData?.minStock ?? 0);
      setMaxStock(initialData?.maxStock ?? 0);
      setInitialStock(0);
      setIsWeighable(initialData?.isWeighable || false);
      setTierPrices(initialData?.tierPrices || []);
      setTierQty('');
      setTierPriceVal('');
      setLookupMessage(null);
      setIsSearchingBarcode(false);
      setIsSubmitting(false);
      submittingRef.current = false;

      // Reseta flags de edição manual
      isNameManuallyEditedRef.current = Boolean(initialData?.name);
      isCategoryManuallyEditedRef.current = false;
      activeRequestIdRef.current = 0;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Foco inteligente: Preço em Edição, Código de Barras em Novo Cadastro
      const timer = setTimeout(() => {
        if (initialData) {
          retailPriceInputRef.current?.focus();
          retailPriceInputRef.current?.select();
        } else {
          barcodeInputRef.current?.focus();
          barcodeInputRef.current?.select();
        }
      }, 60);

      return () => {
        clearTimeout(timer);
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
      };
    }
  }, [isOpen, initialData]);

  // Atalho global: Tecla ESC fecha o modal (bloqueado durante salvamento ativo)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isSubmitting && !submittingRef.current) {
          e.preventDefault();
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const parseCents = (val: string) => {
    const num = parseFloat(val.replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  // Busca Automática de Produto por Código de Barras na Internet (com proteção de concorrência)
  const performBarcodeLookup = async (code: string) => {
    const clean = code.replace(/\D/g, '').trim();
    if (clean.length < 8 || clean.length > 14 || initialData) return;

    const reqId = ++activeRequestIdRef.current;
    setIsSearchingBarcode(true);
    setLookupMessage(null);

    try {
      const result = await lookupBarcodeInfo(clean);

      // Descarta resposta se outra requisição foi disparada ou se o código mudou
      if (activeRequestIdRef.current !== reqId) return;
      const currentClean = barcodesInputRef.current.replace(/\D/g, '').trim();
      if (currentClean !== clean) return;

      if (result.found && result.name) {
        // Apenas preenche o nome se o operador não digitou manualmente
        if (!isNameManuallyEditedRef.current || !name.trim()) {
          setName(result.name);
        }
        setLookupMessage(`Produto identificado: ${result.name}`);

        // Sugestão de categoria (apenas se o operador NÃO alterou a categoria manualmente)
        if (result.categorySuggestion && !isCategoryManuallyEditedRef.current) {
          const suggestionLower = result.categorySuggestion.toLowerCase();
          const matchedCat = categories.find(c => {
            const catNameLower = c.name.toLowerCase();
            return catNameLower.includes(suggestionLower) ||
              suggestionLower.includes(catNameLower) ||
              (suggestionLower === 'padaria' && (catNameLower.includes('pão') || catNameLower.includes('pães') || catNameLower.includes('paes') || catNameLower.includes('panificação')));
          });
          if (matchedCat) {
            setCategoryId(matchedCat.id);
            localStorage.setItem('mercado_pos_last_category_id', matchedCat.id);
          }
        }

        // Move o foco para o Preço de Venda
        setTimeout(() => {
          retailPriceInputRef.current?.focus();
          retailPriceInputRef.current?.select();
        }, 100);
      } else {
        // Se não encontrou e o nome está vazio, foca no nome
        if (!name.trim() && !isNameManuallyEditedRef.current) {
          setTimeout(() => {
            nameInputRef.current?.focus();
          }, 100);
        }
      }
    } catch (_) {
      if (activeRequestIdRef.current === reqId && !name.trim() && !isNameManuallyEditedRef.current) {
        nameInputRef.current?.focus();
      }
    } finally {
      if (activeRequestIdRef.current === reqId) {
        setIsSearchingBarcode(false);
      }
    }
  };

  const handleBarcodeChange = (val: string) => {
    setBarcodesInput(val);
    barcodesInputRef.current = val;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (initialData) return;

    const clean = val.replace(/\D/g, '');
    if (clean.length === 0) {
      // Se limpou o código de barras, reseta as flags manuais para novas consultas
      isNameManuallyEditedRef.current = false;
      isCategoryManuallyEditedRef.current = false;
      setLookupMessage(null);
    } else if (clean.length === 8 || clean.length === 12 || clean.length === 13 || clean.length === 14) {
      debounceTimerRef.current = setTimeout(() => {
        performBarcodeLookup(clean);
      }, 250);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // PREVINE O SUBMIT ACIDENTAL DO FORMULÁRIO PELO SCANNER OU TECLADO
      e.preventDefault();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const clean = barcodesInput.replace(/\D/g, '');
      if (clean.length >= 8 && clean.length <= 14) {
        performBarcodeLookup(clean);
      } else {
        nameInputRef.current?.focus();
      }
    }
  };

  const handleCategoryChange = (newCatId: string) => {
    setCategoryId(newCatId);
    isCategoryManuallyEditedRef.current = true;
    localStorage.setItem('mercado_pos_last_category_id', newCatId);
  };

  const handleAddTier = () => {
    const qty = parseInt(tierQty);
    const price = parseCents(tierPriceVal);
    if (!qty || qty <= 1 || price <= 0) {
      alert('Informe uma quantidade válida (> 1) e um valor unitário de atacado.');
      return;
    }
    setTierPrices(prev => [...prev.filter(t => t.minQuantity !== qty), { minQuantity: qty, priceCents: price }].sort((a, b) => a.minQuantity - b.minQuantity));
    setTierQty('');
    setTierPriceVal('');
  };

  const handleRemoveTier = (minQuantity: number) => {
    setTierPrices(prev => prev.filter(t => t.minQuantity !== minQuantity));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || isSubmitting) return;

    const retailCents = parseCents(retailPrice);
    if (retailCents <= 0) {
      alert('O preço de venda no varejo deve ser maior que zero.');
      retailPriceInputRef.current?.focus();
      return;
    }

    if (!name.trim()) {
      alert('Por favor, informe o nome do produto.');
      nameInputRef.current?.focus();
      return;
    }

    const barcodes = barcodesInput
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    // 1. Validação de EAN duplicado em outros produtos
    for (const barcode of barcodes) {
      const conflict = products.find(p => 
        p.id !== initialData?.id && 
        (p.barcodes || []).some(b => b.trim() === barcode)
      );
      if (conflict) {
        alert(`O código de barras "${barcode}" já está cadastrado no produto "${conflict.name}" (Cód. Interno: ${conflict.internalCode}).`);
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
        return;
      }
    }

    // 2. Validação de Código Interno manual duplicado
    const trimmedCode = internalCode.trim();
    if (trimmedCode) {
      const codeConflict = products.find(p =>
        p.id !== initialData?.id &&
        p.internalCode.toLowerCase() === trimmedCode.toLowerCase()
      );
      if (codeConflict) {
        alert(`O código interno "${trimmedCode}" já pertence ao produto "${codeConflict.name}".`);
        return;
      }
    }

    // 3. Geração segura e sequencial de código interno (ex: COD-00001) se estiver em branco
    const finalInternalCode = trimmedCode || (initialData?.internalCode || generateNextInternalCode(products));

    // Salva a última categoria utilizada na memória
    if (categoryId) {
      localStorage.setItem('mercado_pos_last_category_id', categoryId);
    }

    // ATIVAÇÃO DA TRAVA SÍNCRONA E VISUAL
    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      await onSave({
        name: name.trim(),
        internalCode: finalInternalCode,
        categoryId,
        unitMeasure,
        barcodes,
        costPriceCents: parseCents(costPrice),
        retailPriceCents: retailCents,
        minStock: Number(minStock) || 0,
        maxStock: Number(maxStock) || 0,
        initialStock: Number(initialStock) || 0,
        isWeighable,
        tierPrices
      });
    } catch (err: any) {
      alert(`Erro ao salvar produto no banco: ${err?.message || 'Falha na persistência SQLite.'}`);
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* CABEÇALHO DA MODAL */}
        <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-textMain text-base">
                {initialData ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <p className="text-[11px] text-textMuted">Bipe o código de barras para preenchimento automático.</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            disabled={isSubmitting}
            className="text-textMuted hover:text-textMain p-1.5 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto font-sans">
          {/* AVISO DE IDENTIFICAÇÃO AUTOMÁTICA */}
          {lookupMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{lookupMessage}</span>
            </div>
          )}

          {/* LINHA 1: CÓDIGO DE BARRAS (EM DESTAQUE) & CÓDIGO INTERNO */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-800 uppercase mb-1 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Barcode className="w-3.5 h-3.5 text-primary" />
                  <span>Código de Barras (EAN / Bip)</span>
                </span>
                {isSearchingBarcode && (
                  <span className="text-[10px] text-primary flex items-center space-x-1 font-normal lowercase">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>buscando na internet...</span>
                  </span>
                )}
              </label>
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Passe o leitor óptico ou digite..."
                value={barcodesInput}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                className="w-full px-3.5 py-2.5 border-2 border-emerald-500/40 rounded-xl text-sm font-mono font-bold text-slate-800 bg-emerald-50/20 focus:bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Cód. Interno (Opcional)</label>
              <input
                type="text"
                placeholder="Gerado auto (ex: COD-00001)"
                value={internalCode}
                onChange={(e) => setInternalCode(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* LINHA 2: NOME DO PRODUTO & CATEGORIA COM MEMÓRIA */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-textMain uppercase mb-1">Nome / Descrição do Produto *</label>
              <input
                ref={nameInputRef}
                type="text"
                required
                placeholder="Ex: Arroz 5kg Tipo 1"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  isNameManuallyEditedRef.current = true;
                }}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Categoria / Depto</label>
              <select
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-surface font-medium focus:outline-none focus:border-primary"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* LINHA 3: PREÇO DE VENDA (DESTAQUE) & CUSTO & UNIDADE */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-primary uppercase mb-1">Preço Venda Varejo (R$) *</label>
              <input
                ref={retailPriceInputRef}
                type="number"
                step="0.01"
                required
                placeholder="0,00"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                className="w-full px-3.5 py-2 border-2 border-emerald-500 rounded-xl text-base font-mono font-bold text-primary bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Preço de Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono bg-white focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Unidade de Medida</label>
              <select
                value={unitMeasure}
                onChange={(e) => setUnitMeasure(e.target.value as UnitMeasure)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white font-medium focus:outline-none focus:border-primary"
              >
                <option value="UN">UN (Unidade)</option>
                <option value="KG">KG (Quilograma)</option>
                <option value="LT">LT (Litro)</option>
                <option value="CX">CX (Caixa)</option>
                <option value="MT">MT (Metro)</option>
              </select>
            </div>
          </div>

          {/* FAIXAS DE ATACADO POR QUANTIDADE (OPCIONAL) */}
          <div className="border border-emerald-200 bg-emerald-50/30 p-3.5 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary uppercase flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>Preços de Atacado por Quantidade (Opcional)</span>
              </span>
              <span className="text-[11px] text-textMuted">Aplicado automaticamente no caixa</span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="Qtd mínima (ex: 6)"
                value={tierQty}
                onChange={(e) => setTierQty(e.target.value)}
                className="w-1/3 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-surface"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Preço unitário R$"
                value={tierPriceVal}
                onChange={(e) => setTierPriceVal(e.target.value)}
                className="w-1/3 px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-surface"
              />
              <button
                type="button"
                onClick={handleAddTier}
                className="w-1/3 bg-primary hover:bg-primary-hover text-white text-xs font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Faixa</span>
              </button>
            </div>

            {tierPrices.length > 0 && (
              <div className="space-y-1 mt-2">
                {tierPrices.map(t => (
                  <div key={t.minQuantity} className="flex items-center justify-between bg-surface px-3 py-1.5 rounded-md border border-emerald-200 text-xs">
                    <span className="font-medium text-slate-700">A partir de <strong>{t.minQuantity} {unitMeasure}</strong></span>
                    <div className="flex items-center space-x-3">
                      <span className="font-mono font-bold text-primary">R$ {(t.priceCents / 100).toFixed(2)} cada</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTier(t.minQuantity)}
                        className="text-red-500 hover:text-red-700 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CONTROLE DE ESTOQUE & BALANÇA */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Estoque Mínimo</label>
              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Estoque Máximo</label>
              <input
                type="number"
                value={maxStock}
                onChange={(e) => setMaxStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
              />
            </div>
            {!initialData && (
              <div>
                <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Saldo Inicial</label>
                <input
                  type="number"
                  value={initialStock}
                  onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            )}
          </div>

          {/* FLAG DE BALANÇA */}
          <div className="flex items-center space-x-2 pt-0.5">
            <input
              type="checkbox"
              id="weighable"
              checked={isWeighable}
              onChange={(e) => setIsWeighable(e.target.checked)}
              className="rounded text-primary focus:ring-primary w-4 h-4 accent-primary"
            />
            <label htmlFor="weighable" className="text-xs font-medium text-textMain cursor-pointer">
              Produto pesado em balança (solicita tara/peso no checkout)
            </label>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar (Esc)
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{initialData ? 'Salvar Alterações' : 'Cadastrar Produto (Enter)'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}