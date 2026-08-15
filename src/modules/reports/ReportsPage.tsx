import React, { useState, useMemo, useEffect } from 'react';
import { 
  BarChart3, 
  DollarSign, 
  Boxes, 
  ArrowLeftRight, 
  Printer, 
  PieChart,
  Tag
} from 'lucide-react';
import { ReportPeriod } from './types';
import { loadClosedCashSessionsDb, loadSalesDb } from '../../core/database/db';
import { useProductStore } from '../products/productStore';

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'SALES' | 'PRODUCTS' | 'CASH'>('SALES');
  const [period, setPeriod] = useState<ReportPeriod>('TODAY');
  const [salesList, setSalesList] = useState<any[]>([]);
  const [cashSessionsHistory, setCashSessionsHistory] = useState<any[]>([]);
  const { products } = useProductStore();

  useEffect(() => {
    async function loadData() {
      const sales = await loadSalesDb();
      setSalesList(sales);
      const sessions = await loadClosedCashSessionsDb();
      setCashSessionsHistory(sessions);
    }
    loadData();
  }, [activeTab]);

  const salesSummary = useMemo(() => {
    let grossCents = 0;
    let discountCents = 0;
    let netCents = 0;

    let byMethodMap: Record<string, { amount: number; count: number }> = {
      CASH: { amount: 0, count: 0 },
      PIX: { amount: 0, count: 0 },
      DEBIT: { amount: 0, count: 0 },
      CREDIT: { amount: 0, count: 0 },
    };

    salesList.forEach(s => {
      grossCents += s.subtotal_cents || 0;
      discountCents += s.discount_cents || 0;
      netCents += s.total_cents || 0;

      const m = s.payment_method || 'CASH';
      if (!byMethodMap[m]) byMethodMap[m] = { amount: 0, count: 0 };
      byMethodMap[m].amount += s.total_cents || 0;
      byMethodMap[m].count += 1;
    });

    const salesCount = salesList.length;
    const avgTicket = salesCount > 0 ? Math.round(netCents / salesCount) : 0;
    const estimatedCost = Math.round(netCents * 0.65);
    const estimatedProfit = netCents - estimatedCost;

    const byPaymentMethod = Object.entries(byMethodMap).map(([k, v]) => ({
      method: k === 'CASH' ? 'Dinheiro' : k === 'PIX' ? 'PIX' : k === 'DEBIT' ? 'Débito' : 'Crédito',
      amountCents: v.amount,
      count: v.count,
      percentage: netCents > 0 ? Math.round((v.amount / netCents) * 100) : 0
    }));

    return {
      grossCents,
      discountCents,
      netCents,
      salesCount,
      avgTicket,
      estimatedProfit,
      byPaymentMethod,
    };
  }, [salesList]);

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* HEADER DO MÓDULO */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('SALES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'SALES' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Desempenho de Vendas ({salesList.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('PRODUCTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'PRODUCTS' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Estoque & Produtos ({products.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('CASH')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'CASH' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Fechamentos de Caixa ({cashSessionsHistory.length})</span>
          </button>
        </div>

        <button
          onClick={() => window.print()}
          className="p-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center space-x-1"
          title="Imprimir Relatório"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ABA 1: VENDAS REAIS */}
      {activeTab === 'SALES' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
          <div className="grid grid-cols-4 gap-3 shrink-0">
            <div className="bg-surface p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-textMuted uppercase">Faturamento Líquido Real</span>
              <p className="text-2xl font-mono font-bold text-primary mt-0.5">{formatBRL(salesSummary.netCents)}</p>
              <p className="text-[11px] text-textMuted mt-1">Bruto: {formatBRL(salesSummary.grossCents)}</p>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-textMuted uppercase">Lucro Estimado</span>
              <p className="text-2xl font-mono font-bold text-emerald-700 mt-0.5">{formatBRL(salesSummary.estimatedProfit)}</p>
              <p className="text-[11px] text-emerald-800 mt-1 font-semibold">Margem média: ~35%</p>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-textMuted uppercase">Cupons Emitidos</span>
              <p className="text-2xl font-mono font-bold text-textMain mt-0.5">{salesSummary.salesCount} vendas</p>
              <p className="text-[11px] text-textMuted mt-1">Total de atendimentos</p>
            </div>

            <div className="bg-surface p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[10px] font-bold text-textMuted uppercase">Ticket Médio</span>
              <p className="text-2xl font-mono font-bold text-slate-800 mt-0.5">{formatBRL(salesSummary.avgTicket)}</p>
              <p className="text-[11px] text-textMuted mt-1">Média por cliente</p>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-4 flex-1">
            <div className="col-span-6 bg-surface rounded-xl border border-slate-200 p-4 shadow-sm">
              <span className="text-xs font-bold text-textMain uppercase tracking-wider flex items-center space-x-1.5">
                <PieChart className="w-4 h-4 text-primary" />
                <span>Vendas por Meio de Pagamento</span>
              </span>

              <div className="space-y-3 mt-4">
                {salesSummary.byPaymentMethod.map(pm => (
                  <div key={pm.method} className="space-y-1">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-slate-700">{pm.method} ({pm.count}x)</span>
                      <span className="font-mono font-bold">{formatBRL(pm.amountCents)} ({pm.percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${pm.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-6 bg-surface rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col">
              <span className="text-xs font-bold text-textMain uppercase tracking-wider flex items-center space-x-1.5 mb-3">
                <Tag className="w-4 h-4 text-primary" />
                <span>Últimas Vendas Registradas</span>
              </span>
              <div className="flex-1 overflow-y-auto max-h-56 divide-y divide-slate-100 font-mono text-xs">
                {salesList.length === 0 ? (
                  <p className="text-center text-textMuted py-8">Nenhuma venda realizada.</p>
                ) : (
                  salesList.slice(0, 10).map(s => (
                    <div key={s.id} className="py-2 flex justify-between">
                      <div>
                        <span className="font-bold text-slate-800">{s.id}</span>
                        <span className="text-textMuted text-[10px] block">{s.created_at} • {s.customer_name}</span>
                      </div>
                      <span className="font-bold text-primary">{formatBRL(s.total_cents)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: PRODUTOS */}
      {activeTab === 'PRODUCTS' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-textMain uppercase tracking-wider">Estoque Real em Banco de Dados</span>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Cód.</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-center">Estoque Atual</th>
                  <th className="px-4 py-3 text-right">Custo</th>
                  <th className="px-4 py-3 text-right">Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {products.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-700">{p.internalCode}</td>
                    <td className="px-4 py-3 font-sans font-semibold text-textMain">{p.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        p.currentStock <= p.minStock ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.currentStock} {p.unitMeasure}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatBRL(p.costPriceCents)}</td>
                    <td className="px-4 py-3 text-right font-bold text-primary">{formatBRL(p.retailPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: FECHAMENTOS REAIS DE CAIXA */}
      {activeTab === 'CASH' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-textMain uppercase tracking-wider">Histórico Real de Fechamentos</span>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Sessão</th>
                  <th className="px-4 py-3 font-sans">Operador</th>
                  <th className="px-4 py-3">Abertura / Fechamento</th>
                  <th className="px-4 py-3 text-right">Fundo Inicial</th>
                  <th className="px-4 py-3 text-right">Vendas Dinheiro</th>
                  <th className="px-4 py-3 text-right">Sangrias</th>
                  <th className="px-4 py-3 text-center">Diferença (Quebra/Sobra)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashSessionsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-textMuted font-sans">
                      Nenhum fechamento registrado no banco de dados.
                    </td>
                  </tr>
                ) : (
                  cashSessionsHistory.map(cs => (
                    <tr key={cs.sessionId} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-bold text-slate-700">{cs.sessionId}</td>
                      <td className="px-4 py-3 font-sans text-slate-800 font-medium">{cs.userName}</td>
                      <td className="px-4 py-3 text-textMuted text-[11px]">
                        {cs.openedAt} → {cs.closedAt}
                      </td>
                      <td className="px-4 py-3 text-right">{formatBRL(cs.initialAmountCents)}</td>
                      <td className="px-4 py-3 text-right font-bold text-primary">+{formatBRL(cs.salesCashCents)}</td>
                      <td className="px-4 py-3 text-right font-bold text-danger">-{formatBRL(cs.withdrawsCents)}</td>
                      <td className="px-4 py-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                          cs.differenceCents === 0 ? 'bg-emerald-100 text-emerald-800' :
                          cs.differenceCents > 0 ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {cs.differenceCents === 0 ? 'Exato (R$ 0,00)' : cs.differenceCents > 0 ? `+${formatBRL(cs.differenceCents)} (Sobra)` : `${formatBRL(cs.differenceCents)} (Falta)`}
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
    </div>
  );
}