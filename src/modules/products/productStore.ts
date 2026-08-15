import { create } from 'zustand';
import { Product, Category, InventoryMovement, MovementType } from './types';
import { 
  loadProductsFromDb, 
  saveProductToDb, 
  updateStockDb, 
  insertMovementDb, 
  importNexCsv 
} from '../../core/database/db';

const SEED_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    internalCode: '00101',
    name: 'Arroz Tipo 1 5kg - Safra Sul',
    categoryId: 'cat-1',
    unitMeasure: 'UN',
    barcodes: ['7891234560011', '7891234560012'],
    costPriceCents: 2200,
    retailPriceCents: 3000,
    tierPrices: [
      { minQuantity: 10, priceCents: 2800 },
      { minQuantity: 50, priceCents: 2600 }
    ],
    minStock: 20,
    maxStock: 200,
    currentStock: 85,
    isWeighable: false,
    isActive: true
  },
  {
    id: 'prod-2',
    internalCode: '00102',
    name: 'Óleo de Soja 900ml',
    categoryId: 'cat-1',
    unitMeasure: 'UN',
    barcodes: ['7891234560028'],
    costPriceCents: 550,
    retailPriceCents: 790,
    tierPrices: [{ minQuantity: 12, priceCents: 720 }],
    minStock: 30,
    maxStock: 300,
    currentStock: 14,
    isWeighable: false,
    isActive: true
  },
  {
    id: 'prod-3',
    internalCode: '00201',
    name: 'Refrigerante Cola 2L',
    categoryId: 'cat-2',
    unitMeasure: 'UN',
    barcodes: ['7891234560035'],
    costPriceCents: 600,
    retailPriceCents: 950,
    tierPrices: [{ minQuantity: 6, priceCents: 850 }],
    minStock: 24,
    maxStock: 150,
    currentStock: 48,
    isWeighable: false,
    isActive: true
  },
  {
    id: 'prod-4',
    internalCode: '00301',
    name: 'Maçã Gala Nacional (Kg)',
    categoryId: 'cat-3',
    unitMeasure: 'KG',
    barcodes: ['2000000003010'],
    costPriceCents: 450,
    retailPriceCents: 890,
    tierPrices: [{ minQuantity: 5, priceCents: 750 }],
    minStock: 10,
    maxStock: 80,
    currentStock: 5,
    isWeighable: true,
    isActive: true
  }
];

interface ProductState {
  products: Product[];
  categories: Category[];
  movements: InventoryMovement[];
  isLoading: boolean;

  loadFromDb: () => Promise<void>;
  saveProduct: (productData: any) => Promise<void>;
  adjustStock: (productId: string, type: MovementType, quantity: number, reason: string, notes: string, userName?: string) => Promise<void>;
  deductStockFromSale: (saleItems: Array<{ productId: string; quantity: number }>, saleId: string) => Promise<void>;
  importFromCsv: (csvContent: string) => Promise<number>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  products: SEED_PRODUCTS,
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
      if (dbProducts.length > 0) {
        set({ products: dbProducts });
      } else {
        // Inicializa o banco com os produtos semente se estiver vazio
        for (const p of SEED_PRODUCTS) {
          await saveProductToDb(p);
        }
        set({ products: SEED_PRODUCTS });
      }
    } catch (err) {
      console.warn('Usando catálogo em memória:', err);
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

    // 1. Atualiza o estado global na memória instantaneamente
    set(state => {
      const index = state.products.findIndex(p => p.id === id);
      if (index >= 0) {
        const updated = [...state.products];
        updated[index] = productToSave;
        return { products: updated };
      }
      return { products: [productToSave, ...state.products] };
    });

    // 2. Persiste no arquivo SQLite
    try {
      await saveProductToDb(productToSave);
    } catch (err) {
      console.error('Erro ao salvar produto no SQLite:', err);
    }
  },

  adjustStock: async (productId, type, quantity, reason, notes, userName = 'Richard (Admin)') => {
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

  importFromCsv: async (csvContent) => {
    const count = await importNexCsv(csvContent);
    await get().loadFromDb();
    return count;
  }
}));