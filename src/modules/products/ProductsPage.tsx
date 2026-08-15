import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package, 
  Boxes, 
  History, 
  Tags, 
  Search, 
  Plus, 
  AlertTriangle, 
  AlertOctagon, 
  DollarSign, 
  TrendingUp, 
  Edit3, 
  ArrowLeftRight,
  Barcode,
  FileUp
} from 'lucide-react';
import { useProductStore } from './productStore';
import { Category, MovementType, Product } from './types';
import { ProductFormModal } from './components/ProductFormModal';
import { StockAdjustmentModal } from './components/StockAdjustmentModal';
import { CategoryModal } from './components/CategoryModal';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function ProductsPage() {
  const { 
    products, 
    categories, 
    movements, 
    loadFromDb, 
    saveProduct, 
    adjustStock, 
    importFromCsv 
  } = useProductStore();

  useEffect(() => {
    loadFromDb();
  }, []);

  const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'MOVEMENTS' | 'CATEGORIES'>('PRODUCTS');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockAdjustProduct, setStockAdjustProduct] = useState<Product | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  // IMPORTAÇÃO DE PLANILHA DO NEX
  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const total = await importFromCsv(text);
    alert(`Importação concluída! ${total} produtos cadastrados no banco.`);
  };

  // RESUMO DE ESTOQUE
  const stockSummary = useMemo(() => {
    let lowCount = 0;
    let outCount = 0;
    let totalCost = 0;
    let totalRetail = 0;

    products.forEach(p => {
      if (p.currentStock <= 0) outCount++;
      else if (p.currentStock <= p.minStock) lowCount++;
      totalCost += p.currentStock * p.costPriceCents;
      totalRetail += p.currentStock * p.retailPriceCents;
    });

    return {
      totalProducts: products.length,
      lowStock: lowCount,
      outOfStock: outCount,
      totalInventoryCost: totalCost,
      totalInventoryRetail: totalRetail
    };
  }, [products]);

  // FILTRAGEM
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.internalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcodes.some(b => b.includes(searchTerm));

      const matchCategory = selectedCategory === 'ALL' || p.categoryId === selectedCategory;

      let matchStock = true;
      if (stockFilter === 'LOW') matchStock = p.currentStock > 0 && p.currentStock <= p.minStock;
      if (stockFilter === 'OUT') matchStock = p.currentStock <= 0;

      return matchSearch && matchCategory && matchStock;
    });
  }, [products, searchTerm, selectedCategory, stockFilter]);

  // SALVAR PRODUTO NO BANCO E STORE
  const handleSaveProduct = async (formData: any) => {
    await saveProduct({
      ...formData,
      id: editingProduct ? editingProduct.id : undefined
    });
    setIsProductModalOpen(false);
    setEditingProduct(null);
  };

  // AJUSTE DE ESTOQUE
  const handleExecuteStockAdjustment = async (data: { type: MovementType; quantity: number; reason: string; notes: string }) => {
    if (!stockAdjustProduct) return;
    await adjustStock(stockAdjustProduct.id, data.type, data.quantity, data.reason, data.notes);
    setIsStockModalOpen(false);
    setStockAdjustProduct(null);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* HEADER DE ABAS */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'PRODUCTS' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Itens Cadastrados ({products.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('MOVEMENTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'MOVEMENTS' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Livro Razão ({movements.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('CATEGORIES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'CATEGORIES' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Tags className="w-3.5 h-3.5" />
            <span>Departamentos ({categories.length})</span>
          </button>
        </div>

        {activeTab === 'PRODUCTS' && (
          <div className="flex items-center space-x-2">
            <label className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm cursor-pointer transition-colors">
              <FileUp className="w-4 h-4 text-emerald-400" />
              <span>Importar do Nex (CSV)</span>
              <input
                type="file"
                accept=".csv, .txt"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>

            <button
              onClick={() => {
                setEditingProduct(null);
                setIsProductModalOpen(true);
              }}
              className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Produto</span>
            </button>
          </div>
        )}

        {activeTab === 'CATEGORIES' && (
          <button
            onClick={() => setIsCategoryModalOpen(true)}
            className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Departamento</span>
          </button>
        )}
      </div>

      {/* ABA 1: PRODUTOS */}
      {activeTab === 'PRODUCTS' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          <div className="grid grid-cols-5 gap-3 shrink-0">
            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Total de Itens</p>
                <p className="text-xl font-bold text-textMain mt-0.5">{stockSummary.totalProducts}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Estoque Baixo</p>
                <p className="text-xl font-bold text-warning mt-0.5">{stockSummary.lowStock}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-warning flex items-center justify-center">
                <AlertTriangle className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Sem Estoque</p>
                <p className="text-xl font-bold text-danger mt-0.5">{stockSummary.outOfStock}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-red-50 text-danger flex items-center justify-center">
                <AlertOctagon className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Custo Total</p>
                <p className="text-base font-bold text-textMain mt-0.5">{formatBRL(stockSummary.totalInventoryCost)}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>

            <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-textMuted uppercase">Potencial Venda</p>
                <p className="text-base font-bold text-primary mt-0.5">{formatBRL(stockSummary.totalInventoryRetail)}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
          </div>

          <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3 shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-textMuted absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por nome, código interno ou código de barras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-surface text-textMain"
            >
              <option value="ALL">Todas as Categorias</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-surface text-textMain"
            >
              <option value="ALL">Todos os Níveis</option>
              <option value="LOW">Somente Estoque Baixo</option>
              <option value="OUT">Somente Zerados</option>
            </select>
          </div>

          <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-3 py-2.5">Cód.</th>
                    <th className="px-3 py-2.5">Produto / Barras</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5 text-right">Custo</th>
                    <th className="px-3 py-2.5 text-right">Venda Varejo</th>
                    <th className="px-3 py-2.5">Regras Atacado</th>
                    <th className="px-3 py-2.5 text-center">Estoque</th>
                    <th className="px-3 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredProducts.map(p => {
                    const cat = categories.find(c => c.id === p.categoryId);
                    const isLow = p.currentStock > 0 && p.currentStock <= p.minStock;
                    const isOut = p.currentStock <= 0;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-bold text-slate-700">{p.internalCode}</td>
                        <td className="px-3 py-2.5 font-sans">
                          <div className="font-bold text-textMain flex items-center space-x-1.5">
                            <span>{p.name}</span>
                            {p.isWeighable && (
                              <span className="bg-sky-100 text-sky-800 text-[9px] px-1 rounded font-bold border border-sky-200">
                                Balança ({p.unitMeasure})
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-textMuted font-mono flex items-center space-x-1 mt-0.5">
                            <Barcode className="w-3 h-3" />
                            <span>{p.barcodes.join(' | ') || 'Sem barras'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-textMuted font-sans">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700">
                            {cat?.name || 'Sem Categoria'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-500">{formatBRL(p.costPriceCents)}</td>
                        <td className="px-3 py-2.5 text-right font-bold text-primary">{formatBRL(p.retailPriceCents)}</td>
                        <td className="px-3 py-2.5">
                          {p.tierPrices.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {p.tierPrices.map((t, idx) => (
                                <span key={idx} className="bg-emerald-50 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                  ≥{t.minQuantity} un: {formatBRL(t.priceCents)}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-sans italic">Apenas varejo</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                            isOut ? 'bg-red-100 text-red-700' :
                            isLow ? 'bg-amber-100 text-amber-800' :
                            'bg-emerald-100 text-emerald-800'
                          }`}>
                            {p.currentStock} {p.unitMeasure}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex items-center space-x-1">
                            <button
                              onClick={() => {
                                setStockAdjustProduct(p);
                                setIsStockModalOpen(true);
                              }}
                              title="Ajustar Estoque"
                              className="p-1 text-slate-600 hover:text-primary hover:bg-slate-100 rounded"
                            >
                              <ArrowLeftRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setIsProductModalOpen(true);
                              }}
                              title="Editar Produto"
                              className="p-1 text-slate-600 hover:text-primary hover:bg-slate-100 rounded"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: LIVRO RAZÃO */}
      {activeTab === 'MOVEMENTS' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <span className="text-xs font-bold text-textMain uppercase tracking-wider">Histórico de Auditoria Imutável</span>
            <span className="text-[11px] text-textMuted font-mono">Total de Registros: {movements.length}</span>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2">Data/Hora</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2 text-center">Qtd.</th>
                  <th className="px-3 py-2 text-center">Saldo Anterior → Novo</th>
                  <th className="px-3 py-2">Operador</th>
                  <th className="px-3 py-2">Justificativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {movements.map(m => {
                  const isPositive = m.quantity > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-textMuted">{m.createdAt}</td>
                      <td className="px-3 py-2 font-sans font-bold">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          m.type === 'PURCHASE' ? 'bg-blue-100 text-blue-800' :
                          m.type === 'SALE' ? 'bg-emerald-100 text-emerald-800' :
                          m.type === 'ADJUST_IN' ? 'bg-indigo-100 text-indigo-800' :
                          m.type === 'ADJUST_OUT' ? 'bg-orange-100 text-orange-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {m.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-sans font-medium text-textMain">{m.productName}</td>
                      <td className="px-3 py-2 text-center font-bold">
                        <span className={isPositive ? 'text-primary' : 'text-danger'}>
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-slate-400">{m.previousBalance}</span>
                        <span className="mx-1 text-slate-300">→</span>
                        <span className="font-bold text-slate-800">{m.newBalance}</span>
                      </td>
                      <td className="px-3 py-2 font-sans text-slate-600">{m.userName}</td>
                      <td className="px-3 py-2 font-sans text-slate-600 italic">{m.notes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: DEPARTAMENTOS */}
      {activeTab === 'CATEGORIES' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-w-2xl">
          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-textMain uppercase tracking-wider">Departamentos Ativos</span>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-textMuted uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5">Nome do Departamento</th>
                  <th className="px-4 py-2.5 text-center">Itens Vinculados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map(c => {
                  const count = products.filter(p => p.categoryId === c.id).length;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-textMain">{c.name}</td>
                      <td className="px-4 py-3 text-center font-mono">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-bold">
                          {count} produtos
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAIS */}
      <ProductFormModal
        isOpen={isProductModalOpen}
        categories={categories}
        initialData={editingProduct}
        onClose={() => {
          setIsProductModalOpen(false);
          setEditingProduct(null);
        }}
        onSave={handleSaveProduct}
      />

      {stockAdjustProduct && (
        <StockAdjustmentModal
          isOpen={isStockModalOpen}
          product={stockAdjustProduct}
          onClose={() => {
            setIsStockModalOpen(false);
            setStockAdjustProduct(null);
          }}
          onConfirm={handleExecuteStockAdjustment}
        />
      )}

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        onSave={(name) => {
          setIsCategoryModalOpen(false);
        }}
      />
    </div>
  );
}