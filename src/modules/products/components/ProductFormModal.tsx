import React, { useState } from 'react';
import { X, Plus, Trash2, Tag } from 'lucide-react';
import { Category, Product, TierPrice, UnitMeasure } from '../types';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: any) => void;
  categories: Category[];
  initialData?: Product | null;
}

export function ProductFormModal({ isOpen, onClose, onSave, categories, initialData }: ProductFormModalProps) {
  if (!isOpen) return null;

  const [name, setName] = useState(initialData?.name || '');
  const [internalCode, setInternalCode] = useState(initialData?.internalCode || '');
  const [categoryId, setCategoryId] = useState(initialData?.categoryId || (categories[0]?.id || ''));
  const [unitMeasure, setUnitMeasure] = useState<UnitMeasure>(initialData?.unitMeasure || 'UN');
  const [barcodesInput, setBarcodesInput] = useState(initialData?.barcodes?.join(', ') || '');
  const [costPrice, setCostPrice] = useState(initialData ? (initialData.costPriceCents / 100).toFixed(2) : '0.00');
  const [retailPrice, setRetailPrice] = useState(initialData ? (initialData.retailPriceCents / 100).toFixed(2) : '0.00');
  const [minStock, setMinStock] = useState(initialData?.minStock ?? 10);
  const [maxStock, setMaxStock] = useState(initialData?.maxStock ?? 100);
  const [initialStock, setInitialStock] = useState(0);
  const [isWeighable, setIsWeighable] = useState(initialData?.isWeighable || false);

  // Faixas de Atacado
  const [tierPrices, setTierPrices] = useState<TierPrice[]>(initialData?.tierPrices || []);
  const [tierQty, setTierQty] = useState('');
  const [tierPriceVal, setTierPriceVal] = useState('');

  const parseCents = (val: string) => {
    const num = parseFloat(val.replace(',', '.'));
    return isNaN(num) ? 0 : Math.round(num * 100);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const retailCents = parseCents(retailPrice);
    if (retailCents <= 0) {
      alert('O preço de venda no varejo deve ser maior que zero.');
      return;
    }

    const barcodes = barcodesInput
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    onSave({
      name: name.trim(),
      internalCode: internalCode.trim() || `COD-${Math.floor(1000 + Math.random() * 9000)}`,
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
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-textMain text-base">
              {initialData ? 'Editar Produto' : 'Cadastrar Novo Produto'}
            </h3>
            <p className="text-xs text-textMuted">Configuração cadastral, preços por quantidade e limites de estoque.</p>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* NOME E CÓDIGO INTERNO */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome do Produto *</label>
              <input
                type="text"
                required
                placeholder="Ex: Arroz 5kg Tipo 1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Cód. Interno *</label>
              <input
                type="text"
                required
                placeholder="Ex: 00101"
                value={internalCode}
                onChange={(e) => setInternalCode(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* CÓDIGOS DE BARRAS, CATEGORIA E UNIDADE */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Código de Barras (EAN)</label>
              <input
                type="text"
                placeholder="Separe por vírgula..."
                value={barcodesInput}
                onChange={(e) => setBarcodesInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Categoria</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Unidade de Medida</label>
              <select
                value={unitMeasure}
                onChange={(e) => setUnitMeasure(e.target.value as UnitMeasure)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="UN">UN (Unidade)</option>
                <option value="KG">KG (Quilograma)</option>
                <option value="LT">LT (Litro)</option>
                <option value="CX">CX (Caixa)</option>
                <option value="MT">MT (Metro)</option>
              </select>
            </div>
          </div>

          {/* PREÇOS (CUSTO X VAREJO) */}
          <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Preço de Custo (R$)</label>
              <input
                type="number"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-primary uppercase mb-1">Preço Venda Varejo (R$) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                className="w-full px-3 py-2 border border-primary/40 rounded-lg text-sm font-mono font-bold text-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* FAIXAS DE ATACADO POR QUANTIDADE */}
          <div className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-primary uppercase flex items-center space-x-1.5">
                <Tag className="w-4 h-4" />
                <span>Preços de Atacado por Volume</span>
              </span>
              <span className="text-[11px] text-textMuted">Aplicado automaticamente no PDV</span>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="number"
                placeholder="Qtd mínima (ex: 10)"
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
                className="w-1/3 bg-primary hover:bg-primary-hover text-white text-xs font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adicionar Faixa</span>
              </button>
            </div>

            {tierPrices.length > 0 && (
              <div className="space-y-1.5 mt-2">
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

          {/* LIMITES DE ESTOQUE */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Estoque Mínimo</label>
              <input
                type="number"
                value={minStock}
                onChange={(e) => setMinStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Estoque Máximo</label>
              <input
                type="number"
                value={maxStock}
                onChange={(e) => setMaxStock(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
              />
            </div>
            {!initialData && (
              <div>
                <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Saldo Inicial</label>
                <input
                  type="number"
                  value={initialStock}
                  onChange={(e) => setInitialStock(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* FLAG DE BALANÇA */}
          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="weighable"
              checked={isWeighable}
              onChange={(e) => setIsWeighable(e.target.checked)}
              className="rounded text-primary focus:ring-primary w-4 h-4"
            />
            <label htmlFor="weighable" className="text-xs font-medium text-textMain cursor-pointer">
              Produto pesado em balança (solicita tara/peso no checkout)
            </label>
          </div>

          {/* BOTÕES DE AÇÃO */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors"
            >
              {initialData ? 'Salvar Alterações' : 'Cadastrar Produto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}