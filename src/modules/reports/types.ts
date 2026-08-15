export type ReportPeriod = 'TODAY' | 'WEEK' | 'MONTH' | 'ALL';

export interface SalesReportSummary {
  period: ReportPeriod;
  totalGrossCents: number;
  totalDiscountCents: number;
  totalNetCents: number;
  salesCount: number;
  itemsSoldCount: number;
  averageTicketCents: number;
  byPaymentMethod: {
    method: string;
    amountCents: number;
    count: number;
    percentage: number;
  }[];
  byCategory: {
    categoryName: string;
    amountCents: number;
    itemsCount: number;
  }[];
}

export interface ProductPerformanceReport {
  productId: string;
  internalCode: string;
  name: string;
  unitMeasure: string;
  currentStock: number;
  minStock: number;
  costPriceCents: number;
  retailPriceCents: number;
  unitsSold: number;
  totalRevenueCents: number;
  profitCents: number;
  status: 'FAST_MOVING' | 'NORMAL' | 'SLOW_MOVING' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}

export interface CashConsolidatedReport {
  totalSessions: number;
  totalInitialCents: number;
  totalSalesCashCents: number;
  totalSuppliesCents: number;
  totalWithdrawsCents: number;
  totalDifferenceCents: number; // Quebras / Sobras acumuladas
}