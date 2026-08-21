export type UnitMeasure = 'UN' | 'KG' | 'LT' | 'CX' | 'MT';

export type MovementType = 'PURCHASE' | 'SALE' | 'ADJUST_IN' | 'ADJUST_OUT' | 'LOSS' | 'COUNT_CORRECTION';

export interface TierPrice {
  minQuantity: number;
  priceCents: number;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  internalCode: string;
  name: string;
  categoryId: string;
  unitMeasure: UnitMeasure;
  barcodes: string[];
  costPriceCents: number;
  retailPriceCents: number;
  tierPrices: TierPrice[];
  minStock: number;
  maxStock: number;
  currentStock: number;
  isWeighable: boolean;
  isOpenPrice?: boolean;
  isActive: boolean;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  costPriceCents: number;
  userName: string;
  notes: string;
  createdAt: string;
}