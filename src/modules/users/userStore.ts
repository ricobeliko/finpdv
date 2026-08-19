import { create } from 'zustand';

export type RoleId = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STOCKIST';

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

export interface AppUser {
  id: string;
  name: string;
  pin: string;
  roleId: RoleId | string;
  roleName: string;
}

interface UserState {
  users: AppUser[];
  currentUser: AppUser | null;
  setCurrentUser: (user: AppUser | null) => void;
  authenticatePin: (pin: string) => AppUser | null;
  addUser: (user: AppUser) => void;
  updateUser: (user: AppUser) => void;
  deleteUser: (id: string) => void;
}

export const DEFAULT_USERS: AppUser[] = [
  {
    id: 'usr-admin',
    name: 'Administrador',
    pin: '1234',
    roleId: 'ADMIN',
    roleName: 'Administrador Geral'
  },
  {
    id: 'usr-caixa',
    name: 'Operador Padrão',
    pin: '0000',
    roleId: 'CASHIER',
    roleName: 'Operador de Caixa'
  }
];

export const useUserStore = create<UserState>((set, get) => ({
  users: DEFAULT_USERS,
  currentUser: DEFAULT_USERS[0],

  setCurrentUser: (user) => set({ currentUser: user }),

  authenticatePin: (pin: string) => {
    const found = get().users.find(u => u.pin === pin);
    if (found) {
      set({ currentUser: found });
      return found;
    }
    return null;
  },

  addUser: (user: AppUser) => set((state) => ({ users: [...state.users, user] })),
  updateUser: (user: AppUser) => set((state) => ({
    users: state.users.map((u) => (u.id === user.id ? user : u))
  })),
  deleteUser: (id: string) => set((state) => ({
    users: state.users.filter((u) => u.id !== id)
  }))
}));