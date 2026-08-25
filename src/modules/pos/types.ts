import { Product, UnitMeasure } from '../products/types';

export type PaymentMethod = 'CASH' | 'PIX' | 'DEBIT' | 'CREDIT';
export type SaleStatus = 'COMPLETED' | 'CANCELLED';

export interface CartItem {
  id: string;
  productId: string;
  internalCode: string;
  name: string;
  unitMeasure: UnitMeasure;
  costPriceCents: number;
  retailPriceCents: number;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isTierApplied: boolean;
  isWeighable: boolean;
}

import { Customer } from '../customers/types';

export { type Customer } from '../customers/types';

export interface PaymentEntry {
  method: PaymentMethod;
  amountCents: number;
}

export interface SalePayment {
  id: string;
  saleId: string;
  method: PaymentMethod;
  amountCents: number;
  createdAt: string;
}

export interface SuspendedSale {
  id: string;
  cart: CartItem[];
  customer: Customer | null;
  generalDiscountCents: number;
  timestamp: string;
  itemCount: number;
  totalCents: number;
}

export interface CompletedSale {
  id: string;
  date: string;
  customer: Customer | null;
  items: CartItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  totalPaidCents: number;
  changeCents: number;
  payments: PaymentEntry[];
  status?: SaleStatus;
  cancelledAt?: string | null;
  sessionId?: string | null;
  userId?: string | null;
}