import { create } from 'zustand';
import { Customer } from './types';

const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1',
    name: 'Mercado Central Ltda',
    document: '12.345.678/0001-90',
    phone: '(53) 99988-1122',
    address: 'Av. Silva Paes, 120 - Centro',
    notes: 'Compra para revenda / Faturamento mensal',
    totalSpentCents: 560000,
    purchasesCount: 4,
    lastPurchaseDate: '15/08/2026',
    isActive: true,
    createdAt: '01/02/2026',
    purchasesHistory: [
      { saleId: 'CUPOM-104921', date: '15/08/2026 11:30', itemsCount: 20, totalCents: 280000, paymentMethod: 'PIX' },
      { saleId: 'CUPOM-104810', date: '10/08/2026 16:45', itemsCount: 15, totalCents: 150000, paymentMethod: 'DINHEIRO' },
    ]
  },
  {
    id: 'cust-2',
    name: 'João da Silva Sauro',
    document: '123.456.789-00',
    phone: '(53) 98877-4433',
    address: 'Rua General Osório, 450 - Cidade Nova',
    notes: 'Cliente diário / Vizinho da loja',
    totalSpentCents: 14500,
    purchasesCount: 3,
    lastPurchaseDate: '14/08/2026',
    isActive: true,
    createdAt: '15/03/2026',
    purchasesHistory: [
      { saleId: 'CUPOM-104890', date: '14/08/2026 18:20', itemsCount: 2, totalCents: 3790, paymentMethod: 'DINHEIRO' },
    ]
  },
  {
    id: 'cust-3',
    name: 'Padaria e Confeitaria Estrela',
    document: '98.765.432/0001-10',
    phone: '(53) 3232-1100',
    address: 'Rua dos Andradas, 800',
    notes: 'Compra grãos em atacado',
    totalSpentCents: 112000,
    purchasesCount: 1,
    lastPurchaseDate: '12/08/2026',
    isActive: true,
    createdAt: '20/04/2026',
    purchasesHistory: []
  }
];

interface CustomerState {
  customers: Customer[];
  addCustomer: (data: Omit<Customer, 'id' | 'totalSpentCents' | 'purchasesCount' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => void;
  recordCustomerSale: (customerId: string, totalCents: number, itemsCount: number, paymentMethod: string) => void;
}

export const useCustomerStore = create<CustomerState>((set) => ({
  customers: INITIAL_CUSTOMERS,

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