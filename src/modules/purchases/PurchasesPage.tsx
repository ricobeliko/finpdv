import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Receipt, 
  Plus, 
  Search, 
  DollarSign, 
  X
} from 'lucide-react';
import { Product } from '../products/types';
import { PurchaseOrder, Supplier } from './types';
import { SupplierFormModal } from './components/SupplierFormModal';
import { NewPurchaseModal } from './components/NewPurchaseModal';
import { useProductStore } from '../products/productStore';
import { loadSuppliersDb, saveSupplierDb, loadPurchasesDb, savePurchaseDb } from '../../core/database/db';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function PurchasesPage() {
  const [activeTab, setActiveTab] = useState<'PURCHASES' | 'SUPPLIERS'>('PURCHASES');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  
  const { products, adjustStock } = useProductStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseOrder | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [loadedSuppliers, loadedPurchases] = await Promise.all([
          loadSuppliersDb(),
          loadPurchasesDb()
        ]);
        setSuppliers(loadedSuppliers || []);
        setPurchases(loadedPurchases || []);
      } catch (err) {
        console.error('Erro ao carregar compras e fornecedores:', err);
      }
    }
    loadData();
  }, []);

  // Total acumulado em compras
  const totalPurchasesVolume = purchases.reduce((sum, p) => sum + p.totalCents, 0);

  // SALVAR FORNECEDOR
  const handleSaveSupplier = async (data: Omit<Supplier, 'id' | 'createdAt'>) => {
    const newSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      ...data,
      createdAt: new Date().toLocaleDateString('pt-BR')
    };
    setSuppliers(prev => [newSupplier, ...prev]);
    setIsSupplierModalOpen(false);

    try {
      await saveSupplierDb(newSupplier);
    } catch (err) {
      console.error('Erro ao persistir fornecedor:', err);
    }
  };

  // CONFIRMAR ENTRADA DE COMPRA
  const handleConfirmPurchase = async (data: {
    supplierId: string;
    supplierName: string;
    invoiceNumber: string;
    notes: string;
    items: any[];
    totalCents: number;
  }) => {
    const orderNum = `COMPRA-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toLocaleString('pt-BR');

    const newOrder: PurchaseOrder = {
      id: `po-${Date.now()}`,
      orderNumber: orderNum,
      supplierId: data.supplierId,
      supplierName: data.supplierName,
      status: 'RECEIVED',
      items: data.items,
      totalCents: data.totalCents,
      receivedAt: now,
      invoiceNumber: data.invoiceNumber,
      notes: data.notes
    };

    // 1. Grava no histórico de ordens de compra
    setPurchases(prev => [newOrder, ...prev]);

    try {
      await savePurchaseDb(newOrder);
    } catch (err) {
      console.error('Erro ao salvar compra no SQLite:', err);
    }

    // 2. Atualiza estoque no banco de dados e na memória
    for (const item of data.items) {
      await adjustStock(
        item.productId,
        'PURCHASE',
        item.quantity,
        'Entrada por Compra',
        `Nota Fiscal ${data.invoiceNumber || orderNum}`
      );
    }

    setIsPurchaseModalOpen(false);
  };

  const filteredPurchases = purchases.filter(p =>
    p.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSuppliers = suppliers.filter(s =>
    s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.document.includes(searchTerm)
  );

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* HEADER DO MÓDULO */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('PURCHASES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'PURCHASES' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Entradas & Pedidos de Compra ({purchases.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('SUPPLIERS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'SUPPLIERS' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Fornecedores Cadastrados ({suppliers.length})</span>
          </button>
        </div>

        {activeTab === 'PURCHASES' && (
          <button
            onClick={() => setIsPurchaseModalOpen(true)}
            className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Entrada de Compra</span>
          </button>
        )}

        {activeTab === 'SUPPLIERS' && (
          <button
            onClick={() => setIsSupplierModalOpen(true)}
            className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Fornecedor</span>
          </button>
        )}
      </div>

      {/* BARRA DE PESQUISA E RESUMO */}
      <div className="grid grid-cols-12 gap-3 shrink-0">
        <div className="col-span-8 bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center">
          <Search className="w-4 h-4 text-textMuted mr-2" />
          <input
            type="text"
            placeholder={activeTab === 'PURCHASES' ? "Buscar por pedido, fornecedor ou nota..." : "Buscar por razão social, nome fantasia ou CNPJ..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs focus:outline-none text-textMain"
          />
        </div>

        <div className="col-span-4 bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-textMuted uppercase">Volume Total Comprado</span>
            <p className="text-base font-mono font-bold text-primary mt-0.5">{formatBRL(totalPurchasesVolume)}</p>
          </div>
          <DollarSign className="w-6 h-6 text-emerald-600/30" />
        </div>
      </div>

      {/* TABELA: COMPRAS */}
      {activeTab === 'PURCHASES' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="px-4 py-3">Nº Pedido</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Nº Documento / Nota</th>
                  <th className="px-4 py-3">Data Recebimento</th>
                  <th className="px-4 py-3 text-center">Qtd. Itens</th>
                  <th className="px-4 py-3 text-right">Valor Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-sans text-xs">
                      Nenhuma entrada de compra registrada.
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPurchase(p)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-bold text-slate-700">{p.orderNumber}</td>
                      <td className="px-4 py-3 font-sans font-semibold text-textMain">{p.supplierName}</td>
                      <td className="px-4 py-3 text-textMuted">{p.invoiceNumber || 'S/N'}</td>
                      <td className="px-4 py-3 text-textMuted">{p.receivedAt}</td>
                      <td className="px-4 py-3 text-center">{p.items.length} itens</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">{formatBRL(p.totalCents)}</td>
                      <td className="px-4 py-3 text-center font-sans">
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px]">
                          RECEBIDO
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TABELA: FORNECEDORES */}
      {activeTab === 'SUPPLIERS' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                <tr>
                  <th className="px-4 py-3">Nome Fantasia / Razão Social</th>
                  <th className="px-4 py-3">CNPJ / CPF</th>
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">E-mail</th>
                  <th className="px-4 py-3 text-center">Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSuppliers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-slate-400 font-sans text-xs">
                      Nenhum fornecedor cadastrado.
                    </td>
                  </tr>
                ) : (
                  filteredSuppliers.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-sans">
                        <p className="font-bold text-textMain">{s.tradeName}</p>
                        <p className="text-[10px] text-textMuted">{s.companyName}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.document}</td>
                      <td className="px-4 py-3 font-sans text-slate-700">{s.contactName || '-'}</td>
                      <td className="px-4 py-3 text-slate-700">{s.phone || '-'}</td>
                      <td className="px-4 py-3 font-sans text-textMuted">{s.email || '-'}</td>
                      <td className="px-4 py-3 text-center text-textMuted">{s.createdAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: NOVO FORNECEDOR */}
      <SupplierFormModal
        isOpen={isSupplierModalOpen}
        onClose={() => setIsSupplierModalOpen(false)}
        onSave={handleSaveSupplier}
      />

      {/* MODAL: NOVA ENTRADA DE COMPRA */}
      <NewPurchaseModal
        isOpen={isPurchaseModalOpen}
        suppliers={suppliers}
        products={products}
        onClose={() => setIsPurchaseModalOpen(false)}
        onConfirmPurchase={handleConfirmPurchase}
      />

      {/* MODAL: DETALHES DO PEDIDO RECEBIDO */}
      {selectedPurchase && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-textMain text-base">Detalhes da Entrada: {selectedPurchase.orderNumber}</h3>
                <p className="text-xs text-textMuted">{selectedPurchase.supplierName} • {selectedPurchase.receivedAt}</p>
              </div>
              <button onClick={() => setSelectedPurchase(null)} className="text-textMuted hover:text-textMain p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto font-mono text-xs">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="flex justify-between"><span>Nota Fiscal:</span><span className="font-bold">{selectedPurchase.invoiceNumber}</span></div>
                <div className="flex justify-between"><span>Status:</span><span className="text-primary font-bold">{selectedPurchase.status}</span></div>
                {selectedPurchase.notes && <div className="text-textMuted pt-1 font-sans">Obs: {selectedPurchase.notes}</div>}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] text-textMuted uppercase">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2 text-center">Qtd</th>
                      <th className="px-3 py-2 text-right">Custo Unit</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPurchase.items.map(it => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-sans font-medium">{it.productName}</td>
                        <td className="px-3 py-2 text-center font-bold">{it.quantity} {it.unitMeasure}</td>
                        <td className="px-3 py-2 text-right">{formatBRL(it.unitCostCents)}</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">{formatBRL(it.totalCostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-200 font-sans">
                <span>Total da Nota:</span>
                <span className="text-primary font-mono">{formatBRL(selectedPurchase.totalCents)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}