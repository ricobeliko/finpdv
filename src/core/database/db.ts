import Database from '@tauri-apps/plugin-sql';
import { Product, InventoryMovement } from '../../modules/products/types';
import { CashSession, CashMovement, CashClosingSummary } from '../../modules/cash/types';

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:mercado.db');
    await initTables(dbInstance);
  }
  return dbInstance;
}

async function initTables(db: Database) {
  await db.execute('PRAGMA journal_mode = WAL;');
  await db.execute('PRAGMA foreign_keys = ON;');

  // 1. PRODUTOS E CATEGORIAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      internal_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category_id TEXT,
      unit_measure TEXT NOT NULL DEFAULT 'UN',
      cost_price_cents INTEGER NOT NULL DEFAULT 0,
      retail_price_cents INTEGER NOT NULL,
      current_stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      is_weighable INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS product_tier_prices (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      min_quantity INTEGER NOT NULL,
      price_cents INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 2. CAIXA
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      initial_amount_cents INTEGER NOT NULL,
      sales_cash_cents INTEGER DEFAULT 0,
      supplies_cents INTEGER DEFAULT 0,
      withdraws_cents INTEGER DEFAULT 0,
      expected_drawer_cents INTEGER DEFAULT 0,
      counted_cents INTEGER DEFAULT 0,
      difference_cents INTEGER DEFAULT 0,
      notes TEXT
    );
  `);

  try {
    await db.execute('ALTER TABLE cash_sessions ADD COLUMN notes TEXT;');
  } catch (_) {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS cash_movements (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
    );
  `);

  // 3. VENDAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      user_id TEXT,
      customer_id TEXT,
      customer_name TEXT,
      subtotal_cents INTEGER NOT NULL,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL,
      change_cents INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      cost_price_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
  `);

  // 4. MOVIMENTAÇÕES DE ESTOQUE
  await db.execute(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity REAL NOT NULL,
      previous_balance REAL NOT NULL,
      new_balance REAL NOT NULL,
      cost_price_cents INTEGER NOT NULL,
      user_name TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

// ============================================================
// FUNÇÕES DE CAIXA
// ============================================================

export async function getActiveCashSessionDb(): Promise<{ session: CashSession | null; movements: CashMovement[] }> {
  const db = await getDb();
  const rows = await db.select<any[]>(`SELECT * FROM cash_sessions WHERE is_open = 1 LIMIT 1`);
  if (rows.length === 0) return { session: null, movements: [] };

  const s = rows[0];
  const session: CashSession = {
    id: s.id,
    userId: s.user_id,
    userName: s.user_name,
    isOpen: true,
    openedAt: s.opened_at,
    initialAmountCents: s.initial_amount_cents
  };

  const movs = await getCashMovementsDb(s.id);
  return { session, movements: movs };
}

export async function openCashSessionDb(session: CashSession, initialMov: CashMovement) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, notes) 
     VALUES ($1, $2, $3, 1, $4, $5, '')`,
    [session.id, session.userId, session.userName, session.openedAt, session.initialAmountCents]
  );
  await db.execute(
    `INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO NOTHING`,
    [initialMov.id, initialMov.sessionId, initialMov.userId, initialMov.type, initialMov.amountCents, initialMov.reason, initialMov.timestamp]
  );
}

export async function insertCashMovementDb(mov: CashMovement) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       amount_cents = excluded.amount_cents,
       reason = excluded.reason`,
    [mov.id, mov.sessionId, mov.userId, mov.type, mov.amountCents, mov.reason, mov.timestamp]
  );
}

export async function closeCashSessionDb(summary: CashClosingSummary) {
  const db = await getDb();
  await db.execute(
    `UPDATE cash_sessions 
     SET is_open = 0, closed_at = $1, sales_cash_cents = $2, supplies_cents = $3, 
         withdraws_cents = $4, expected_drawer_cents = $5, counted_cents = $6, difference_cents = $7 
     WHERE id = $8`,
    [
      summary.closedAt,
      summary.salesCashCents,
      summary.suppliesCents,
      summary.withdrawsCents,
      summary.expectedDrawerCents,
      summary.countedCents,
      summary.differenceCents,
      summary.sessionId
    ]
  );
}

export async function loadClosedCashSessionsDb(): Promise<CashClosingSummary[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(`SELECT * FROM cash_sessions WHERE is_open = 0 ORDER BY closed_at DESC`);
  return rows.map(r => ({
    sessionId: r.id,
    openedAt: r.opened_at,
    closedAt: r.closed_at || '',
    userName: r.user_name,
    initialAmountCents: r.initial_amount_cents,
    salesCashCents: r.sales_cash_cents || 0,
    suppliesCents: r.supplies_cents || 0,
    withdrawsCents: r.withdraws_cents || 0,
    expectedDrawerCents: r.expected_drawer_cents || 0,
    countedCents: r.counted_cents || 0,
    differenceCents: r.difference_cents || 0
  }));
}

export async function getCashSessionsDb(): Promise<any[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM cash_sessions ORDER BY opened_at DESC');
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    isOpen: Boolean(r.is_open),
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    initialCents: r.initial_amount_cents,
    totalSalesCents: r.sales_cash_cents || 0,
    totalSupplementsCents: r.supplies_cents || 0,
    totalBleedsCents: r.withdraws_cents || 0,
    expectedCents: r.expected_drawer_cents || 0,
    finalCents: r.counted_cents || 0,
    differenceCents: r.difference_cents || 0,
    notes: r.notes || ''
  }));
}

export async function saveCashSessionDb(session: any): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO cash_sessions (
      id, user_id, user_name, is_open, opened_at, closed_at, initial_amount_cents,
      sales_cash_cents, supplies_cents, withdraws_cents, expected_drawer_cents,
      counted_cents, difference_cents, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      user_name = excluded.user_name,
      is_open = excluded.is_open,
      opened_at = excluded.opened_at,
      closed_at = excluded.closed_at,
      initial_amount_cents = excluded.initial_amount_cents,
      sales_cash_cents = excluded.sales_cash_cents,
      supplies_cents = excluded.supplies_cents,
      withdraws_cents = excluded.withdraws_cents,
      expected_drawer_cents = excluded.expected_drawer_cents,
      counted_cents = excluded.counted_cents,
      difference_cents = excluded.difference_cents,
      notes = excluded.notes`,
    [
      session.id,
      session.userId || 'usr-admin',
      session.userName || 'Administrador',
      session.isOpen ? 1 : 0,
      session.openedAt,
      session.closedAt || null,
      session.initialCents ?? session.initialAmountCents ?? 0,
      session.totalSalesCents ?? session.salesCashCents ?? 0,
      session.totalSupplementsCents ?? session.suppliesCents ?? 0,
      session.totalBleedsCents ?? session.withdrawsCents ?? 0,
      session.expectedCents ?? session.expectedDrawerCents ?? 0,
      session.finalCents ?? session.countedCents ?? null,
      session.differenceCents ?? 0,
      session.notes || ''
    ]
  );
}

export async function getCashMovementsDb(sessionId: string): Promise<any[]> {
  const db = await getDb();
  const rows = await db.select<any[]>('SELECT * FROM cash_movements WHERE session_id = $1 ORDER BY rowid DESC', [sessionId]);

  const seen = new Set<string>();
  const uniqueRows: any[] = [];

  for (const r of rows) {
    const key = `${r.session_id}|${r.type}|${r.amount_cents}|${r.reason}|${r.timestamp}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueRows.push(r);
    }
  }

  return uniqueRows.map(m => ({
    id: m.id,
    sessionId: m.session_id,
    userId: m.user_id,
    type: m.type,
    amountCents: m.amount_cents,
    reason: m.reason,
    timestamp: m.timestamp
  }));
}

export async function saveCashMovementDb(mov: any): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       amount_cents = excluded.amount_cents,
       reason = excluded.reason`,
    [
      mov.id,
      mov.sessionId,
      mov.userId || 'usr-admin',
      mov.type,
      mov.amountCents ?? mov.amount_cents ?? 0,
      mov.reason,
      mov.timestamp
    ]
  );
}

export async function updateCashMovementDb(id: string, type: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.execute('UPDATE cash_movements SET type = $1, reason = $2 WHERE id = $3', [type, reason, id]);
}

// ============================================================
// FUNÇÕES DE VENDAS
// ============================================================

export async function saveSaleDb(sale: any) {
  const db = await getDb();
  const mainPayment = sale.payments?.[0]?.method || sale.payment_method || 'CASH';

  await db.execute(
    `INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       subtotal_cents = excluded.subtotal_cents,
       discount_cents = excluded.discount_cents,
       total_cents = excluded.total_cents,
       change_cents = excluded.change_cents,
       payment_method = excluded.payment_method`,
    [
      sale.id,
      sale.sessionId || sale.session_id || null,
      sale.userId || sale.user_id || null,
      sale.customer?.id || sale.customer_id || null,
      sale.customer?.name || sale.customer_name || 'Consumidor',
      sale.subtotalCents ?? sale.subtotal_cents ?? sale.totalCents ?? 0,
      sale.discountCents ?? sale.discount_cents ?? 0,
      sale.totalCents ?? sale.total_cents ?? 0,
      sale.changeCents ?? sale.change_cents ?? 0,
      mainPayment,
      sale.date || sale.created_at || new Date().toLocaleString('pt-BR')
    ]
  );

  if (sale.items && Array.isArray(sale.items)) {
    for (const item of sale.items) {
      await db.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
           quantity = excluded.quantity,
           total_cents = excluded.total_cents`,
        [
          item.id || `si-${Date.now()}-${Math.random()}`,
          sale.id,
          item.productId || item.product_id,
          item.name || item.product_name,
          item.quantity,
          item.unitPriceCents ?? item.unit_price_cents ?? 0,
          item.costPriceCents ?? item.cost_price_cents ?? 0,
          item.totalCents ?? item.total_cents ?? 0
        ]
      );
    }
  }
}

export async function cancelSaleDb(saleId: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM sales WHERE id = $1', [saleId]);
  await db.execute('DELETE FROM sale_items WHERE sale_id = $1', [saleId]);
}

export async function loadSalesDb() {
  const db = await getDb();
  return await db.select<any[]>(`SELECT * FROM sales ORDER BY created_at DESC`);
}

export const getSalesDb = loadSalesDb;

// ============================================================
// PRODUTOS & ESTOQUE
// ============================================================

export async function loadProductsFromDb(): Promise<Product[]> {
  try {
    const db = await getDb();
    const rows = await db.select<any[]>(`
      SELECT p.*, 
             (SELECT GROUP_CONCAT(b.barcode) FROM product_barcodes b WHERE b.product_id = p.id) as barcodes_list
      FROM products p
      ORDER BY p.name ASC
    `);

    const tierRows = await db.select<any[]>(`SELECT * FROM product_tier_prices`);

    return rows.map((r) => {
      const tiers = tierRows
        .filter((t) => t.product_id === r.id)
        .map((t) => ({ minQuantity: t.min_quantity, priceCents: t.price_cents }));

      return {
        id: r.id,
        internalCode: r.internal_code,
        name: r.name,
        categoryId: r.category_id || '',
        unitMeasure: r.unit_measure || 'UN',
        barcodes: r.barcodes_list ? r.barcodes_list.split(',') : [],
        costPriceCents: r.cost_price_cents || 0,
        retailPriceCents: r.retail_price_cents || 0,
        tierPrices: tiers,
        minStock: r.min_stock || 0,
        maxStock: 0,
        currentStock: r.current_stock || 0,
        isWeighable: Boolean(r.is_weighable),
        isActive: Boolean(r.is_active),
      };
    });
  } catch (err) {
    console.error('Erro ao ler produtos do SQLite:', err);
    return [];
  }
}

export const getProductsDb = loadProductsFromDb;

export async function saveProductToDb(product: Product): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO products 
     (id, internal_code, name, category_id, unit_measure, cost_price_cents, retail_price_cents, current_stock, min_stock, is_weighable, is_active) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       internal_code = excluded.internal_code,
       name = excluded.name,
       category_id = excluded.category_id,
       unit_measure = excluded.unit_measure,
       cost_price_cents = excluded.cost_price_cents,
       retail_price_cents = excluded.retail_price_cents,
       current_stock = excluded.current_stock,
       min_stock = excluded.min_stock,
       is_weighable = excluded.is_weighable,
       is_active = excluded.is_active`,
    [
      product.id,
      product.internalCode,
      product.name,
      product.categoryId || null,
      product.unitMeasure,
      product.costPriceCents,
      product.retailPriceCents,
      product.currentStock,
      product.minStock,
      product.isWeighable ? 1 : 0,
      product.isActive ? 1 : 0,
    ]
  );

  await db.execute(`DELETE FROM product_barcodes WHERE product_id = $1`, [product.id]);
  if (product.barcodes && Array.isArray(product.barcodes)) {
    for (const b of product.barcodes) {
      if (b && b.trim()) {
        await db.execute(
          `INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode) VALUES ($1, $2, $3)`,
          [`bar-${Date.now()}-${Math.random()}`, product.id, b.trim()]
        );
      }
    }
  }

  await db.execute(`DELETE FROM product_tier_prices WHERE product_id = $1`, [product.id]);
  if (product.tierPrices && Array.isArray(product.tierPrices)) {
    for (const t of product.tierPrices) {
      await db.execute(
        `INSERT INTO product_tier_prices (id, product_id, min_quantity, price_cents) VALUES ($1, $2, $3, $4)`,
        [`tier-${Date.now()}-${Math.random()}`, product.id, t.minQuantity, t.priceCents]
      );
    }
  }
}

export const saveProductDb = saveProductToDb;

export async function deleteProductDb(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM products WHERE id = $1', [id]);
}

export async function updateStockDb(productId: string, newStock: number): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, productId]);
}

export async function insertMovementDb(movement: InventoryMovement): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO inventory_movements 
     (id, product_id, product_name, type, quantity, previous_balance, new_balance, cost_price_cents, user_name, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      movement.id,
      movement.productId,
      movement.productName,
      movement.type,
      movement.quantity,
      movement.previousBalance,
      movement.newBalance,
      movement.costPriceCents,
      movement.userName,
      movement.notes,
      movement.createdAt,
    ]
  );
}

export async function importNexCsv(csvContent: string): Promise<number> {
  const db = await getDb();
  const lines = csvContent.split(/\r?\n/);
  let count = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const delimiter = line.includes(';') ? ';' : ',';
    const cols = line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());
    if (cols.length < 3) continue;

    const code = cols[0] || `NEX-${i}`;
    const barcode = cols[1] || '';
    const name = cols[2];
    const costCents = Math.round(parseFloat((cols[3] || '0').replace(',', '.')) * 100) || 0;
    const retailCents = Math.round(parseFloat((cols[4] || '0').replace(',', '.')) * 100) || 0;
    const stock = parseFloat((cols[5] || '0').replace(',', '.')) || 0;

    if (!name || retailCents <= 0) continue;

    const prodId = `prod-nex-${Date.now()}-${i}`;

    try {
      await db.execute(
        `INSERT INTO products 
         (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT(id) DO UPDATE SET
           internal_code = excluded.internal_code,
           name = excluded.name,
           cost_price_cents = excluded.cost_price_cents,
           retail_price_cents = excluded.retail_price_cents,
           current_stock = excluded.current_stock`,
        [prodId, code, name, costCents, retailCents, stock]
      );

      if (barcode) {
        await db.execute(
          `INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode) VALUES ($1, $2, $3)`,
          [`bar-${Date.now()}-${i}`, prodId, barcode]
        );
      }
      count++;
    } catch (err) {
      console.error(`Erro ao importar item ${name}:`, err);
    }
  }

  return count;
}

// ZERA 100% DE TODAS AS TABELAS DO BANCO DE DADOS
export async function resetDatabaseDb(): Promise<void> {
  const db = await getDb();
  const tables = [
    'products',
    'product_barcodes',
    'product_tier_prices',
    'categories',
    'sales',
    'sale_items',
    'cash_sessions',
    'cash_movements',
    'inventory_movements',
    'customers',
    'clients',
    'purchases',
    'purchase_items',
    'suppliers'
  ];

  for (const table of tables) {
    try {
      await db.execute(`DELETE FROM ${table}`);
    } catch (_) {}
  }
}