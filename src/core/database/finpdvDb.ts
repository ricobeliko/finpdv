import { getDb } from './db';
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
  const db = await getDb();

  // 1. DADOS DA INSTALAÇÃO (ID ÚNICO POR MÁQUINA)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS installation_info (
      installation_id TEXT PRIMARY KEY,
      is_configured INTEGER NOT NULL DEFAULT 0,
      configured_at TEXT,
      version TEXT NOT NULL
    );
  `);

  // 2. PERFIL DA EMPRESA (CLIENTE CONFIGURÁVEL)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS business_profile (
      id TEXT PRIMARY KEY,
      trade_name TEXT NOT NULL,
      corporate_name TEXT,
      cnpj TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      logo TEXT,
      receipt_footer_msg TEXT NOT NULL DEFAULT 'Obrigado pela preferência! Volte sempre.',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 3. LOJAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES business_profile(id) ON DELETE CASCADE
    );
  `);

  // 4. TERMINAIS / CAIXAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      printer_name TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
  `);

  // 5. USUÁRIOS E OPERADORES DO FINPDV COM RBAC
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      pin_hash TEXT,
      role TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 6. LOGS DE AUDITORIA DE AÇÕES CRÍTICAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      role TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);`);

  // 7. SESSÕES TEMPORÁRIAS DE SUPORTE TÉCNICO (FINPDV SUPPORT)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS support_sessions (
      id TEXT PRIMARY KEY,
      challenge TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      granted_by_user_id TEXT,
      created_at TEXT NOT NULL
    );
  `);

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

  // Se não existir, gera o installation_id persistente
  const newInstallationId = 'finpdv-inst-' + crypto.randomUUID();
  await db.execute(
    'INSERT INTO installation_info (installation_id, is_configured, configured_at, version) VALUES ($1, 0, NULL, $2)',
    [newInstallationId, '1.0.0']
  );

  return {
    installationId: newInstallationId,
    isConfigured: false,
    configuredAt: null,
    version: '1.0.0'
  };
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
  const db = await getDb();
  await db.execute(
    `INSERT INTO business_profile (id, trade_name, corporate_name, cnpj, phone, email, address, logo, receipt_footer_msg, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       trade_name = excluded.trade_name,
       corporate_name = excluded.corporate_name,
       cnpj = excluded.cnpj,
       phone = excluded.phone,
       email = excluded.email,
       address = excluded.address,
       logo = excluded.logo,
       receipt_footer_msg = excluded.receipt_footer_msg,
       updated_at = excluded.updated_at`,
    [
      profile.id,
      profile.tradeName,
      profile.corporateName,
      profile.cnpj,
      profile.phone,
      profile.email,
      profile.address,
      profile.logo || null,
      profile.receiptFooterMsg,
      profile.createdAt,
      profile.updatedAt
    ]
  );
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
  const db = await getDb();
  await db.execute(
    `INSERT INTO stores (id, business_id, code, name, address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       name = excluded.name,
       address = excluded.address`,
    [store.id, store.businessId, store.code, store.name, store.address, store.createdAt]
  );

  await db.execute(
    `INSERT INTO terminals (id, store_id, code, name, printer_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       name = excluded.name,
       printer_name = excluded.printer_name`,
    [terminal.id, terminal.storeId, terminal.code, terminal.name, terminal.printerName, terminal.createdAt]
  );
}

export async function saveInstallationInfoDb(info: InstallationInfo): Promise<void> {
  await initFinpdvTables();
  const db = await getDb();
  await db.execute(
    `INSERT INTO installation_info (installation_id, is_configured, configured_at, version)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(installation_id) DO UPDATE SET
       is_configured = excluded.is_configured,
       configured_at = excluded.configured_at,
       version = excluded.version`,
    [
      info.installationId,
      info.isConfigured ? 1 : 0,
      info.configuredAt,
      info.appVersion || info.version || '1.0.0'
    ]
  );
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
  await initFinpdvTables();
  const db = await getDb();
  await db.execute(
    `INSERT INTO stores (id, business_id, code, name, address, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       name = excluded.name,
       address = excluded.address`,
    [store.id, store.businessId, store.code, store.name, store.address || '', store.createdAt]
  );
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
  await initFinpdvTables();
  const db = await getDb();
  await db.execute(
    `INSERT INTO terminals (id, store_id, code, name, printer_name, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       code = excluded.code,
       name = excluded.name,
       printer_name = excluded.printer_name`,
    [terminal.id, terminal.storeId, terminal.code, terminal.name, terminal.printerName || '', terminal.createdAt]
  );
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

export async function updateUserLastLoginDb(id: string): Promise<void> {
  await initFinpdvTables();
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute('UPDATE users SET updated_at = $1 WHERE id = $2', [now, id]);
}

export async function createUserDb(user: FinPdvUser): Promise<void> {
  await saveUserDb(user);
}

export async function createSupportSessionDb(session: SupportSession): Promise<void> {
  await initFinpdvTables();
  const db = await getDb();
  await db.execute(
    `INSERT INTO support_sessions (id, challenge, expires_at, is_active, granted_by_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       is_active = excluded.is_active,
       expires_at = excluded.expires_at`,
    [
      session.id,
      session.challenge,
      session.expiresAt,
      session.isActive === false ? 0 : 1,
      session.grantedByUserId || null,
      session.createdAt
    ]
  );
}

export async function markInstallationConfiguredDb(installationId: string): Promise<void> {
  await initFinpdvTables();
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    'UPDATE installation_info SET is_configured = 1, configured_at = $1 WHERE installation_id = $2',
    [now, installationId]
  );
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
  const db = await getDb();
  await db.execute(
    `INSERT INTO users (id, username, name, password_hash, pin_hash, role, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       username = excluded.username,
       name = excluded.name,
       password_hash = excluded.password_hash,
       pin_hash = excluded.pin_hash,
       role = excluded.role,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    [
      user.id,
      user.username.trim().toLowerCase(),
      user.fullName || user.name || '',
      user.passwordHash,
      user.pinHash || null,
      user.role,
      user.isActive ? 1 : 0,
      user.createdAt,
      user.updatedAt || user.createdAt
    ]
  );
}

// ==========================================
// FUNÇÕES DE AUDITORIA
// ==========================================

export async function insertAuditLogDb(entry: Omit<AuditLogEntry, 'id' | 'createdAt'>): Promise<void> {
  try {
    await initFinpdvTables();
    const db = await getDb();
    const id = 'audit-' + crypto.randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO audit_logs (id, user_id, user_name, role, action, entity, entity_id, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        id,
        entry.userId || null,
        entry.userName || null,
        entry.role || null,
        entry.action,
        entry.entity || null,
        entry.entityId || null,
        entry.details || null,
        now
      ]
    );
  } catch (err) {
    console.warn('Falha ao registrar log de auditoria:', err);
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
