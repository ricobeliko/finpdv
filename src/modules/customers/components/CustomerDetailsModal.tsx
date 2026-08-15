import React from 'react';
import { X, ShoppingCart, Calendar, Phone, MapPin, FileText, DollarSign, Award } from 'lucide-react';
import { Customer } from '../types';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

interface CustomerDetailsModalProps {
  customer: Customer | null;
  onClose: () => void;
}

export function CustomerDetailsModal({ customer, onClose }: CustomerDetailsModalProps) {
  if (!customer) return null;

  const avgTicketCents = customer.purchasesCount > 0 
    ? Math.round(customer.totalSpentCents / customer.purchasesCount) 
    : 0;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-textMain text-base">{customer.name}</h3>
            <p className="text-xs text-textMuted font-mono">Doc: {customer.document || 'Não informado'}</p>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 flex-1 overflow-y-auto">
          {/* CARDS DE CONSUMO DO CLIENTE */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-textMuted uppercase">Total Comprado</span>
              <p className="text-lg font-mono font-bold text-primary mt-0.5">{formatBRL(customer.totalSpentCents)}</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-textMuted uppercase">Total de Compras</span>
              <p className="text-lg font-mono font-bold text-slate-800 mt-0.5">{customer.purchasesCount} vendas</p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <span className="text-[10px] font-bold text-textMuted uppercase">Ticket Médio</span>
              <p className="text-lg font-mono font-bold text-emerald-700 mt-0.5">{formatBRL(avgTicketCents)}</p>
            </div>
          </div>

          {/* INFORMAÇÕES DE CADASTRO */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs text-slate-700">
            <div className="flex items-center space-x-2">
              <Phone className="w-3.5 h-3.5 text-textMuted" />
              <span>{customer.phone || 'Sem telefone informado'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <MapPin className="w-3.5 h-3.5 text-textMuted" />
              <span>{customer.address || 'Sem endereço cadastrado'}</span>
            </div>
            {customer.notes && (
              <div className="flex items-start space-x-2 pt-1 border-t border-slate-200 text-textMuted italic">
                <FileText className="w-3.5 h-3.5 mt-0.5" />
                <span>Obs: {customer.notes}</span>
              </div>
            )}
          </div>

          {/* HISTÓRICO DE COMPRAS */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-textMain flex items-center space-x-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              <span>Histórico Recente de Compras</span>
            </div>

            <div className="max-h-48 overflow-y-auto">
              {!customer.purchasesHistory || customer.purchasesHistory.length === 0 ? (
                <p className="text-center py-8 text-xs text-textMuted font-sans">Nenhuma compra registrada para este cliente.</p>
              ) : (
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Cupom</th>
                      <th className="px-3 py-2">Data/Hora</th>
                      <th className="px-3 py-2 text-center">Itens</th>
                      <th className="px-3 py-2">Pagamento</th>
                      <th className="px-3 py-2 text-right">Valor Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customer.purchasesHistory.map(h => (
                      <tr key={h.saleId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-bold text-slate-700">{h.saleId}</td>
                        <td className="px-3 py-2 text-textMuted">{h.date}</td>
                        <td className="px-3 py-2 text-center">{h.itemsCount} un</td>
                        <td className="px-3 py-2 font-sans font-medium text-slate-700">{h.paymentMethod}</td>
                        <td className="px-3 py-2 text-right font-bold text-primary">{formatBRL(h.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}