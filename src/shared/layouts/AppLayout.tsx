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
  LogOut,
  User
} from 'lucide-react';
import { useUserStore } from '../../modules/users/userStore';

export type ModuleType = 'POS' | 'PRODUCTS' | 'CASH' | 'PURCHASES' | 'CUSTOMERS' | 'REPORTS' | 'USERS' | 'SETTINGS';

interface MenuItemConfig {
  id: ModuleType;
  label: string;
  icon: React.ElementType;
  allowedRoles: string[];
}

interface AppLayoutProps {
  activeModule: ModuleType;
  onNavigate: (module: ModuleType) => void;
  onRequestSwitchUser: () => void;
  children: React.ReactNode;
}

export function AppLayout({ activeModule, onNavigate, onRequestSwitchUser, children }: AppLayoutProps) {
  const { currentUser } = useUserStore();
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Perfil do operador ativo (padrão CASHIER se não definido)
  const currentRoleId = currentUser?.roleId?.toUpperCase() || 'CASHIER';

  // Configuração mestre de permissões por módulo
  const allMenuItems: MenuItemConfig[] = [
    { 
      id: 'POS', 
      label: 'PDV (Caixa)', 
      icon: ShoppingCart, 
      allowedRoles: ['ADMIN', 'MANAGER', 'CASHIER', 'CAIXA', 'GERENTE'] 
    },
    { 
      id: 'PRODUCTS', 
      label: 'Produtos & Estoque', 
      icon: Boxes, 
      allowedRoles: ['ADMIN', 'MANAGER', 'STOCKIST', 'GERENTE', 'ESTOQUISTA'] 
    },
    { 
      id: 'CASH', 
      label: 'Movimento de Caixa', 
      icon: ArrowLeftRight, 
      allowedRoles: ['ADMIN', 'MANAGER', 'CASHIER', 'CAIXA', 'GERENTE'] 
    },
    { 
      id: 'PURCHASES', 
      label: 'Compras & Entradas', 
      icon: Truck, 
      allowedRoles: ['ADMIN', 'MANAGER', 'STOCKIST', 'GERENTE', 'ESTOQUISTA'] 
    },
    { 
      id: 'CUSTOMERS', 
      label: 'Clientes', 
      icon: Users, 
      allowedRoles: ['ADMIN', 'MANAGER', 'CASHIER', 'CAIXA', 'GERENTE'] 
    },
    { 
      id: 'REPORTS', 
      label: 'Relatórios', 
      icon: BarChart3, 
      allowedRoles: ['ADMIN', 'MANAGER', 'GERENTE'] 
    },
    { 
      id: 'USERS', 
      label: 'Usuários & Segurança', 
      icon: ShieldCheck, 
      allowedRoles: ['ADMIN'] 
    },
    { 
      id: 'SETTINGS', 
      label: 'Configurações & Backup', 
      icon: Settings, 
      allowedRoles: ['ADMIN'] 
    },
  ];

  // FILTRAGEM: Somente exibe abas que o perfil do usuário tem autorização para acessar
  const visibleMenuItems = allMenuItems.filter(item =>
    currentRoleId === 'ADMIN' || item.allowedRoles.includes(currentRoleId)
  );

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
            <span>Atalhos (F1-F7)</span>
          </button>

          {/* IDENTIFICAÇÃO DO OPERADOR + BOTÃO TROCAR USUÁRIO */}
          <button
            onClick={onRequestSwitchUser}
            className="flex items-center space-x-2.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20 transition-all text-left group"
            title="Clique para trocar de usuário"
          >
            <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
              <User className="w-4 h-4 text-highlight" />
            </div>
            <div className="text-right text-xs">
              <p className="font-semibold leading-tight">{currentUser ? currentUser.name : 'Operador'}</p>
              <span className="text-[10px] text-emerald-300 font-mono font-bold block">
                {currentUser?.roleName || 'Caixa'} • Trocar
              </span>
            </div>
            <LogOut className="w-3.5 h-3.5 text-white/70 group-hover:text-white ml-1 transition-colors" />
          </button>
        </div>
      </header>

      {/* CORPO PRINCIPAL COM SIDEBAR FILTRADA + CONTEÚDO */}
      <div className="flex-1 flex overflow-hidden">
        {/* BARRA LATERAL */}
        <aside className="w-56 bg-surface border-r border-slate-200 flex flex-col justify-between p-3 shrink-0">
          <nav className="space-y-1">
            {visibleMenuItems.map((item) => {
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

          {/* RODAPÉ DA BARRA LATERAL */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <button
              onClick={onRequestSwitchUser}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 p-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 border border-slate-200 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-primary" />
              <span>Trocar Operador</span>
            </button>

            <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-textMuted flex items-center space-x-2">
              <Database className="w-3.5 h-3.5 text-primary shrink-0" />
              <div className="truncate">
                <p className="font-bold text-slate-700 leading-tight">Base Local</p>
                <p className="text-[10px]">mercado.db (Offline)</p>
              </div>
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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-surface w-full max-w-md rounded-xl shadow-2xl border border-slate-200 p-6">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3 mb-4">
              <h3 className="font-bold text-base text-textMain">Central de Atalhos de Teclado</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F1 / F2]</span><span className="font-sans font-semibold">Finalizar e Receber Venda</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F3]</span><span className="font-sans font-semibold">Buscar Produto por Nome / Código</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F4]</span><span className="font-sans font-semibold">Identificar Cliente</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F5]</span><span className="font-sans font-semibold">Aplicar Desconto Geral</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F6]</span><span className="font-sans font-semibold">Cancelar Item Selecionado</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[F7]</span><span className="font-sans font-semibold">Suspender / Retomar Venda</span></div>
              <div className="flex justify-between p-2 bg-slate-50 rounded"><span>[ESC]</span><span className="font-sans font-semibold">Cancelar / Fechar Modal</span></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}