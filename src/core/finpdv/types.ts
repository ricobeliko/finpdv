export type RoleType = 
  | 'OPERATOR' 
  | 'SUPERVISOR' 
  | 'MANAGER' 
  | 'CLIENT_ADMIN' 
  | 'FINPDV_SUPPORT';

export type PermissionCode =
  | 'sale.create'
  | 'sale.cancel'
  | 'sale.discount'
  | 'sale.reopen'
  | 'cash.open'
  | 'cash.close'
  | 'cash.withdraw'
  | 'cash.supply'
  | 'product.view'
  | 'product.create'
  | 'product.edit'
  | 'product.delete'
  | 'stock.view'
  | 'stock.edit'
  | 'reports.view'
  | 'users.view'
  | 'users.manage'
  | 'settings.view'
  | 'settings.manage'
  | 'maintenance.view'
  | 'maintenance.execute'
  | 'backup.create'
  | 'backup.restore';

export const ROLE_PERMISSIONS: Record<RoleType, PermissionCode[]> = {
  OPERATOR: [
    'sale.create',
    'product.view',
    'cash.open',
    'cash.close',
  ],
  SUPERVISOR: [
    'sale.create',
    'sale.cancel',
    'sale.discount',
    'product.view',
    'cash.open',
    'cash.close',
    'cash.withdraw',
    'cash.supply',
    'stock.view',
  ],
  MANAGER: [
    'sale.create',
    'sale.cancel',
    'sale.discount',
    'sale.reopen',
    'product.view',
    'product.create',
    'product.edit',
    'stock.view',
    'stock.edit',
    'cash.open',
    'cash.close',
    'cash.withdraw',
    'cash.supply',
    'reports.view',
    'backup.create',
  ],
  CLIENT_ADMIN: [
    'sale.create',
    'sale.cancel',
    'sale.discount',
    'sale.reopen',
    'product.view',
    'product.create',
    'product.edit',
    'product.delete',
    'stock.view',
    'stock.edit',
    'cash.open',
    'cash.close',
    'cash.withdraw',
    'cash.supply',
    'reports.view',
    'users.view',
    'users.manage',
    'settings.view',
    'settings.manage',
    'maintenance.view',
    'backup.create',
    'backup.restore',
  ],
  FINPDV_SUPPORT: [
    'sale.create',
    'sale.cancel',
    'sale.discount',
    'sale.reopen',
    'product.view',
    'product.create',
    'product.edit',
    'product.delete',
    'stock.view',
    'stock.edit',
    'cash.open',
    'cash.close',
    'cash.withdraw',
    'cash.supply',
    'reports.view',
    'users.view',
    'users.manage',
    'settings.view',
    'settings.manage',
    'maintenance.view',
    'maintenance.execute',
    'backup.create',
    'backup.restore',
  ],
};

export interface BusinessProfile {
  id: string;
  tradeName: string;
  corporateName?: string;
  legalName?: string;
  cnpj?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo?: string;
  receiptFooterMsg?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  businessId: string;
  code: string;
  name: string;
  address?: string;
  createdAt: string;
}

export interface Terminal {
  id: string;
  storeId: string;
  code: string;
  name: string;
  printerName?: string;
  createdAt: string;
}

export interface InstallationInfo {
  installationId: string;
  isConfigured: boolean;
  configuredAt: string | null;
  version: string;
  appVersion?: string;
  environment?: string;
}

export interface FinPdvUser {
  id: string;
  username: string;
  name?: string;
  fullName: string;
  passwordHash: string;
  pinHash?: string | null;
  role: RoleType;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId?: string | null;
  userName?: string | null;
  role?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: string | null;
  createdAt: string;
}

export interface SupportSession {
  id: string;
  installationId: string;
  challenge: string;
  expiresAt: string;
  permissions?: string[];
  isActive?: boolean;
  grantedByUserId?: string | null;
  createdAt: string;
}
