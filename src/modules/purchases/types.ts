export interface Supplier {
  id: string;
  companyName: string; // Razão Social
  tradeName: string;   // Nome Fantasia
  document: string;    // CNPJ ou CPF
  phone: string;
  contactName: string;
  email?: string;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  productName: string;
  internalCode: string;
  unitMeasure: string;
  quantity: number;
  unitCostCents: number;
  totalCostCents: number;
}

export type PurchaseStatus = 'RECEIVED' | 'PENDING' | 'CANCELED';

export interface PurchaseOrder {
  id: string;
  orderNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  items: PurchaseItem[];
  totalCents: number;
  receivedAt: string;
  invoiceNumber?: string; // Número NF-e / Cupom
  notes?: string;
}

export type Purchase = PurchaseOrder;