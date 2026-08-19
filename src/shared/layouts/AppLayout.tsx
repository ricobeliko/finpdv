import React, { useState } from 'react';
import { 
  ShoppingCart, 
  Boxes, 
  ArrowLeftRight, 
  Truck, 
  Users, 
  BarChart3, 
  Settings, 
  Keyboard, 
  Database, 
  ShieldCheck,
  User
} from 'lucide-react';
import { useUserStore } from '../../modules/users/userStore';

export type ModuleType = 'POS' | 'PRODUCTS' | 'CASH' | 'PURCHASES' | 'CUSTOMERS' | 'REPORTS' | 'USERS' | 'SETTINGS';

interface MenuItemConfig {
  id: ModuleType;
  label: string;
  icon: React.ElementType;
}

interface AppLayoutProps {
  activeModule: ModuleType;
  onNavigate: (module: ModuleType) => void;
  onRequestSwitchUser: () => void;
  children: React.ReactNode;
}

export function AppLayout({ activeModule, onNavigate, children }: AppLayoutProps) {
  const { currentUser } = useUserStore();
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Todas as abas liberadas para o Administrador
  const menuItems: MenuItemConfig[] = [
    { id: 'POS', label: 'PDV (Caixa)', icon: ShoppingCart },
    { id: 'PRODUCTS', label: 'Produtos & Estoque', icon: Boxes },
    { id: 'CASH', label: 'Movimento de Caixa', icon: ArrowLeftRight },
    { id: 'PURCHASES', label: 'Compras & Entradas', icon: Truck },
    { id: 'CUSTOMERS', label: 'Clientes', icon: Users },
    { id: 'REPORTS', label: 'Relatórios & Fechamentos', icon: BarChart3 },
    { id: 'SETTINGS', label: 'Configurações & Backup', icon: Settings },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-textMain overflow-hidden select-none font-sans">
      {/* HEADER SUPERIOR */}
      <header className="h-14 bg-primary text-white px-6 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center border border-white/20">
            <ShoppingCart className="w-5 h-5 text-highlight" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-none tracking-wide">MERCADO POS</h1>
            <p className="text-[11px] text-white/70 mt-0.5">Sistema de Gestão Comercial e PDV</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowShortcuts(true)}
            className="flex items-center space-x-1.5 text-xs bg-white/10 hover:bg-white/20 text-white px-2.5 py-1 rounded border border-white/20 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-highlight" />
            <span>Atalhos (F1-F8)</span>
          </button>

          {/* IDENTIFICAÇÃO DO ADMINISTRADOR */}
          <div className="flex items-center space-x-2.5 bg-white/10 px-3 py-1.5 rounded-lg border border-white/20">
            <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
              <User className="w-4 h-4 text-highlight" />
            </div>
            <div className="text-right text-xs">
              <p className="font-semibold leading-tight">{currentUser?.name || 'Administrador'}</p>
              <span className="text-[10px] text-emerald-300 font-mono font-bold block">
                Acesso Total (Admin)
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* CORPO PRINCIPAL */}
      <div className="flex-1 flex overflow-hidden">
        {/* BARRA LATERAL */}
        <aside className="w-56 bg-surface border-r border-slate-200 flex flex-col justify-between p-3 shrink-0">
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all text-left ${
                    isActive 
                      ? 'bg-primary text-white shadow-sm' 
                      : 'text-slate-600 hover:bg-slate-100 hover:text-textMain'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-highlight' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* STATUS DO BANCO LOCAL */}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-textMuted flex items-center space-x-2">
            <Database className="w-3.5 h-3.5 text-primary shrink-0" />
            <div className="truncate">
              <p className="font-bold text-slate-700 leading-tight">Base Local</p>
              <p className="text-[10px]">mercado.db (Offline)</p>
            </div>
          </div>
        </aside>

        {/* ÁREA DA TELA ATIVA */}
        <main className="flex-1 overflow-hidden p-4 bg-slate-900">
          {children}
        </main>
      </div>

      {/* MODAL DE ATALHOS */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-in">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2">
                <Keyboard className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-sm text-textMain">Central de Atalhos de Teclado</h3>
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-2 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F1 / F2]</span>
                <span className="text-xs font-semibold text-slate-700">Finalizar e Receber Venda</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F3]</span>
                <span className="text-xs font-semibold text-slate-700">Buscar Produto por Nome / Código</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F4]</span>
                <span className="text-xs font-semibold text-slate-700">Identificar Cliente</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F5]</span>
                <span className="text-xs font-semibold text-slate-700">Aplicar Desconto Geral</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F6 / DEL]</span>
                <span className="text-xs font-semibold text-slate-700">Cancelar Item Selecionado</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">[F7]</span>
                <span className="text-xs font-semibold text-slate-700">Suspender / Retomar Venda</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <span className="font-mono text-xs font-bold text-primary bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md">[F8]</span>
                <span className="text-xs font-bold text-primary">Abrir Gaveta de Dinheiro</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-slate-800 bg-slate-200 px-2 py-0.5 rounded-md">[1 + ENTER]</span>
                <span className="text-xs font-semibold text-slate-700">Preço Livre / Varejo Diversos</span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="font-mono text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">[ESC]</span>
                <span className="text-xs font-semibold text-slate-700">Cancelar / Fechar Modal</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowShortcuts(false)}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow"
              >
                Entendido [ESC]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}