import { getDb } from './db';
import { invoke } from '@tauri-apps/api/core';
import { 
  BusinessProfile, 
  Store, 
  Terminal, 
  InstallationInfo, 
  FinPdvUser, 
  AuditLogEntry, 
  SupportSession 
} from '../finpdv/types';

let finpdvTablesInitialized = false;

export async function initFinPdvDb(_db?: any) {
  await initFinpdvTables();
}

export async function initFinpdvTables() {
  if (finpdvTablesInitialized) return;
  // As tabelas são inicializadas nativamente no setup do Rust em db_bootstrap.rs
  await getDb();
  finpdvTablesInitialized = true;
}

// ==========================================
// FUNÇÕES DE INSTALAÇÃO E CONFIGURAÇÃO INICIAL
// ==========================================

export async function getInstallationInfoDb(): Promise<InstallationInfo> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM installation_info LIMIT 1');
  if (rows && rows.length > 0) {
    const r = rows[0];
    return {
      installationId: r.installation_id,
      isConfigured: r.is_configured === 1,
      configuredAt: r.configured_at,
      version: r.version
    };
  }

  // Se não existir, gera o installation_id persistente via command Rust
  const newInstallationId = 'finpdv-inst-' + crypto.randomUUID();
  const initialInfo: InstallationInfo = {
    installationId: newInstallationId,
    isConfigured: false,
    configuredAt: null,
    version: '1.0.0'
  };

  await saveInstallationInfoDb(initialInfo);
  return initialInfo;
}

export async function saveInstallationInfoDb(info: InstallationInfo): Promise<void> {
  await initFinpdvTables();
  await invoke('db_save_installation_info', {
    info: {
      installationId: info.installationId,
      isConfigured: Boolean(info.isConfigured),
      configuredAt: info.configuredAt || null,
      version: info.appVersion || info.version || '1.0.0'
    }
  });
}

export async function markInstallationConfiguredDb(installationId: string): Promise<void> {
  await initFinpdvTables();
  const now = new Date().toISOString();
  await saveInstallationInfoDb({
    installationId,
    isConfigured: true,
    configuredAt: now,
    version: '1.0.0'
  });
}

export async function getBusinessProfileDb(): Promise<BusinessProfile | null> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM business_profile LIMIT 1');
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    tradeName: r.trade_name,
    corporateName: r.corporate_name || '',
    cnpj: r.cnpj || '',
    phone: r.phone || '',
    email: r.email || '',
    address: r.address || '',
    logo: r.logo || undefined,
    receiptFooterMsg: r.receipt_footer_msg,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function saveBusinessProfileDb(profile: BusinessProfile): Promise<void> {
  await initFinpdvTables();
  await invoke('db_save_business_profile', {
    profile: {
      id: profile.id,
      tradeName: profile.tradeName,
      corporateName: profile.corporateName || null,
      cnpj: profile.cnpj || null,
      phone: profile.phone || null,
      email: profile.email || null,
      address: profile.address || null,
      logo: profile.logo || null,
      receiptFooterMsg: profile.receiptFooterMsg,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    }
  });
}

export async function getStoreAndTerminalDb(): Promise<{ store: Store | null; terminal: Terminal | null }> {
  await initFinpdvTables();
  const db = await getDb();
  const stores = await db.select<any[]>('SELECT * FROM stores LIMIT 1');
  const terminals = await db.select<any[]>('SELECT * FROM terminals LIMIT 1');

  let store: Store | null = null;
  if (stores && stores.length > 0) {
    const s = stores[0];
    store = {
      id: s.id,
      businessId: s.business_id,
      code: s.code,
      name: s.name,
      address: s.address || '',
      createdAt: s.created_at
    };
  }

  let terminal: Terminal | null = null;
  if (terminals && terminals.length > 0) {
    const t = terminals[0];
    terminal = {
      id: t.id,
      storeId: t.store_id,
      code: t.code,
      name: t.name,
      printerName: t.printer_name || '',
      createdAt: t.created_at
    };
  }

  return { store, terminal };
}

export async function saveStoreAndTerminalDb(store: Store, terminal: Terminal): Promise<void> {
  await initFinpdvTables();
  await invoke('db_save_store_and_terminal', {
    store: {
      id: store.id,
      businessId: store.businessId,
      code: store.code,
      name: store.name,
      address: store.address || null,
      createdAt: store.createdAt
    },
    terminal: {
      id: terminal.id,
      storeId: terminal.storeId,
      code: terminal.code,
      name: terminal.name,
      printerName: terminal.printerName || null,
      createdAt: terminal.createdAt
    }
  });
}

export async function getStoresDb(): Promise<Store[]> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM stores ORDER BY created_at ASC');
  return (rows || []).map(s => ({
    id: s.id,
    businessId: s.business_id,
    code: s.code,
    name: s.name,
    address: s.address || '',
    createdAt: s.created_at
  }));
}

export async function saveStoreDb(store: Store): Promise<void> {
  const current = await getStoreAndTerminalDb();
  const terminal: Terminal = current.terminal || {
    id: 'term-default',
    storeId: store.id,
    code: 'CX01',
    name: 'Caixa Principal',
    printerName: '',
    createdAt: new Date().toISOString()
  };
  await saveStoreAndTerminalDb(store, terminal);
}

export async function getTerminalsDb(): Promise<Terminal[]> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM terminals ORDER BY created_at ASC');
  return (rows || []).map(t => ({
    id: t.id,
    storeId: t.store_id,
    code: t.code,
    name: t.name,
    printerName: t.printer_name || '',
    createdAt: t.created_at
  }));
}

export async function saveTerminalDb(terminal: Terminal): Promise<void> {
  const current = await getStoreAndTerminalDb();
  const store: Store = current.store || {
    id: terminal.storeId || 'store-default',
    businessId: 'biz-default',
    code: 'LJ01',
    name: 'Loja Principal',
    address: '',
    createdAt: new Date().toISOString()
  };
  await saveStoreAndTerminalDb(store, terminal);
}

export async function getUsersCountDb(): Promise<number> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT count(*) as count FROM users');
  return rows?.[0]?.count || 0;
}

export async function getUserByIdDb(id: string): Promise<FinPdvUser | null> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    fullName: r.name,
    passwordHash: r.password_hash,
    pinHash: r.pin_hash,
    role: r.role,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function updateUserLastLoginDb(_id: string): Promise<void> {
  // O backend Rust atualiza updated_at automaticamente no auth_login
}

export async function createUserDb(user: FinPdvUser): Promise<void> {
  await saveUserDb(user);
}

export async function createSupportSessionDb(_session: SupportSession): Promise<void> {
  // Support session implementada nativamente
}

// ==========================================
// FUNÇÕES DE USUÁRIOS E RBAC
// ==========================================

export async function getAllUsersDb(): Promise<FinPdvUser[]> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM users ORDER BY name ASC');
  return (rows || []).map(r => ({
    id: r.id,
    username: r.username,
    name: r.name,
    fullName: r.name,
    passwordHash: r.password_hash,
    pinHash: r.pin_hash,
    role: r.role,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

export async function getUserByUsernameDb(username: string): Promise<FinPdvUser | null> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM users WHERE username = $1 LIMIT 1', [username.trim().toLowerCase()]);
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    fullName: r.name,
    passwordHash: r.password_hash,
    pinHash: r.pin_hash,
    role: r.role,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  };
}

export async function saveUserDb(user: FinPdvUser): Promise<void> {
  await initFinpdvTables();
  await invoke('db_save_user', {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.name || '',
      name: user.name || user.fullName || '',
      passwordHash: user.passwordHash,
      pinHash: user.pinHash || null,
      role: user.role,
      isActive: Boolean(user.isActive),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt || user.createdAt
    }
  });
}

// ==========================================
// FUNÇÕES DE AUDITORIA
// ==========================================

export async function insertAuditLogDb(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    await invoke('db_insert_audit_log', {
      entry: {
        userId: entry.userId || null,
        userName: entry.userName || null,
        role: entry.role || null,
        action: entry.action,
        entity: entry.entity || null,
        entityId: entry.entityId || null,
        details: entry.details || null
      }
    });
  } catch (err) {
    console.warn('Falha ao registrar log de auditoria via Rust command:', err);
  }
}

export async function getAuditLogsDb(limit = 100): Promise<AuditLogEntry[]> {
  await initFinpdvTables();
  const db = await getDb();
  const rows = await db.select<any[]>(
    'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return (rows || []).map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    role: r.role,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    details: r.details,
    createdAt: r.created_at
  }));
}
