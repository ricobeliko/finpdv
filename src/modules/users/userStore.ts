import { create } from 'zustand';
import { AuditLog, PermissionId, Role, RoleId, User } from './types';

export const ROLE_DEFINITIONS: Record<RoleId, Role> = {
  ADMIN: {
    id: 'ADMIN',
    name: 'Administrador',
    description: 'Acesso total irrestrito ao sistema e configurações.',
    permissions: [
      'products.view', 'products.create', 'products.edit', 'products.delete',
      'sales.create', 'sales.discount', 'sales.cancel',
      'cash.open', 'cash.close', 'cash.withdraw',
      'inventory.adjust', 'purchases.manage', 'customers.manage',
      'reports.view', 'users.manage', 'settings.backup'
    ]
  },
  MANAGER: {
    id: 'MANAGER',
    name: 'Gerente',
    description: 'Acesso administrativo e operacional com exceção de backups e exclusões críticas.',
    permissions: [
      'products.view', 'products.create', 'products.edit',
      'sales.create', 'sales.discount', 'sales.cancel',
      'cash.open', 'cash.close', 'cash.withdraw',
      'inventory.adjust', 'purchases.manage', 'customers.manage',
      'reports.view'
    ]
  },
  CASHIER: {
    id: 'CASHIER',
    name: 'Operador de Caixa',
    description: 'Acesso ao PDV, abertura e fechamento de caixa e identificação de clientes.',
    permissions: [
      'products.view',
      'sales.create',
      'cash.open', 'cash.close',
      'customers.manage'
    ]
  },
  STOCKIST: {
    id: 'STOCKIST',
    name: 'Estoquista',
    description: 'Acesso a produtos, livro razão de estoque e recebimento de compras.',
    permissions: [
      'products.view', 'products.create', 'products.edit',
      'inventory.adjust',
      'purchases.manage'
    ]
  }
};

const INITIAL_USERS: User[] = [
  {
    id: 'usr-1',
    name: 'Richard',
    username: 'admin',
    roleId: 'ADMIN',
    roleName: 'Administrador',
    isActive: true,
    createdAt: '15/01/2026',
    lastLoginAt: '15/08/2026 08:00'
  },
  {
    id: 'usr-2',
    name: 'Carlos Gerente',
    username: 'carlos',
    roleId: 'MANAGER',
    roleName: 'Gerente',
    isActive: true,
    createdAt: '01/02/2026',
    lastLoginAt: '14/08/2026 19:40'
  },
  {
    id: 'usr-3',
    name: 'Mariana Caixa',
    username: 'mariana',
    roleId: 'CASHIER',
    roleName: 'Operador de Caixa',
    isActive: true,
    createdAt: '10/03/2026',
    lastLoginAt: '15/08/2026 07:55'
  },
  {
    id: 'usr-4',
    name: 'Fernando Estoque',
    username: 'fernando',
    roleId: 'STOCKIST',
    roleName: 'Estoquista',
    isActive: true,
    createdAt: '20/04/2026',
    lastLoginAt: '12/08/2026 16:30'
  }
];

const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    userId: 'usr-1',
    userName: 'Richard (Admin)',
    action: 'CASH_OPEN',
    entityName: 'cash_sessions',
    entityId: 'CX-1048',
    details: 'Abertura de caixa com fundo de R$ 100,00',
    createdAt: '15/08/2026 08:00'
  },
  {
    id: 'log-2',
    userId: 'usr-1',
    userName: 'Richard (Admin)',
    action: 'PRICE_UPDATE',
    entityName: 'products',
    entityId: 'prod-1',
    details: 'Preço de custo do Arroz 5kg ajustado de R$ 20,00 para R$ 22,00',
    createdAt: '15/08/2026 09:35'
  },
  {
    id: 'log-3',
    userId: 'usr-2',
    userName: 'Carlos (Gerente)',
    action: 'STOCK_ADJUST',
    entityName: 'inventory_movements',
    entityId: 'mov-102',
    details: 'Saída manual de 10 un Óleo de Soja (Avaria no transporte)',
    createdAt: '15/08/2026 11:15'
  }
];

interface UserState {
  users: User[];
  currentUser: User;
  auditLogs: AuditLog[];
  
  // Ações de Usuário
  addUser: (data: Omit<User, 'id' | 'roleName' | 'createdAt'>) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  toggleUserStatus: (id: string) => void;
  switchUser: (id: string) => void;

  // Ações de Auditoria & RBAC
  logAction: (action: string, entityName: string, entityId: string, details: string) => void;
  hasPermission: (permission: PermissionId) => boolean;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: INITIAL_USERS,
  currentUser: INITIAL_USERS[0],
  auditLogs: INITIAL_AUDIT_LOGS,

  addUser: (data) => {
    const role = ROLE_DEFINITIONS[data.roleId];
    const newUser: User = {
      id: `usr-${Date.now()}`,
      ...data,
      roleName: role.name,
      createdAt: new Date().toLocaleDateString('pt-BR')
    };

    set((state) => ({ users: [...state.users, newUser] }));
    get().logAction('USER_CREATE', 'users', newUser.id, `Novo usuário criado: ${newUser.name} (${role.name})`);
  },

  updateUser: (id, data) => {
    set((state) => ({
      users: state.users.map((u) => {
        if (u.id !== id) return u;
        const newRoleId = data.roleId || u.roleId;
        return {
          ...u,
          ...data,
          roleName: ROLE_DEFINITIONS[newRoleId].name
        };
      })
    }));
    get().logAction('USER_UPDATE', 'users', id, `Dados do usuário ID ${id} atualizados`);
  },

  toggleUserStatus: (id) => {
    set((state) => ({
      users: state.users.map((u) => (u.id === id ? { ...u, isActive: !u.isActive } : u))
    }));
    get().logAction('USER_STATUS_CHANGE', 'users', id, `Status de ativação alterado para usuário ID ${id}`);
  },

  switchUser: (id) => {
    const found = get().users.find((u) => u.id === id);
    if (found && found.isActive) {
      set({ currentUser: found });
      get().logAction('AUTH_SWITCH', 'users', found.id, `Operador ativo alterado para ${found.name}`);
    }
  },

  logAction: (action, entityName, entityId, details) => {
    const current = get().currentUser;
    const newLog: AuditLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      userId: current ? current.id : 'system',
      userName: current ? `${current.name} (${current.roleName})` : 'Sistema',
      action,
      entityName,
      entityId,
      details,
      createdAt: new Date().toLocaleString('pt-BR')
    };

    set((state) => ({ auditLogs: [newLog, ...state.auditLogs] }));
  },

  hasPermission: (permission) => {
    const current = get().currentUser;
    if (!current || !current.isActive) return false;
    const role = ROLE_DEFINITIONS[current.roleId];
    return role ? role.permissions.includes(permission) : false;
  }
}));