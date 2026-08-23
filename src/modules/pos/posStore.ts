import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CartItem, CompletedSale, Customer, SuspendedSale } from './types';

interface PosState {
  cart: CartItem[];
  selectedCartIndex: number;
  currentCustomer: Customer | null;
  generalDiscountCents: number;
  suspendedSales: SuspendedSale[];
  completedSale: CompletedSale | null;

  setCart: (cartOrUpdater: CartItem[] | ((prev: CartItem[]) => CartItem[])) => void;
  setSelectedCartIndex: (idxOrUpdater: number | ((prev: number) => number)) => void;
  setCurrentCustomer: (customer: Customer | null) => void;
  setGeneralDiscountCents: (centsOrUpdater: number | ((prev: number) => number)) => void;
  setSuspendedSales: (salesOrUpdater: SuspendedSale[] | ((prev: SuspendedSale[]) => SuspendedSale[])) => void;
  setCompletedSale: (sale: CompletedSale | null) => void;
  clearCart: () => void;
  hasActiveSale: () => boolean;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      cart: [],
      selectedCartIndex: 0,
      currentCustomer: null,
      generalDiscountCents: 0,
      suspendedSales: [],
      completedSale: null,

      setCart: (cartOrUpdater) => {
        set((state) => ({
          cart: typeof cartOrUpdater === 'function' ? cartOrUpdater(state.cart) : cartOrUpdater
        }));
      },

      setSelectedCartIndex: (idxOrUpdater) => {
        set((state) => ({
          selectedCartIndex: typeof idxOrUpdater === 'function' ? idxOrUpdater(state.selectedCartIndex) : idxOrUpdater
        }));
      },

      setCurrentCustomer: (customer) => set({ currentCustomer: customer }),

      setGeneralDiscountCents: (centsOrUpdater) => {
        set((state) => ({
          generalDiscountCents: typeof centsOrUpdater === 'function' ? centsOrUpdater(state.generalDiscountCents) : centsOrUpdater
        }));
      },

      setSuspendedSales: (salesOrUpdater) => {
        set((state) => ({
          suspendedSales: typeof salesOrUpdater === 'function' ? salesOrUpdater(state.suspendedSales) : salesOrUpdater
        }));
      },

      setCompletedSale: (sale) => set({ completedSale: sale }),

      clearCart: () => set({ cart: [], currentCustomer: null, generalDiscountCents: 0, selectedCartIndex: 0 }),

      hasActiveSale: () => get().cart.length > 0
    }),
    {
      name: 'mercado_pos_active_session_data',
      partialize: (state) => ({
        cart: state.cart,
        selectedCartIndex: state.selectedCartIndex,
        currentCustomer: state.currentCustomer,
        generalDiscountCents: state.generalDiscountCents,
        suspendedSales: state.suspendedSales
      })
    }
  )
);
