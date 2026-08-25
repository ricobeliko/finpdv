import { create } from 'zustand';
import { Customer } from './types';
import { loadCustomersDb, saveCustomerDb, deleteCustomerDb } from '../../core/database/db';

interface CustomerState {
  customers: Customer[];
  isLoading: boolean;
  loadFromDb: () => Promise<void>;
  addCustomer: (data: Omit<Customer, 'id' | 'totalSpentCents' | 'purchasesCount' | 'createdAt'>) => Promise<Customer>;
  updateCustomer: (id: string, data: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
  recordCustomerSale: (customerId: string, totalCents: number, itemsCount: number, paymentMethod: string, saleId?: string) => Promise<void>;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  isLoading: false,

  loadFromDb: async () => {
    set({ isLoading: true });
    try {
      const list = await loadCustomersDb();
      set({ customers: list || [] });
    } catch (err) {
      console.warn('Erro ao carregar clientes do SQLite:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  addCustomer: async (data) => {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      ...data,
      totalSpentCents: 0,
      purchasesCount: 0,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      purchasesHistory: []
    };

    set((state) => ({ customers: [newCustomer, ...state.customers] }));

    try {
      await saveCustomerDb(newCustomer);
    } catch (err) {
      console.error('Erro ao salvar cliente no SQLite:', err);
    }

    return newCustomer;
  },

  updateCustomer: async (id, data) => {
    let updatedCustomer: Customer | null = null;

    set((state) => {
      const updated = state.customers.map((c) => {
        if (c.id === id) {
          updatedCustomer = { ...c, ...data };
          return updatedCustomer;
        }
        return c;
      });
      return { customers: updated };
    });

    if (updatedCustomer) {
      try {
        await saveCustomerDb(updatedCustomer);
      } catch (err) {
        console.error('Erro ao atualizar cliente no SQLite:', err);
      }
    }
  },

  deleteCustomer: async (id: string) => {
    set((state) => ({
      customers: state.customers.filter((c) => c.id !== id)
    }));

    try {
      await deleteCustomerDb(id);
    } catch (err) {
      console.error('Erro ao excluir cliente no SQLite:', err);
    }
  },

  recordCustomerSale: async (customerId, totalCents, itemsCount, paymentMethod, saleId) => {
    let updatedCust: Customer | null = null;

    set((state) => {
      const updatedList = state.customers.map((c) => {
        if (c.id !== customerId) return c;
        const newHistory = [
          {
            saleId: saleId || `CUPOM-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            date: new Date().toLocaleString('pt-BR'),
            itemsCount,
            totalCents,
            paymentMethod
          },

          ...(c.purchasesHistory || [])
        ];
        updatedCust = {
          ...c,
          totalSpentCents: (c.totalSpentCents || 0) + totalCents,
          purchasesCount: (c.purchasesCount || 0) + 1,
          lastPurchaseDate: new Date().toLocaleDateString('pt-BR'),
          purchasesHistory: newHistory
        };
        return updatedCust;
      });
      return { customers: updatedList };
    });


    if (updatedCust) {
      try {
        await saveCustomerDb(updatedCust);
      } catch (err) {
        console.error('Erro ao salvar estatísticas do cliente no SQLite:', err);
      }
    }
  }
}));