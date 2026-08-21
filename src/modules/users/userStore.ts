import { create } from 'zustand';
import { User, AuditLog, RoleId } from './types';

export { type RoleId } from './types';

export interface RoleDefinition {
  id: RoleId;
  name: string;
  description: string;
  allowedModules: string[];
}

export const ROLE_DEFINITIONS: Record<RoleId, RoleDefinition> = {
  ADMIN: {
    id: 'ADMIN',
    name: 'Administrador Geral',
    description: 'Acesso irrestrito a todos os módulos, configurações e relatórios.',
    allowedModules: ['POS', 'PRODUCTS', 'CASH', 'PURCHASES', 'CUSTOMERS', 'REPORTS', 'USERS', 'SETTINGS']
  },
  MANAGER: {
    id: 'MANAGER',
    name: 'Gerente',
    description: 'Acesso a vendas, movimentação de caixa, produtos e relatórios.',
    allowedModules: ['POS', 'PRODUCTS', 'CASH', 'PURCHASES', 'CUSTOMERS', 'REPORTS']
  },
  CASHIER: {
    id: 'CASHIER',
    name: 'Operador de Caixa',
    description: 'Acesso operacional ao PDV, caixa e identificação de clientes.',
    allowedModules: ['POS', 'CASH', 'CUSTOMERS']
  },
  STOCKIST: {
    id: 'STOCKIST',
    name: 'Estoquista',
    description: 'Acesso ao catálogo de produtos e compras/entradas de notas.',
    allowedModules: ['PRODUCTS', 'PURCHASES']
  }
};

export type AppUser = User;

interface UserState {
  users: User[];
  currentUser: User | null;
  auditLogs: AuditLog[];
  setCurrentUser: (user: User | null) => void;
  switchUser: (userId: string) => void;
  toggleUserStatus: (id: string) => void;
  authenticatePin: (pin: string) => User | null;
  addUser: (userData: any) => void;
  updateUser: (idOrUser: any, possibleData?: any) => void;
  deleteUser: (id: string) => void;
}

export const DEFAULT_USERS: User[] = [
  {
    id: 'usr-admin',
    name: 'Administrador',
    username: 'admin',
    pin: '1234',
    roleId: 'ADMIN',
    roleName: 'Administrador Geral',
    isActive: true,
    createdAt: new Date().toLocaleDateString('pt-BR'),
    lastLoginAt: 'Agora'
  }
];

export const useUserStore = create<UserState>((set, get) => ({
  users: DEFAULT_USERS,
  currentUser: DEFAULT_USERS[0],
  auditLogs: [
    {
      id: `log-init`,
      userId: 'usr-admin',
      userName: 'Administrador',
      action: 'SYSTEM_START',
      entityName: 'AUTH',
      entityId: 'usr-admin',
      details: 'Sistema inicializado em modo Administrador',
      createdAt: new Date().toLocaleString('pt-BR')
    }
  ],

  setCurrentUser: (user) => set({ currentUser: user }),

  switchUser: (userId: string) => {
    const user = get().users.find(u => u.id === userId);
    if (user && user.isActive) {
      const now = new Date().toLocaleTimeString('pt-BR');
      const updated = { ...user, lastLoginAt: now };
      set(state => ({
        currentUser: updated,
        users: state.users.map(u => u.id === userId ? updated : u),
        auditLogs: [
          {
            id: `log-${Date.now()}`,
            userId: user.id,
            userName: user.name,
            action: 'LOGIN',
            entityName: 'AUTH',
            entityId: user.id,
            details: `Operador ${user.name} assumiu a sessão`,
            createdAt: new Date().toLocaleString('pt-BR')
          },
          ...state.auditLogs
        ]
      }));
    }
  },

  toggleUserStatus: (id: string) => {
    set(state => ({
      users: state.users.map(u => u.id === id ? { ...u, isActive: !u.isActive } : u)
    }));
  },

  authenticatePin: (pin: string) => {
    const found = get().users.find(u => u.pin === pin);
    if (found) {
      set({ currentUser: found });
      return found;
    }
    return null;
  },

  addUser: (data: any) => {
    const roleDef = ROLE_DEFINITIONS[data.roleId as RoleId] || ROLE_DEFINITIONS.CASHIER;
    const newUser: User = {
      id: data.id || `usr-${Date.now()}`,
      name: data.name,
      username: data.username || data.name.toLowerCase().replace(/\s+/g, '.'),
      pin: data.pin || '1234',
      roleId: data.roleId || 'CASHIER',
      roleName: roleDef.name,
      isActive: data.isActive ?? true,
      createdAt: new Date().toLocaleDateString('pt-BR')
    };

    set(state => ({
      users: [...state.users, newUser],
      auditLogs: [
        {
          id: `log-${Date.now()}`,
          userId: state.currentUser?.id || 'usr-admin',
          userName: state.currentUser?.name || 'Administrador',
          action: 'CREATE_USER',
          entityName: 'USERS',
          entityId: newUser.id,
          details: `Novo usuário ${newUser.name} (@${newUser.username}) criado com perfil ${newUser.roleName}`,
          createdAt: new Date().toLocaleString('pt-BR')
        },
        ...state.auditLogs
      ]
    }));
  },

  updateUser: (idOrUser: any, possibleData?: any) => {
    let id = '';
    let data: any = {};

    if (typeof idOrUser === 'string') {
      id = idOrUser;
      data = possibleData || {};
    } else {
      id = idOrUser.id;
      data = idOrUser;
    }

    set(state => ({
      users: state.users.map(u => {
        if (u.id !== id) return u;
        const roleDef = data.roleId ? (ROLE_DEFINITIONS[data.roleId as RoleId] || ROLE_DEFINITIONS.CASHIER) : undefined;
        return {
          ...u,
          ...data,
          roleName: roleDef ? roleDef.name : u.roleName
        };
      }),
      currentUser: state.currentUser?.id === id ? { ...state.currentUser, ...data } : state.currentUser
    }));
  },

  deleteUser: (id: string) => set((state) => ({
    users: state.users.filter((u) => u.id !== id)
  }))
}));