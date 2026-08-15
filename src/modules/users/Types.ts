export type RoleId = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STOCKIST';

export type PermissionId = 
  | 'products.view'
  | 'products.create'
  | 'products.edit'
  | 'products.delete'
  | 'sales.create'
  | 'sales.discount'
  | 'sales.cancel'
  | 'cash.open'
  | 'cash.close'
  | 'cash.withdraw'
  | 'inventory.adjust'
  | 'purchases.manage'
  | 'customers.manage'
  | 'reports.view'
  | 'users.manage'
  | 'settings.backup';

export interface Role {
  id: RoleId;
  name: string;
  description: string;
  permissions: PermissionId[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  roleId: RoleId;
  roleName: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityName: string;
  entityId: string;
  details: string;
  createdAt: string;
}