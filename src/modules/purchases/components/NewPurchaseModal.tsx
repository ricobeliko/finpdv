import React, { useState } from 'react';
import { X, Plus, Trash2, PackagePlus, DollarSign } from 'lucide-react';
import { Product } from '../../products/types';
import { PurchaseItem, Supplier } from '../types';

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

interface NewPurchaseModalProps {
  isOpen: boolean;
  suppliers: Supplier[];
  products: Product[];
  onClose: () => void;
  onConfirmPurchase: (purchaseData: {
    supplierId: string;
    supplierName: string;
    invoiceNumber: string;
    notes: string;
    items: PurchaseItem[];
    totalCents: number;
  }) => void;
}

export function NewPurchaseModal({
  isOpen,
  suppliers,
  products,
  onClose,
  onConfirmPurchase
}: NewPurchaseModalProps) {
  if (!isOpen) return null;

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [notes, setNotes] = useState('');

  // Linha temporária de produto a adicionar
  const [selectedProdId, setSelectedProdId] = useState(products[0]?.id || '');
  const [itemQty, setItemQty] = useState('10');
  const [itemUnitCost, setItemUnitCost] = useState('');

  // Itens na Ordem de Compra
  const [items, setItems] = useState<PurchaseItem[]>([]);

  const selectedProductObj = products.find(p => p.id === selectedProdId);

  const handleAddItem = () => {
    if (!selectedProductObj) return;
    const qty = parseFloat(itemQty.replace(',', '.'));
    const costCents = parseToCents(itemUnitCost || (selectedProductObj.costPriceCents / 100));

    if (qty <= 0 || costCents <= 0) {
      alert('Quantidade e custo unitário devem ser maiores que zero.');
      return;
    }

    const totalCost = Math.round(qty * costCents);

    setItems(prev => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random()}`,
        productId: selectedProductObj.id,
        productName: selectedProductObj.name,
        internalCode: selectedProductObj.internalCode,
        unitMeasure: selectedProductObj.unitMeasure,
        quantity: qty,
        unitCostCents: costCents,
        totalCostCents: totalCost
      }
    ]);

    setItemQty('10');
    setItemUnitCost('');
  };

  const handleRemoveItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalPurchaseCents = items.reduce((sum, item) => sum + item.totalCostCents, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Adicione pelo menos um item à entrada de compras.');
      return;
    }

    const supplier = suppliers.find(s => s.id === supplierId);

    onConfirmPurchase({
      supplierId,
      supplierName: supplier ? supplier.tradeName : 'Fornecedor Avulso',
      invoiceNumber: invoiceNumber.trim() || 'S/N',
      notes: notes.trim(),
      items,
      totalCents: totalPurchaseCents
    });
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
              <PackagePlus className="w-5 h-5 text-primary" />
              <span>Entrada de Mercadorias (Pedido de Compra)</span>
            </h3>
            <p className="text-xs text-textMuted">Registra o recebimento, atualiza o custo e gera entrada no estoque.</p>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1 overflow-y-auto">
          {/* CABEÇALHO DO PEDIDO */}
          <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Fornecedor *</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.tradeName} ({s.document})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nº Nota Fiscal / Fatura</label>
              <input
                type="text"
                placeholder="Ex: NF-e 10420"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
              />
            </div>
          </div>

          {/* ÁREA DE ADIÇÃO DE PRODUTOS */}
          <div className="border border-emerald-200 bg-emerald-50/40 p-4 rounded-xl space-y-3">
            <span className="text-xs font-bold text-primary uppercase">Adicionar Itens à Entrada</span>
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Produto</label>
                <select
                  value={selectedProdId}
                  onChange={(e) => {
                    setSelectedProdId(e.target.value);
                    const prod = products.find(p => p.id === e.target.value);
                    if (prod) setItemUnitCost((prod.costPriceCents / 100).toFixed(2));
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-surface"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.internalCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Qtd.</label>
                <input
                  type="number"
                  step="0.01"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="col-span-3">
                <label className="block text-[11px] font-semibold text-textMuted uppercase mb-1">Novo Custo Unit. (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder={selectedProductObj ? (selectedProductObj.costPriceCents / 100).toFixed(2) : '0.00'}
                  value={itemUnitCost}
                  onChange={(e) => setItemUnitCost(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                />
              </div>

              <div className="col-span-2">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full bg-primary hover:bg-primary-hover text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Inserir</span>
                </button>
              </div>
            </div>
          </div>

          {/* TABELA DE ITENS DA COMPRA */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center text-xs font-bold text-textMuted uppercase">
              <span>Itens da Nota ({items.length})</span>
              <span>Total da Compra: {formatBRL(totalPurchaseCents)}</span>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-center py-8 text-xs text-textMuted font-sans">Nenhum item adicionado ainda.</p>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Qtd</th>
                      <th className="px-3 py-2 text-right">Custo Unit</th>
                      <th className="px-3 py-2 text-right">Subtotal</th>
                      <th className="px-3 py-2 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {items.map((it, idx) => (
                      <tr key={it.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-sans font-medium">{it.productName}</td>
                        <td className="px-3 py-2 text-center font-bold">{it.quantity} {it.unitMeasure}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(it.unitCostCents)}</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">{formatBRL(it.totalCostCents)}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Observações da Compra</label>
            <input
              type="text"
              placeholder="Ex: Condição 30 dias boleto / Lote recebido sem avarias"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={items.length === 0}
              className="bg-primary hover:bg-primary-hover disabled:bg-slate-300 text-white px-6 py-2.5 rounded-xl text-xs font-bold shadow-sm"
            >
              Confirmar Recebimento & Entrada de Estoque
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}