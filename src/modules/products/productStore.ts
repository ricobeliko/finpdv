import { create } from 'zustand';
import { Product, Category, InventoryMovement, MovementType } from './types';
import { 
  loadProductsFromDb, 
  saveProductToDb, 
  updateStockDb, 
  insertMovementDb, 
  importNexCsv 
} from '../../core/database/db';
import { useUserStore } from '../users/userStore';

interface ProductState {
  products: Product[];
  categories: Category[];
  movements: InventoryMovement[];
  isLoading: boolean;

  loadFromDb: () => Promise<void>;
  saveProduct: (productData: any) => Promise<void>;
  adjustStock: (productId: string, type: MovementType, quantity: number, reason: string, notes: string, userName?: string) => Promise<void>;
  deductStockFromSale: (saleItems: Array<{ productId: string; quantity: number }>, saleId: string) => Promise<void>;
  returnStockFromRefund: (saleItems: Array<{ productId: string; quantity: number }>, saleId: string) => Promise<void>;
  importFromCsv: (csvContent: string) => Promise<number>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  categories: [
    { id: 'cat-1', name: 'Mercearia & Grãos' },
    { id: 'cat-2', name: 'Bebidas' },
    { id: 'cat-3', name: 'Hortifrúti' },
    { id: 'cat-4', name: 'Limpeza & Higiene' }
  ],
  movements: [],
  isLoading: false,

  loadFromDb: async () => {
    set({ isLoading: true });
    try {
      const dbProducts = await loadProductsFromDb();
      set({ products: dbProducts || [] });
    } catch (err) {
      console.warn('Erro ao carregar catálogo do SQLite:', err);
      set({ products: [] });
    } finally {
      set({ isLoading: false });
    }
  },

  saveProduct: async (formData) => {
    const existing = get().products.find(p => p.id === formData.id || p.internalCode === formData.internalCode);
    const id = existing ? existing.id : (formData.id || `prod-${Date.now()}`);

    const productToSave: Product = {
      ...formData,
      id,
      currentStock: existing ? existing.currentStock : (formData.initialStock || 0),
      isActive: formData.isActive ?? true
    };

    set(state => {
      const index = state.products.findIndex(p => p.id === id);
      if (index >= 0) {
        const updated = [...state.products];
        updated[index] = productToSave;
        return { products: updated };
      }
      return { products: [productToSave, ...state.products] };
    });

    try {
      await saveProductToDb(productToSave);
    } catch (err) {
      console.error('Erro ao salvar produto no SQLite:', err);
    }
  },

  adjustStock: async (productId, type, quantity, reason, notes, userName = 'Administrador') => {
    const product = get().products.find(p => p.id === productId);
    if (!product) return;

    const current = product.currentStock;
    let delta = 0;

    if (type === 'ADJUST_IN' || type === 'PURCHASE') {
      delta = Math.abs(quantity);
    } else if (type === 'ADJUST_OUT' || type === 'LOSS' || type === 'SALE') {
      delta = -Math.abs(quantity);
    } else if (type === 'COUNT_CORRECTION') {
      delta = quantity - current;
    }

    const nextBalance = current + delta;

    const mov: InventoryMovement = {
      id: `mov-${Date.now()}`,
      productId: product.id,
      productName: product.name,
      type,
      quantity: delta,
      previousBalance: current,
      newBalance: nextBalance,
      costPriceCents: product.costPriceCents,
      userName,
      notes: `${reason} ${notes ? `(${notes})` : ''}`.trim(),
      createdAt: new Date().toLocaleString('pt-BR')
    };

    set(state => ({
      products: state.products.map(p => p.id === productId ? { ...p, currentStock: nextBalance } : p),
      movements: [mov, ...state.movements]
    }));

    try {
      await updateStockDb(productId, nextBalance);
      await insertMovementDb(mov);
    } catch (err) {
      console.error('Erro ao salvar ajuste de estoque no SQLite:', err);
    }
  },

  deductStockFromSale: async (saleItems, saleId) => {
    for (const item of saleItems) {
      const prod = get().products.find(p => p.id === item.productId);
      if (prod) {
        const nextBalance = Math.max(0, prod.currentStock - item.quantity);
        set(state => ({
          products: state.products.map(p => p.id === prod.id ? { ...p, currentStock: nextBalance } : p)
        }));

        try {
          await updateStockDb(prod.id, nextBalance);
        } catch (e) {
          console.error(e);
        }
      }
    }
  },

  returnStockFromRefund: async (saleItems, saleId) => {
    const { products, adjustStock } = get();
    const currentUser = useUserStore.getState().currentUser;

    for (const item of saleItems) {
      const prod = products.find(p => p.id === item.productId);
      if (prod) {
        await adjustStock(
          prod.id,
          'ADJUST_IN',
          item.quantity,
          'Devolução de Venda',
          `Estorno do Cupom #${saleId}`,
          currentUser?.name || 'Sistema'
        );
      }
    }
  },

  importFromCsv: async (csvContent) => {
    const count = await importNexCsv(csvContent);
    await get().loadFromDb();
    return count;
  }
}));