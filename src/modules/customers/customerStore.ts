import { create } from 'zustand';
import { Customer } from './types';

interface CustomerState {
  customers: Customer[];
  addCustomer: (data: Omit<Customer, 'id' | 'totalSpentCents' | 'purchasesCount' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  recordCustomerSale: (customerId: string, totalCents: number, itemsCount: number, paymentMethod: string) => void;
}

export const useCustomerStore = create<CustomerState>((set) => ({
  customers: [],

  addCustomer: (data) => {
    const newCustomer: Customer = {
      id: `cust-${Date.now()}`,
      ...data,
      totalSpentCents: 0,
      purchasesCount: 0,
      createdAt: new Date().toLocaleDateString('pt-BR'),
      purchasesHistory: []
    };
    set((state) => ({ customers: [newCustomer, ...state.customers] }));
    return newCustomer;
  },

  updateCustomer: (id, data) => {
    set((state) => ({
      customers: state.customers.map((c) => (c.id === id ? { ...c, ...data } : c))
    }));
  },

  recordCustomerSale: (customerId, totalCents, itemsCount, paymentMethod) => {
    set((state) => ({
      customers: state.customers.map((c) => {
        if (c.id !== customerId) return c;
        const newHistory = [
          {
            saleId: `CUPOM-${Math.floor(100000 + Math.random() * 900000)}`,
            date: new Date().toLocaleString('pt-BR'),
            itemsCount,
            totalCents,
            paymentMethod
          },
          ...(c.purchasesHistory || [])
        ];
        return {
          ...c,
          totalSpentCents: c.totalSpentCents + totalCents,
          purchasesCount: c.purchasesCount + 1,
          lastPurchaseDate: new Date().toLocaleDateString('pt-BR'),
          purchasesHistory: newHistory
        };
      })
    }));
  }
}));