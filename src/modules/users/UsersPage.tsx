import React, { useState } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  History, 
  Lock, 
  Unlock, 
  Edit3, 
  Check, 
  X, 
  Search, 
  UserCheck, 
  Fingerprint 
} from 'lucide-react';
import { useUserStore, ROLE_DEFINITIONS } from './userStore';
import { RoleId, User } from './types';
import { UserFormModal } from './components/UserFormModal';

export function UsersPage() {
  const { 
    users, 
    currentUser, 
    auditLogs, 
    addUser, 
    updateUser, 
    toggleUserStatus, 
    switchUser 
  } = useUserStore();

  const [activeTab, setActiveTab] = useState<'USERS' | 'ROLES' | 'AUDIT'>('USERS');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.roleName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredLogs = auditLogs.filter(l =>
    l.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.details.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSaveUser = (data: { name: string; username: string; roleId: RoleId; isActive: boolean }) => {
    if (editingUser) {
      updateUser(editingUser.id, data);
    } else {
      addUser(data);
    }
    setIsModalOpen(false);
    setEditingUser(null);
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* HEADER DO MÓDULO */}
      <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'USERS' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Operadores & Usuários ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ROLES')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'ROLES' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Matriz de Permissões (RBAC)</span>
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-all ${
              activeTab === 'AUDIT' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Trilha de Auditoria ({auditLogs.length})</span>
          </button>
        </div>

        {activeTab === 'USERS' && (
          <button
            onClick={() => {
              setEditingUser(null);
              setIsModalOpen(true);
            }}
            className="bg-primary hover:bg-primary-hover text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <span>Novo Usuário</span>
          </button>
        )}
      </div>

      {/* ABA 1: OPERADORES E CONTAS */}
      {activeTab === 'USERS' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center shrink-0">
            <Search className="w-4 h-4 text-textMuted mr-2" />
            <input
              type="text"
              placeholder="Buscar por nome, login ou perfil de acesso..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs focus:outline-none text-textMain"
            />
          </div>

          <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-4 py-3">Nome / Operador</th>
                    <th className="px-4 py-3">Usuário / Login</th>
                    <th className="px-4 py-3">Perfil RBAC</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3">Último Acesso</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredUsers.map(u => {
                    const isCurrent = currentUser?.id === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-textMain">{u.name}</span>
                            {isCurrent && (
                              <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                SESSÃO ATIVA
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 font-bold">@{u.username}</td>
                        <td className="px-4 py-3 font-sans">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.roleId === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                            u.roleId === 'MANAGER' ? 'bg-blue-100 text-blue-800' :
                            u.roleId === 'CASHIER' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {u.roleName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                          }`}>
                            {u.isActive ? 'ATIVO' : 'BLOQUEADO'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-textMuted text-[11px]">{u.lastLoginAt || 'Sem registro'}</td>
                        <td className="px-4 py-3 text-right font-sans">
                          <div className="inline-flex items-center space-x-1">
                            {!isCurrent && u.isActive && (
                              <button
                                onClick={() => switchUser(u.id)}
                                title="Alternar para este operador"
                                className="px-2 py-1 bg-slate-100 hover:bg-primary hover:text-white rounded text-[11px] font-semibold transition-colors"
                              >
                                Assumir Caixa
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setIsModalOpen(true);
                              }}
                              title="Editar Usuário"
                              className="p-1.5 text-slate-600 hover:text-primary hover:bg-slate-100 rounded"
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

      {/* ABA 2: MATRIZ DE PERMISSÕES RBAC */}
      {activeTab === 'ROLES' && (
        <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200">
            <span className="text-xs font-bold text-textMain uppercase tracking-wider">Matriz de Autorização por Perfil de Acesso</span>
          </div>

          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Funcionalidade / Operação Crítica</th>
                  <th className="px-4 py-3 text-center">Administrador</th>
                  <th className="px-4 py-3 text-center">Gerente</th>
                  <th className="px-4 py-3 text-center">Operador Caixa</th>
                  <th className="px-4 py-3 text-center">Estoquista</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { name: 'Vender no PDV (sales.create)', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
                  { name: 'Conceder Desconto Manual (sales.discount)', roles: ['ADMIN', 'MANAGER'] },
                  { name: 'Cancelar Item ou Venda (sales.cancel)', roles: ['ADMIN', 'MANAGER'] },
                  { name: 'Abrir / Fechar Caixa (cash.open / cash.close)', roles: ['ADMIN', 'MANAGER', 'CASHIER'] },
                  { name: 'Efetuar Sangria de Caixa (cash.withdraw)', roles: ['ADMIN', 'MANAGER'] },
                  { name: 'Cadastrar e Editar Produtos (products.edit)', roles: ['ADMIN', 'MANAGER', 'STOCKIST'] },
                  { name: 'Ajuste Manual de Estoque (inventory.adjust)', roles: ['ADMIN', 'MANAGER', 'STOCKIST'] },
                  { name: 'Entrada de Compras e Custos (purchases.manage)', roles: ['ADMIN', 'MANAGER', 'STOCKIST'] },
                  { name: 'Acessar Relatórios Financeiros (reports.view)', roles: ['ADMIN', 'MANAGER'] },
                  { name: 'Gerenciar Usuários e Backups (users.manage)', roles: ['ADMIN'] }
                ].map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{item.name}</td>
                    <td className="px-4 py-2.5 text-center">
                      {item.roles.includes('ADMIN') ? <Check className="w-4 h-4 text-primary mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.roles.includes('MANAGER') ? <Check className="w-4 h-4 text-primary mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.roles.includes('CASHIER') ? <Check className="w-4 h-4 text-primary mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {item.roles.includes('STOCKIST') ? <Check className="w-4 h-4 text-primary mx-auto" /> : <X className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ABA 3: TRILHA DE AUDITORIA */}
      {activeTab === 'AUDIT' && (
        <div className="flex-1 flex flex-col space-y-4 overflow-hidden">
          <div className="bg-surface p-3 rounded-xl border border-slate-200 shadow-sm flex items-center shrink-0">
            <Search className="w-4 h-4 text-textMuted mr-2" />
            <input
              type="text"
              placeholder="Buscar logs por operador, tipo de ação ou detalhe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs focus:outline-none text-textMain"
            />
          </div>

          <div className="flex-1 bg-surface rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-textMuted uppercase text-[10px] sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-4 py-3">Data / Horário</th>
                    <th className="px-4 py-3">Operador</th>
                    <th className="px-4 py-3">Ação</th>
                    <th className="px-4 py-3">Tabela / ID</th>
                    <th className="px-4 py-3">Detalhes do Evento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {filteredLogs.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-textMuted text-[11px]">{l.createdAt}</td>
                      <td className="px-4 py-2.5 font-sans font-bold text-slate-800">{l.userName}</td>
                      <td className="px-4 py-2.5">
                        <span className="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[10px]">
                          {l.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-textMuted text-[11px]">{l.entityName} ({l.entityId})</td>
                      <td className="px-4 py-2.5 font-sans text-slate-700">{l.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE USUÁRIO */}
      <UserFormModal
        isOpen={isModalOpen}
        initialData={editingUser}
        onClose={() => {
          setIsModalOpen(false);
          setEditingUser(null);
        }}
        onSave={handleSaveUser}
      />
    </div>
  );
}