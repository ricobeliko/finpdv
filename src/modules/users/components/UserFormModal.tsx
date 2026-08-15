import React, { useState } from 'react';
import { X, UserPlus, Shield, Lock, Key } from 'lucide-react';
import { RoleId, User } from '../types';
import { ROLE_DEFINITIONS } from '../userStore';

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: { name: string; username: string; roleId: RoleId; isActive: boolean }) => void;
  initialData?: User | null;
}

export function UserFormModal({ isOpen, onClose, onSave, initialData }: UserFormModalProps) {
  if (!isOpen) return null;

  const [name, setName] = useState(initialData?.name || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [roleId, setRoleId] = useState<RoleId>(initialData?.roleId || 'CASHIER');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      alert('Nome e usuário de login são obrigatórios.');
      return;
    }

    if (!initialData && !password.trim()) {
      alert('Defina uma senha de acesso inicial para o novo usuário.');
      return;
    }

    onSave({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      roleId,
      isActive
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
            <Shield className="w-5 h-5 text-primary" />
            <span>{initialData ? 'Editar Usuário' : 'Novo Usuário do Sistema'}</span>
          </h3>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Nome Completo *</label>
            <input
              type="text"
              required
              autoFocus
              placeholder="Ex: João Operador"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Login / Usuário *</label>
              <input
                type="text"
                required
                placeholder="ex: joao.caixa"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
                {initialData ? 'Nova Senha (Opcional)' : 'Senha de Acesso *'}
              </label>
              <input
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Perfil de Acesso (RBAC) *</label>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value as RoleId)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 font-semibold"
            >
              <option value="ADMIN">Administrador (Acesso Total)</option>
              <option value="MANAGER">Gerente (Operação + Cadastros)</option>
              <option value="CASHIER">Operador de Caixa (PDV & Vendas)</option>
              <option value="STOCKIST">Estoquista (Produtos & Estoque)</option>
            </select>
            <p className="text-[11px] text-textMuted mt-1">{ROLE_DEFINITIONS[roleId].description}</p>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="userActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded text-primary focus:ring-primary w-4 h-4"
            />
            <label htmlFor="userActive" className="text-xs font-medium text-textMain cursor-pointer">
              Conta de usuário ativa (Permite login)
            </label>
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
              className="bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              {initialData ? 'Salvar Alterações' : 'Criar Usuário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}