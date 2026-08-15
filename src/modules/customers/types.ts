export interface CustomerPurchaseHistory {
  saleId: string;
  date: string;
  itemsCount: number;
  totalCents: number;
  paymentMethod: string;
}

export interface Customer {
  id: string;
  name: string;
  document: string; // CPF ou CNPJ
  phone: string;
  address: string;
  notes: string;
  totalSpentCents: number;
  purchasesCount: number;
  lastPurchaseDate?: string;
  isActive: boolean;
  createdAt: string;
  purchasesHistory?: CustomerPurchaseHistory[];
}