import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  DollarSign, 
  Boxes, 
  RotateCcw, 
  Printer,
  CalendarDays,
  TrendingUp,
  Calendar,
  AlertTriangle,
  X,
  Ban
} from 'lucide-react';
import { loadClosedCashSessionsDb, loadSalesDb, loadProductsFromDb, cancelSaleDb } from '../../core/database/db';
import { invoke } from '@tauri-apps/api/core';
import { getSelectedPrinter } from '../../core/utils/storageMigration';
import { Product } from '../products/types';
import { CashClosingSummary } from '../cash/types';
import { useCashStore } from '../cash/cashStore';
import { useUserStore } from '../users/userStore';
import { useProductStore } from '../products/productStore';
import { useCustomerStore } from '../customers/customerStore';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';

const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const formatBRL = (cents: number) => {
  return ((cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
};

const parseDateSafe = (dStr: any): Date => {
  if (!dStr) return new Date();
  if (dStr instanceof Date) return dStr;
  try {
    const str = String(dStr).trim();
    if (str.includes('/')) {
      const [datePart, timePart] = str.split(/[, ]+/);
      const [d, m, y] = datePart.split('/').map(Number);
      let hour = 0, min = 0, sec = 0;
      if (timePart && timePart.includes(':')) {
        [hour, min, sec] = timePart.split(':').map(Number);
      }
      return new Date(y, (m || 1) - 1, d || 1, hour || 0, min || 0, sec || 0);
    }
    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    return new Date();
  }
};

export function ReportsPage() {
  const [closedSessions, setClosedSessions] = useState<CashClosingSummary[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'CASH_CLOSINGS' | 'SALES' | 'INVENTORY'>('CASH_CLOSINGS');
  
  // Filtros de Ano e Mês em Abas
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  // Estado para Modal de Estorno de Venda e Toast
  const [selectedSaleForRefund, setSelectedSaleForRefund] = useState<any | null>(null);
  const [saleRefundReason, setSaleRefundReason] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'warning' | 'danger' } | null>(null);
  const isCancellingSaleRef = useRef(false);
  const { currentSession, initCash } = useCashStore();
  const { currentUser } = useUserStore();

  const refundTrapRef = useFocusTrap<HTMLDivElement>({
    isActive: !!selectedSaleForRefund,
    onEscape: () => setSelectedSaleForRefund(null)
  });

  const showToast = (msg: string, type: 'success' | 'warning' | 'danger' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [sessionsData, salesData, prodsData] = await Promise.all([
          loadClosedCashSessionsDb().catch(() => []),
          loadSalesDb().catch(() => []),
          loadProductsFromDb().catch(() => [])
        ]);
        setClosedSessions(sessionsData || []);
        setSalesList(salesData || []);
        setProductsList(prodsData || []);

        if (sessionsData && sessionsData.length > 0) {
          const firstDate = parseDateSafe(sessionsData[0].closedAt || sessionsData[0].openedAt);
          setSelectedYear(String(firstDate.getFullYear()));
        }
      } catch (err) {
        console.error('Erro ao carregar dados do relatório:', err);
      }
    }
    loadData();
  }, []);

  // 1. LISTA DE ANOS DISPONÍVEIS
  const availableYears = useMemo(() => {
    const yearMap: { [year: string]: { year: string; count: number; totalCents: number } } = {};
    
    closedSessions.forEach(s => {
      const d = parseDateSafe(s.closedAt || s.openedAt);
      const y = String(d.getFullYear());
      if (!yearMap[y]) {
        yearMap[y] = { year: y, count: 0, totalCents: 0 };
      }
      yearMap[y].count += 1;
      yearMap[y].totalCents += (s.salesCashCents || 0);
    });

    return Object.values(yearMap).sort((a, b) => Number(b.year) - Number(a.year));
  }, [closedSessions]);

  // 2. LISTA DE MESES DISPONÍVEIS COM SIGLAS ABREVIADAS (JAN, FEV, MAR...)
  const availableMonths = useMemo(() => {
    const monthMap: { [key: string]: { key: string; monthNum: number; label: string; count: number; totalCents: number } } = {};

    closedSessions.forEach(s => {
      const d = parseDateSafe(s.closedAt || s.openedAt);
      const y = String(d.getFullYear());
      const mIdx = d.getMonth();
      const mNum = mIdx + 1;
      const mKey = selectedYear === 'ALL' ? `${y}-${String(mNum).padStart(2, '0')}` : String(mNum).padStart(2, '0');
      
      const abbr = MONTH_ABBR[mIdx] || `MÊS ${mNum}`;
      const label = selectedYear === 'ALL' ? `${abbr}/${y}` : abbr;

      if (selectedYear === 'ALL' || y === selectedYear) {
        if (!monthMap[mKey]) {
          monthMap[mKey] = {
            key: mKey,
            monthNum: mNum,
            label,
            count: 0,
            totalCents: 0
          };
        }
        monthMap[mKey].count += 1;
        monthMap[mKey].totalCents += (s.salesCashCents || 0);
      }
    });

    return Object.values(monthMap).sort((a, b) => {
      if (selectedYear === 'ALL') return b.key.localeCompare(a.key);
      return a.monthNum - b.monthNum;
    });
  }, [closedSessions, selectedYear]);

  // AO TROCAR O ANO, VOLTA PARA 'TODOS OS MESES' DO ANO SELECIONADO
  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    setSelectedMonth('ALL');
  };

  // 3. SESSÕES FILTRADAS PELO ANO E MÊS ATIVOS
  const filteredSessions = useMemo(() => {
    return closedSessions.filter(s => {
      const d = parseDateSafe(s.closedAt || s.openedAt);
      const y = String(d.getFullYear());
      const mNum = String(d.getMonth() + 1).padStart(2, '0');
      const y_m = `${y}-${mNum}`;

      if (selectedYear !== 'ALL' && y !== selectedYear) return false;
      if (selectedMonth !== 'ALL') {
        if (selectedYear === 'ALL') {
          if (y_m !== selectedMonth) return false;
        } else {
          if (mNum !== selectedMonth) return false;
        }
      }
      return true;
    });
  }, [closedSessions, selectedYear, selectedMonth]);

  // VENDAS FILTRADAS PELO ANO E MÊS ATIVOS
  const filteredSales = useMemo(() => {
    return salesList.filter(s => {
      const d = parseDateSafe(s.created_at || s.date);
      const y = String(d.getFullYear());
      const mNum = String(d.getMonth() + 1).padStart(2, '0');
      const y_m = `${y}-${mNum}`;

      if (selectedYear !== 'ALL' && y !== selectedYear) return false;
      if (selectedMonth !== 'ALL') {
        if (selectedYear === 'ALL') {
          if (y_m !== selectedMonth) return false;
        } else {
          if (mNum !== selectedMonth) return false;
        }
      }
      return true;
    });
  }, [salesList, selectedYear, selectedMonth]);

  // Vendas ativas (COMPLETED) para métricas de faturamento
  const activeSales = useMemo(() => {
    return filteredSales.filter(s => s.status === 'COMPLETED');
  }, [filteredSales]);


  const salesSummary = useMemo(() => {
    const totalCents = activeSales.reduce((sum, s) => sum + (s.total_cents || 0), 0);
    const count = activeSales.length;
    const avgTicketCents = count > 0 ? Math.round(totalCents / count) : 0;
    return { totalCents, count, avgTicketCents };
  }, [activeSales]);

  const handleConfirmSaleRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForRefund) return;
    if (isCancellingSaleRef.current) return;
    isCancellingSaleRef.current = true;

    try {
      await cancelSaleDb({
        saleId: selectedSaleForRefund.id,
        currentSessionId: currentSession?.isOpen ? currentSession.id : null,
        userId: currentUser?.id,
        userName: currentUser?.name,
        reason: saleRefundReason.trim() || 'Estorno via Relatórios'
      });

      showToast(`Venda #${selectedSaleForRefund.id} cancelada com sucesso!`, 'success');
      setSelectedSaleForRefund(null);
      setSaleRefundReason('');

      // Recarrega dados atualizados em modo somente leitura
      const [updatedSales, updatedProds] = await Promise.all([
        loadSalesDb().catch(() => []),
        loadProductsFromDb().catch(() => [])
      ]);
      setSalesList(updatedSales || []);
      setProductsList(updatedProds || []);

      try {
        await initCash();
        await useProductStore.getState().loadFromDb();
        await useCustomerStore.getState().loadFromDb();
      } catch (syncErr) {
        console.warn('Aviso: falha na sincronização pós-estorno:', syncErr);
      }
    } catch (err: any) {
      console.error('Erro ao cancelar venda:', err);
      showToast(err?.message || String(err) || 'Erro ao realizar cancelamento.', 'danger');
    } finally {
      isCancellingSaleRef.current = false;
    }
  };

  const handleReprintSale = async (saleId: string) => {
    const printer = getSelectedPrinter();
    if (!printer) {
      showToast('Nenhuma impressora térmica configurada nas preferências.', 'warning');
      return;
    }
    try {
      const res = await invoke<{ message: string }>('db_reprint_sale_receipt', {
        saleId,
        printerName: printer
      });
      showToast(res?.message || `Comprovante da venda #${saleId} reimpresso!`, 'success');
    } catch (err: any) {
      showToast(err?.message || String(err) || 'Erro ao reimprimir comprovante.', 'danger');
    }
  };


  // 4. TOTAL E MÉDIA DIÁRIA DOS DIAS COM VENDA
  const { selectedTotalCents, selectedDailyAvgCents, activeDaysCount } = useMemo(() => {
    const total = filteredSessions.reduce((acc, s) => acc + (s.salesCashCents || 0), 0);
    
    const uniqueDays = new Set<string>();
    filteredSessions.forEach(s => {
      const d = parseDateSafe(s.closedAt || s.openedAt);
      const dayKey = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      uniqueDays.add(dayKey);
    });

    const daysCount = Math.max(1, uniqueDays.size);
    const dailyAvg = Math.round(total / daysCount);

    return {
      selectedTotalCents: total,
      selectedDailyAvgCents: dailyAvg,
      activeDaysCount: uniqueDays.size
    };
  }, [filteredSessions]);

  return (
    <div className="h-full flex flex-col space-y-4">
      {toast && (
        <div className={`fixed top-16 right-6 z-50 px-4 py-2.5 rounded-lg shadow-xl text-white text-xs font-bold flex items-center space-x-2 border animate-fade-in ${
          toast.type === 'danger' ? 'bg-red-600 border-red-700' : toast.type === 'warning' ? 'bg-amber-600 border-amber-700' : 'bg-slate-800 border-slate-700'
        }`}>
          <span>{toast.msg}</span>
        </div>
      )}

      {/* BARRA SUPERIOR DE MÓDULOS */}
      <div className="bg-surface p-2.5 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('SALES')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'SALES' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Desempenho de Vendas ({salesList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('INVENTORY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'INVENTORY' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Estoque & Produtos ({productsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('CASH_CLOSINGS')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'CASH_CLOSINGS' 
                ? 'bg-primary text-white shadow-sm' 
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Fechamentos de Caixa ({closedSessions.length})</span>
          </button>
        </div>

        <button
          onClick={() => window.print()}
          className="p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow transition-colors"
          title="Imprimir"
        >
          <Printer className="w-4 h-4" />
        </button>
      </div>

      {/* ABA: FECHAMENTOS DE CAIXA */}
      {activeTab === 'CASH_CLOSINGS' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col p-5">
          {/* CABEÇALHO COM TÍTULO, MÉDIA E TOTAL */}
          <div className="flex flex-col space-y-3 pb-3 border-b border-slate-200 mb-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                HISTÓRICO REAL DE FECHAMENTOS
              </h2>
              
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg flex items-center space-x-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Média Diária:</span>
                  <strong className="text-emerald-700">{formatBRL(selectedDailyAvgCents)} / dia</strong>
                  <span className="text-[10px] text-slate-500 font-sans font-semibold">({activeDaysCount} {activeDaysCount === 1 ? 'dia' : 'dias'})</span>
                </span>

                <span className="text-xs font-mono font-bold text-primary bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                  Total do Período: {formatBRL(selectedTotalCents)}
                </span>
              </div>
            </div>

            {/* NÍVEL 1: ABAS DE ANOS */}
            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
              <button
                onClick={() => handleSelectYear('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                  selectedYear === 'ALL'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Todos os Anos</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedYear === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {closedSessions.length}
                </span>
              </button>

              {availableYears.map((y) => (
                <button
                  key={y.year}
                  onClick={() => handleSelectYear(y.year)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${
                    selectedYear === y.year
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{y.year}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedYear === y.year ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {y.count}
                  </span>
                </button>
              ))}
            </div>

            {/* NÍVEL 2: ABAS DE MESES ABREVIADOS (JAN, FEV, MAR...) */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-0.5">
              <button
                onClick={() => setSelectedMonth('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center space-x-1.5 border ${
                  selectedMonth === 'ALL'
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{selectedYear === 'ALL' ? 'Todos os Meses' : `Ano de ${selectedYear}`}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedMonth === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                  {filteredSessions.length}
                </span>
              </button>

              {availableMonths.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMonth(m.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center space-x-1.5 border ${
                    selectedMonth === m.key
                      ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="tracking-wide">{m.label}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedMonth === m.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    {m.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* TABELA DE FECHAMENTOS */}
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100 sticky top-0 bg-surface">
                <tr>
                  <th className="py-2.5 px-2">SESSÃO</th>
                  <th className="py-2.5 px-2">OPERADOR</th>
                  <th className="py-2.5 px-2">ABERTURA / FECHAMENTO</th>
                  <th className="py-2.5 px-2 text-right">FUNDO INICIAL</th>
                  <th className="py-2.5 px-2 text-right">VENDAS DINHEIRO</th>
                  <th className="py-2.5 px-2 text-right">SANGRIA</th>
                  <th className="py-2.5 px-2 text-right">DIFERENÇA (QUEBRA/SOBRA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-400 font-sans text-xs">
                      Nenhum fechamento registrado para este período.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((s) => {
                    const isExact = s.differenceCents === 0;
                    const isShortage = s.differenceCents < 0;

                    return (
                      <tr key={s.sessionId} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-2 font-bold text-slate-800">{s.sessionId}</td>
                        <td className="py-3 px-2 font-sans font-medium text-slate-700">{s.userName}</td>
                        <td className="py-3 px-2 text-slate-500 text-[11px]">
                          {s.openedAt} <span className="text-slate-400">→</span> {s.closedAt}
                        </td>
                        <td className="py-3 px-2 text-right text-slate-700">
                          {formatBRL(s.initialAmountCents)}
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-primary">
                          +{formatBRL(s.salesCashCents)}
                        </td>
                        <td className="py-3 px-2 text-right font-bold text-red-600">
                          {s.withdrawsCents > 0 ? `-${formatBRL(s.withdrawsCents)}` : '-R$ 0,00'}
                        </td>
                        <td className="py-3 px-2 text-right font-sans">
                          <span
                            className={`px-3 py-1 rounded-full text-[11px] font-bold inline-block ${
                              isExact
                                ? 'bg-emerald-100 text-emerald-800'
                                : isShortage
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {isExact
                              ? 'Exato (R$ 0,00)'
                              : `${formatBRL(s.differenceCents)} (${isShortage ? 'Falta' : 'Sobra'})`}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA: DESEMPENHO DE VENDAS */}
      {activeTab === 'SALES' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                VENDAS CONCLUÍDAS
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Exibindo {filteredSales.length} {filteredSales.length === 1 ? 'venda' : 'vendas'} {selectedYear !== 'ALL' ? `de ${selectedYear}` : 'de todo o histórico'}
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1 rounded-lg">
                Ticket Médio: {formatBRL(salesSummary.avgTicketCents)}
              </span>
              <span className="text-xs font-mono font-bold text-primary bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                Total do Período: {formatBRL(salesSummary.totalCents)}
              </span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100 sticky top-0 bg-surface">
                <tr>
                  <th className="py-2.5 px-2">CUPOM</th>
                  <th className="py-2.5 px-2">DATA / HORA</th>
                  <th className="py-2.5 px-2">CLIENTE</th>
                  <th className="py-2.5 px-2">PAGAMENTO</th>
                  <th className="py-2.5 px-2 text-center">STATUS</th>
                  <th className="py-2.5 px-2 text-right">SUBTOTAL</th>
                  <th className="py-2.5 px-2 text-right">DESCONTO</th>
                  <th className="py-2.5 px-2 text-right">TOTAL PAGO</th>
                  <th className="py-2.5 px-2 text-center">AÇÕES</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400 font-sans text-xs">
                      Nenhuma venda registrada para o período selecionado.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((s) => {
                    const isCancelled = s.status === 'CANCELLED';

                    return (
                      <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isCancelled ? 'bg-red-50/30' : ''}`}>
                        <td className={`py-3 px-2 font-bold ${isCancelled ? 'line-through text-slate-500' : 'text-slate-800'}`}>
                          #{s.id}
                        </td>
                        <td className="py-3 px-2 text-slate-500 text-[11px]">{s.created_at}</td>
                        <td className="py-3 px-2 font-sans font-medium text-slate-700">
                          {s.customer_name || 'CONSUMIDOR'}
                        </td>
                        <td className="py-3 px-2 font-sans font-bold text-primary text-[11px]">
                          {s.payment_method}
                        </td>
                        <td className="py-3 px-2 text-center font-sans">
                          {isCancelled ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 inline-block">
                              CANCELADA
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 inline-block">
                              CONCLUÍDA
                            </span>
                          )}
                        </td>
                        <td className={`py-3 px-2 text-right ${isCancelled ? 'line-through text-slate-400' : 'text-slate-600'}`}>
                          {formatBRL(s.subtotal_cents)}
                        </td>
                        <td className={`py-3 px-2 text-right font-bold ${isCancelled ? 'line-through text-slate-400' : 'text-red-600'}`}>
                          {s.discount_cents > 0 ? `-${formatBRL(s.discount_cents)}` : 'R$ 0,00'}
                        </td>
                        <td className={`py-3 px-2 text-right font-black text-sm ${isCancelled ? 'line-through text-slate-400' : 'text-primary'}`}>
                          {formatBRL(s.total_cents)}
                        </td>
                        <td className="py-3 px-2 text-center font-sans">
                          <div className="flex items-center justify-center space-x-1.5">
                            <button
                              type="button"
                              onClick={() => handleReprintSale(s.id)}
                              className="text-slate-700 hover:bg-slate-100 border border-slate-200 px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center space-x-1"
                              title="Reimprimir comprovante desta venda"
                            >
                              <Printer className="w-3 h-3 text-slate-600" />
                              <span>Reimprimir</span>
                            </button>
                            {!isCancelled ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedSaleForRefund(s);
                                  setSaleRefundReason('');
                                }}
                                className="text-amber-700 hover:bg-amber-100 border border-amber-200 px-2 py-1 rounded text-[10px] font-bold transition-all flex items-center space-x-1"
                                title="Cancelar e estornar esta venda"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Estornar</span>
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 flex items-center justify-center space-x-1 px-1 py-0.5">
                                <Ban className="w-3 h-3 text-slate-400" />
                                <span>Cancelada</span>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA: ESTOQUE & PRODUTOS */}
      {activeTab === 'INVENTORY' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col p-5">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
            CATÁLOGO DE PRODUTOS & ESTOQUE
          </h2>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100 sticky top-0 bg-surface">
                <tr>
                  <th className="py-2.5 px-2">CÓDIGO</th>
                  <th className="py-2.5 px-2">DESCRIÇÃO DO ITEM</th>
                  <th className="py-2.5 px-2 text-center">UNIDADE</th>
                  <th className="py-2.5 px-2 text-center">ESTOQUE ATUAL</th>
                  <th className="py-2.5 px-2 text-right">PREÇO DE CUSTO</th>
                  <th className="py-2.5 px-2 text-right">PREÇO DE VENDA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {productsList.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-2 font-bold text-slate-700">{p.internalCode}</td>
                    <td className="py-3 px-2 font-sans font-medium text-slate-800">{p.name}</td>
                    <td className="py-3 px-2 text-center">{p.unitMeasure}</td>
                    <td className="py-3 px-2 text-center font-bold text-slate-900">{p.currentStock}</td>
                    <td className="py-3 px-2 text-right text-slate-500">{formatBRL(p.costPriceCents)}</td>
                    <td className="py-3 px-2 text-right font-black text-primary">{formatBRL(p.retailPriceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE ESTORNO DE VENDA */}
      {selectedSaleForRefund && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div ref={refundTrapRef} className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 bg-amber-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5" />
                <h3 className="font-bold text-sm">Confirmar Estorno / Cancelamento de Venda</h3>
              </div>
              <button 
                onClick={() => setSelectedSaleForRefund(null)} 
                className="text-white/80 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmSaleRefund} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Cupom da Venda:</span>
                  <span className="font-mono font-bold text-slate-800">#{selectedSaleForRefund.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Cliente:</span>
                  <span className="font-bold text-slate-800">{selectedSaleForRefund.customer_name || 'CONSUMIDOR'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Forma de Pagamento:</span>
                  <span className="font-bold text-primary">{selectedSaleForRefund.payment_method}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1.5">
                  <span className="font-bold text-slate-700">Valor Total:</span>
                  <span className="font-mono font-black text-sm text-red-600">
                    {formatBRL(selectedSaleForRefund.total_cents)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motivo do Cancelamento / Estorno (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Devolução de mercadoria / Cobrança indevida"
                  value={saleRefundReason}
                  onChange={(e) => setSaleRefundReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:border-amber-600"
                  autoFocus
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSaleForRefund(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-colors"
                >
                  Confirmar Estorno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}