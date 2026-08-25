export interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string;
  status: 'VALID' | 'CORRUPTED';
  type: 'MANUAL' | 'AUTOMATIC';
  recordsCount: {
    products: number;
    sales: number;
    cashMovements: number;
    customers: number;
  };
  dumpData?: string; // JSON serializado do dump
}

export interface StoreSettings {
  companyName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string; // Inscrição Estadual
  phone: string;
  address: string;
  receiptFooterMessage: string;
  printerName?: string;
  printerWidthMm: number; // 80 ou 58
  scaleBaudRate: number;  // 9600, 4800, etc.
  scalePort: string;      // COM1, COM3, etc.
  autoBackupDaily: boolean;
  autoBackupMonthly?: boolean;
  cosmosEnabled?: boolean;
  cosmosToken?: string;
  cosmosUserAgent?: string;
}