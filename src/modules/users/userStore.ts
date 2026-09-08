import { create } from 'zustand';
import { User, AuditLog, RoleId } from './types';
import { getAllUsersDb } from '../../core/database/finpdvDb';
import { authService } from '../../core/auth/authService';
import { RoleType } from '../../core/finpdv/types';

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
    allowedModules: ['POS', 'PRODUCTS', 'CASH', 'PURCHASES', 'CUSTOMERS', 'REPORTS', 'USERS', 'SETTINGS', 'MAINTENANCE']
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

function mapFinPdvRoleToRoleId(role: RoleType): RoleId {
  switch (role) {
    case 'CLIENT_ADMIN':
    case 'FINPDV_SUPPORT':
      return 'ADMIN';
    case 'MANAGER':
      return 'MANAGER';
    case 'SUPERVISOR':
      return 'MANAGER';
    case 'OPERATOR':
    default:
      return 'CASHIER';
  }
}

function mapRoleIdToFinPdvRole(roleId: RoleId): RoleType {
  switch (roleId) {
    case 'ADMIN':
      return 'CLIENT_ADMIN';
    case 'MANAGER':
      return 'MANAGER';
    case 'STOCKIST':
      return 'MANAGER';
    case 'CASHIER':
    default:
      return 'OPERATOR';
  }
}

interface UserState {
  users: User[];
  currentUser: User | null;
  auditLogs: AuditLog[];
  loadUsersFromDb: () => Promise<void>;
  setCurrentUser: (user: User | null) => void;
  switchUser: (userId: string) => void;
  toggleUserStatus: (id: string) => Promise<void>;
  addUser: (userData: any) => Promise<void>;
  updateUser: (idOrUser: any, possibleData?: any) => Promise<void>;
  deleteUser: (id: string) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  currentUser: null,
  auditLogs: [],

  loadUsersFromDb: async () => {
    try {
      const dbUsers = await getAllUsersDb();
      const mapped: User[] = dbUsers.map(u => {
        const roleId = mapFinPdvRoleToRoleId(u.role);
        const roleDef = ROLE_DEFINITIONS[roleId];
        return {
          id: u.id,
          name: u.fullName || u.name || u.username,
          username: u.username,
          pin: '', // Jamais expõe hash ou credencial
          roleId,
          roleName: roleDef.name,
          isActive: u.isActive,
          createdAt: new Date(u.createdAt).toLocaleDateString('pt-BR'),
          lastLoginAt: 'Registrado'
        };
      });

      set({ 
        users: mapped,
        currentUser: get().currentUser || mapped[0] || null
      });
    } catch (err) {
      console.warn('Erro ao carregar operadores do banco:', err);
    }
  },

  setCurrentUser: (user) => set({ currentUser: user }),

  switchUser: (userId: string) => {
    const user = get().users.find(u => u.id === userId);
    if (user && user.isActive) {
      set({ currentUser: user });
    }
  },

  toggleUserStatus: async (id: string) => {
    const user = get().users.find(u => u.id === id);
    if (!user) return;
    const newStatus = !user.isActive;
    await authService.updateUser(id, { isActive: newStatus });
    await get().loadUsersFromDb();
  },

  addUser: async (data: any) => {
    const mappedRole = mapRoleIdToFinPdvRole(data.roleId as RoleId);
    await authService.createUser({
      username: data.username,
      fullName: data.name,
      role: mappedRole,
      passwordPlain: data.password || 'Mudar@123',
      pinPlain: data.pin || undefined
    });
    await get().loadUsersFromDb();
  },

  updateUser: async (idOrUser: any, possibleData?: any) => {
    let id = typeof idOrUser === 'string' ? idOrUser : idOrUser.id;
    let data = typeof idOrUser === 'string' ? (possibleData || {}) : idOrUser;

    const mappedRole = data.roleId ? mapRoleIdToFinPdvRole(data.roleId as RoleId) : undefined;
    await authService.updateUser(id, {
      fullName: data.name,
      role: mappedRole,
      isActive: data.isActive,
      newPasswordPlain: data.password || undefined
    });
    await get().loadUsersFromDb();
  },

  deleteUser: (id: string) => set((state) => ({
    users: state.users.filter((u) => u.id !== id)
  }))
}));