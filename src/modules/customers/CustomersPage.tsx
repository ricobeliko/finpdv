import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  DollarSign, 
  TrendingUp, 
  Edit3, 
  Eye, 
  CheckCircle2 
} from 'lucide-react';
import { Customer } from './types';
import { useCustomerStore } from './customerStore';
import { CustomerFormModal } from './components/CustomerFormModal';
import { CustomerDetailsModal } from './components/CustomerDetailsModal';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function CustomersPage() {
  const { customers, addCustomer, updateCustomer } = useCustomerStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);

  const metrics = useMemo(() => {
    const totalCount = customers.length;
    const activeCount = customers.filter(c => c.isActive).length;
    const totalSpent = customers.reduce((sum, c) => sum + c.totalSpentCents, 0);
    const totalPurchases = customers.reduce((sum, c) => sum + c.purchasesCount, 0);
    const avgTicket = totalPurchases > 0 ? Math.round(totalSpent / totalPurchases) : 0;

    return { totalCount, activeCount, totalSpent, avgTicket };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.document.includes(searchTerm) ||
      c.phone.includes(searchTerm)
    );
  }, [customers, searchTerm]);

  const handleSaveCustomer = (data: Omit<Customer, 'id' | 'totalSpentCents' | 'purchasesCount' | 'createdAt'>) => {
    if (editingCustomer) {
      updateCustomer(editingCustomer.id, data);
    } else {
      addCustomer(data);
    }
    setIsFormModalOpen(false);
    setEditingCustomer(null);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* HEADER DO MÓDULO */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-sm text-textMain leading-tight">Gestão de Clientes</h2>
            <p className="text-[11px] text-textMuted">Base sincronizada em tempo real com o PDV.</p>
          </div>
        </div>

        <button
          onClick={() => {
            setEditingCustomer(null);
            setIsFormModalOpen(true);
          }}
          className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          <span>Novo Cliente</span>
        </button>
      </div>

      {/* CARDS DE RESUMO */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase">Clientes Registrados</p>
            <p className="text-xl font-bold text-textMain mt-0.5">{metrics.totalCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase">Cadastros Ativos</p>
            <p className="text-xl font-bold text-emerald-700 mt-0.5">{metrics.activeCount}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase">Total Vendido Identificado</p>
            <p className="text-base font-bold text-primary mt-0.5">{formatBRL(metrics.totalSpent)}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-surface p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-textMuted uppercase">Ticket Médio Identificado</p>
            <p className="text-base font-bold text-emerald-700 mt-0.5">{formatBRL(metrics.avgTicket)}</p>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-primary flex items-center justify-center">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* BARRA DE PESQUISA */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center shrink-0">
        <Search className="w-4 h-4 text-textMuted mr-2" />
        <input
          type="text"
          placeholder="Buscar cliente por nome, CPF/CNPJ ou telefone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs focus:outline-none text-textMain"
        />
      </div>

      {/* TABELA DE CLIENTES */}
      <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3 text-center">Compras</th>
                <th className="px-4 py-3 text-right">Total Gasto</th>
                <th className="px-4 py-3 text-center">Última Compra</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-textMuted font-sans">
                    Nenhum cliente localizado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-textMain">{c.name}</span>
                        {!c.isActive && (
                          <span className="text-[9px] bg-red-100 text-red-700 px-1 py-0.2 rounded font-bold">INATIVO</span>
                        )}
                      </div>
                      <p className="text-[10px] text-textMuted truncate max-w-xs">{c.address || 'Sem endereço'}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.document || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">{c.phone || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="bg-slate-100 font-bold px-2 py-0.5 rounded text-slate-800">
                        {c.purchasesCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-primary">{formatBRL(c.totalSpentCents)}</td>
                    <td className="px-4 py-3 text-center text-textMuted">{c.lastPurchaseDate || 'Sem compras'}</td>
                    <td className="px-4 py-3 text-right font-sans">
                      <div className="inline-flex items-center space-x-1">
                        <button
                          onClick={() => setViewingCustomer(c)}
                          title="Ver Histórico de Compras"
                          className="p-1.5 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingCustomer(c);
                            setIsFormModalOpen(true);
                          }}
                          title="Editar Cadastro"
                          className="p-1.5 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CustomerFormModal
        isOpen={isFormModalOpen}
        initialData={editingCustomer}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingCustomer(null);
        }}
        onSave={handleSaveCustomer}
      />

      <CustomerDetailsModal
        customer={viewingCustomer}
        onClose={() => setViewingCustomer(null)}
      />
    </div>
  );
}