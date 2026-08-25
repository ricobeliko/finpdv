import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { Product, Category, InventoryMovement } from '../../modules/products/types';

import { CashSession, CashMovement, CashClosingSummary } from '../../modules/cash/types';
import { Customer } from '../../modules/customers/types';
import { Supplier, Purchase, PurchaseItem } from '../../modules/purchases/types';
import { SalePayment } from '../../modules/pos/types';

let dbInstance: Database | null = null;
let tablesInitialized = false;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:mercado.db');
  }
  if (!tablesInitialized) {
    await initTables(dbInstance);
    tablesInitialized = true;
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

  try {
    const catCount = await db.select<any[]>('SELECT count(*) as count FROM categories');
    if (!catCount || catCount.length === 0 || catCount[0]?.count === 0) {
      await db.execute(`INSERT OR IGNORE INTO categories (id, name) VALUES 
        ('cat-1', 'Mercearia & Grãos'),
        ('cat-2', 'Bebidas'),
        ('cat-3', 'Hortifrúti'),
        ('cat-4', 'Limpeza & Higiene')
      `);
    }
  } catch (_) {}

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
      max_stock REAL,
      is_weighable INTEGER NOT NULL DEFAULT 0,
      is_open_price INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
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
      min_quantity REAL NOT NULL,
      price_cents INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
  `);

  // 2. SESSÕES DE CAIXA E MOVIMENTAÇÕES
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
      status TEXT NOT NULL DEFAULT 'COMPLETED',
      cancelled_at TEXT,
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      method TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
    );
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
  `);

  // Migrations idempotentes de colunas em sales para bancos existentes
  try {
    await db.execute(`ALTER TABLE sales ADD COLUMN status TEXT NOT NULL DEFAULT 'COMPLETED';`);
  } catch (_) {}

  try {
    await db.execute(`ALTER TABLE sales ADD COLUMN cancelled_at TEXT;`);
  } catch (_) {}

  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);`);
  } catch (_) {}

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

  // 5. CLIENTES
  await db.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      document TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      total_spent_cents INTEGER NOT NULL DEFAULT 0,
      purchases_count INTEGER NOT NULL DEFAULT 0,
      last_purchase_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  // 6. FORNECEDORES
  await db.execute(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      trade_name TEXT,
      document TEXT NOT NULL,
      phone TEXT,
      contact_name TEXT,
      email TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 7. COMPRAS / ENTRADAS
  await db.execute(`
    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      order_number TEXT,
      supplier_id TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      invoice_number TEXT,
      total_cents INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
    );
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      internal_code TEXT,
      unit_measure TEXT NOT NULL DEFAULT 'UN',
      quantity REAL NOT NULL,
      unit_cost_cents INTEGER NOT NULL,
      total_cost_cents INTEGER NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
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
  if (!sale || !sale.id) {
    throw new Error('Dados da venda inválidos.');
  }

  const items = sale.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('A venda deve conter pelo menos 1 item.');
  }

  const rawPayments = sale.payments;
  if (!rawPayments || !Array.isArray(rawPayments) || rawPayments.length === 0) {
    throw new Error('A venda deve conter pelo menos 1 forma de pagamento.');
  }

  const totalCents = sale.totalCents ?? sale.total_cents ?? 0;
  const changeCents = sale.changeCents ?? sale.change_cents ?? 0;

  // Normalização do troco: o troco é deduzido estritamente dos pagamentos em dinheiro (CASH)
  let remainingChange = changeCents;
  const normalizedPayments: Array<{ id: string; method: string; amountCents: number }> = [];

  for (let i = 0; i < rawPayments.length; i++) {
    const p = rawPayments[i];
    let netAmount = p.amountCents ?? p.amount_cents ?? 0;

    if (typeof netAmount !== 'number' || netAmount <= 0) {
      throw new Error(`Valor de pagamento inválido (${netAmount}).`);
    }

    if (p.method === 'CASH' && remainingChange > 0) {
      if (netAmount >= remainingChange) {
        netAmount -= remainingChange;
        remainingChange = 0;
      } else {
        remainingChange -= netAmount;
        netAmount = 0;
      }
    }

    if (netAmount > 0) {
      normalizedPayments.push({
        id: p.id || `pay-${sale.id}-${i}-${Date.now().toString(36)}`,
        method: p.method,
        amountCents: netAmount
      });
    }
  }

  if (remainingChange > 0) {
    throw new Error(`Troco de R$ ${(changeCents / 100).toFixed(2)} excede o total pago em dinheiro.`);
  }

  const totalNormalized = normalizedPayments.reduce((sum, p) => sum + p.amountCents, 0);
  if (totalNormalized !== totalCents) {
    throw new Error(`Soma dos pagamentos líquidos (${totalNormalized}) difere do total da venda (${totalCents}).`);
  }

  const mainPayment = rawPayments[0]?.method || sale.payment_method || 'CASH';
  const saleStatus = sale.status || 'COMPLETED';
  const cancelledAt = sale.cancelledAt || null;
  const createdAt = sale.date || sale.created_at || new Date().toLocaleString('pt-BR');

  // Garante que o banco SQLite esteja aberto antes de invocar a transação Rust
  await getDb();

  const payload = {
    id: sale.id,
    sessionId: sale.sessionId || sale.session_id || null,
    userId: sale.userId || sale.user_id || null,
    customerId: sale.customer?.id || sale.customerId || sale.customer_id || null,
    customerName: sale.customer?.name || sale.customerName || sale.customer_name || 'Consumidor',
    subtotalCents: sale.subtotalCents ?? sale.subtotal_cents ?? totalCents,
    discountCents: sale.discountCents ?? sale.discount_cents ?? 0,
    totalCents,
    changeCents,
    paymentMethod: mainPayment,
    status: saleStatus,
    cancelledAt,
    createdAt,
    items: items.map((item: any, i: number) => ({
      id: item.id || `si-${sale.id}-${i}-${Date.now()}`,
      productId: item.productId || item.product_id,
      productName: item.name || item.product_name || 'Produto',
      quantity: Number(item.quantity) || 1,
      unitPriceCents: item.unitPriceCents ?? item.unit_price_cents ?? 0,
      costPriceCents: item.costPriceCents ?? item.cost_price_cents ?? 0,
      totalCents: item.totalCents ?? item.total_cents ?? 0
    })),
    payments: normalizedPayments
  };

  try {
    await invoke('save_sale_transaction', { sale: payload });
  } catch (err) {
    console.error('Erro na persistência transacional da venda:', err);
    throw err;
  }
}


export async function getSalePaymentsDb(saleId: string): Promise<SalePayment[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT id, sale_id as saleId, method, amount_cents as amountCents, created_at as createdAt
     FROM sale_payments
     WHERE sale_id = $1
     ORDER BY created_at ASC`,
    [saleId]
  );
  return rows || [];
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

  // 1. Salva / Atualiza o produto principal
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

  // 2. Atualiza códigos de barras associados (com validação estrita de duplicidade)
  await db.execute(`DELETE FROM product_barcodes WHERE product_id = $1`, [product.id]);
  if (product.barcodes && Array.isArray(product.barcodes)) {
    for (const b of product.barcodes) {
      const cleanBarcode = b ? b.trim() : '';
      if (cleanBarcode) {
        const existing = await db.select<any[]>(
          `SELECT product_id FROM product_barcodes WHERE barcode = $1 AND product_id != $2`,
          [cleanBarcode, product.id]
        );
        if (existing && existing.length > 0) {
          throw new Error(`O código de barras "${cleanBarcode}" já está associado a outro produto.`);
        }

        await db.execute(
          `INSERT INTO product_barcodes (id, product_id, barcode) VALUES ($1, $2, $3)`,
          [`bar-${Date.now()}-${Math.random()}`, product.id, cleanBarcode]
        );
      }
    }
  }

  // 3. Atualiza faixas de preço de atacado
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

// ============================================================
// CATEGORIAS
// ============================================================

export async function loadCategoriesDb(): Promise<Category[]> {
  try {
    const db = await getDb();
    const rows = await db.select<Category[]>('SELECT id, name FROM categories ORDER BY name ASC');
    return rows || [];
  } catch (err) {
    console.error('Erro ao carregar categorias do SQLite:', err);
    return [];
  }
}

export async function saveCategoryDb(category: Category): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO categories (id, name) VALUES ($1, $2)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
    [category.id, category.name]
  );
}

export async function deleteCategoryDb(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM categories WHERE id = $1', [id]);
}

// ============================================================
// CLIENTES
// ============================================================

export async function loadCustomersDb(): Promise<Customer[]> {
  try {
    const db = await getDb();
    const rows = await db.select<any[]>('SELECT * FROM customers ORDER BY name ASC');
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      document: r.document || '',
      phone: r.phone || '',
      address: r.address || '',
      notes: r.notes || '',
      totalSpentCents: r.total_spent_cents || 0,
      purchasesCount: r.purchases_count || 0,
      lastPurchaseDate: r.last_purchase_date || undefined,
      isActive: r.is_active === 1,
      createdAt: r.created_at
    }));
  } catch (err) {
    console.error('Erro ao carregar clientes do SQLite:', err);
    return [];
  }
}

export async function saveCustomerDb(c: Customer): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO customers (id, name, document, phone, address, notes, total_spent_cents, purchases_count, last_purchase_date, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       document = excluded.document,
       phone = excluded.phone,
       address = excluded.address,
       notes = excluded.notes,
       total_spent_cents = excluded.total_spent_cents,
       purchases_count = excluded.purchases_count,
       last_purchase_date = excluded.last_purchase_date,
       is_active = excluded.is_active`,
    [
      c.id,
      c.name,
      c.document,
      c.phone,
      c.address,
      c.notes,
      c.totalSpentCents || 0,
      c.purchasesCount || 0,
      c.lastPurchaseDate || null,
      c.isActive ? 1 : 0,
      c.createdAt || new Date().toLocaleDateString('pt-BR')
    ]
  );
}

export async function deleteCustomerDb(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM customers WHERE id = $1', [id]);
}

// ============================================================
// FORNECEDORES
// ============================================================

export async function loadSuppliersDb(): Promise<Supplier[]> {
  try {
    const db = await getDb();
    const rows = await db.select<any[]>('SELECT * FROM suppliers ORDER BY company_name ASC');
    return rows.map(r => ({
      id: r.id,
      companyName: r.company_name,
      tradeName: r.trade_name || '',
      document: r.document || '',
      phone: r.phone || '',
      contactName: r.contact_name || '',
      email: r.email || '',
      createdAt: r.created_at
    }));
  } catch (err) {
    console.error('Erro ao carregar fornecedores do SQLite:', err);
    return [];
  }
}

export async function saveSupplierDb(s: Supplier): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO suppliers (id, company_name, trade_name, document, phone, contact_name, email, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT(id) DO UPDATE SET
       company_name = excluded.company_name,
       trade_name = excluded.trade_name,
       document = excluded.document,
       phone = excluded.phone,
       contact_name = excluded.contact_name,
       email = excluded.email`,
    [
      s.id,
      s.companyName,
      s.tradeName,
      s.document,
      s.phone,
      s.contactName,
      s.email,
      s.createdAt || new Date().toLocaleDateString('pt-BR')
    ]
  );
}

export async function deleteSupplierDb(id: string): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM suppliers WHERE id = $1', [id]);
}

// ============================================================
// COMPRAS / ENTRADAS DE NOTAS
// ============================================================

export async function loadPurchasesDb(): Promise<Purchase[]> {
  try {
    const db = await getDb();
    const purchasesRows = await db.select<any[]>('SELECT * FROM purchases ORDER BY created_at DESC');
    const itemsRows = await db.select<any[]>('SELECT * FROM purchase_items');

    return purchasesRows.map(p => {
      const items: PurchaseItem[] = itemsRows
        .filter(i => i.purchase_id === p.id)
        .map(i => ({
          id: i.id,
          productId: i.product_id,
          productName: i.product_name,
          internalCode: i.internal_code || '',
          unitMeasure: i.unit_measure,
          quantity: i.quantity,
          unitCostCents: i.unit_cost_cents,
          totalCostCents: i.total_cost_cents
        }));

      return {
        id: p.id,
        orderNumber: p.order_number || `COMPRA-${p.id.slice(-4)}`,
        supplierId: p.supplier_id,
        supplierName: p.supplier_name,
        invoiceNumber: p.invoice_number || '',
        totalCents: p.total_cents,
        status: p.status || 'RECEIVED',
        receivedAt: p.received_at || p.created_at || new Date().toLocaleString('pt-BR'),
        notes: p.notes || '',
        items
      };
    });
  } catch (err) {
    console.error('Erro ao carregar compras do SQLite:', err);
    return [];
  }
}

export async function savePurchaseDb(p: Purchase): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO purchases (id, order_number, supplier_id, supplier_name, invoice_number, total_cents, status, received_at, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(id) DO UPDATE SET
       order_number = excluded.order_number,
       supplier_id = excluded.supplier_id,
       supplier_name = excluded.supplier_name,
       invoice_number = excluded.invoice_number,
       total_cents = excluded.total_cents,
       status = excluded.status,
       received_at = excluded.received_at,
       notes = excluded.notes`,
    [
      p.id,
      p.orderNumber || `COMPRA-${p.id.slice(-4)}`,
      p.supplierId,
      p.supplierName,
      p.invoiceNumber || '',
      p.totalCents,
      p.status,
      p.receivedAt || new Date().toLocaleString('pt-BR'),
      p.notes || '',
      p.receivedAt || new Date().toLocaleString('pt-BR')
    ]
  );

  if (p.items && p.items.length > 0) {
    for (const item of p.items) {
      await db.execute(
        `INSERT INTO purchase_items (id, purchase_id, product_id, product_name, internal_code, unit_measure, quantity, unit_cost_cents, total_cost_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           quantity = excluded.quantity,
           unit_cost_cents = excluded.unit_cost_cents,
           total_cost_cents = excluded.total_cost_cents`,
        [
          item.id || `pi-${Date.now()}-${Math.random()}`,
          p.id,
          item.productId,
          item.productName,
          item.internalCode || '',
          item.unitMeasure || 'UN',
          item.quantity,
          item.unitCostCents,
          item.totalCostCents
        ]
      );
    }
  }
}

export async function getSaleItemsDb(saleId: string): Promise<Array<{ productId: string; quantity: number }>> {
  try {
    const db = await getDb();
    const rows = await db.select<any[]>(`SELECT product_id as productId, quantity FROM sale_items WHERE sale_id = $1`, [saleId]);
    return rows || [];
  } catch (err) {
    console.error('Erro ao buscar itens da venda para estorno:', err);
    return [];
  }
}

export async function getSessionSaleItemsMapDb(sessionId?: string): Promise<Record<string, Array<{ name: string; quantity: number; totalCents: number }>>> {
  try {
    const db = await getDb();
    const query = sessionId
      ? `SELECT si.sale_id, si.product_name, si.quantity, si.total_cents, p.name as p_name
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         LEFT JOIN products p ON p.id = si.product_id
         WHERE s.session_id = $1`
      : `SELECT si.sale_id, si.product_name, si.quantity, si.total_cents, p.name as p_name
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id`;
    const params = sessionId ? [sessionId] : [];
    const rows = await db.select<any[]>(query, params);

    const map: Record<string, Array<{ name: string; quantity: number; totalCents: number }>> = {};
    for (const r of rows) {
      if (!map[r.sale_id]) map[r.sale_id] = [];
      map[r.sale_id].push({
        name: r.product_name || r.p_name || 'Produto',
        quantity: r.quantity,
        totalCents: r.total_cents
      });
    }
    return map;
  } catch (err) {
    console.error('Erro ao buscar itens das vendas da sessão:', err);
    return {};
  }
}

// ============================================================
// EXPORTAÇÃO E RESTAURAÇÃO COMPLETA DE BACKUP (FÍSICO & JSON)
// ============================================================

export interface FullDatabaseDump {
  version: string;
  exportedAt: string;
  appName: string;
  recordsCount: {
    products: number;
    categories: number;
    sales: number;
    saleItems: number;
    salePayments?: number;
    cashSessions: number;
    cashMovements: number;
    inventoryMovements: number;
    customers: number;
    suppliers: number;
    purchases: number;
    purchaseItems: number;
  };
  data: {
    categories: any[];
    products: any[];
    productBarcodes: any[];
    productTierPrices: any[];
    cashSessions: any[];
    cashMovements: any[];
    sales: any[];
    saleItems: any[];
    salePayments?: any[];
    inventoryMovements: any[];
    customers: any[];
    suppliers: any[];
    purchases: any[];
    purchaseItems: any[];
  };
}

export async function exportFullDatabaseDumpDb(): Promise<FullDatabaseDump> {
  const db = await getDb();
  
  const [
    categories,
    products,
    productBarcodes,
    productTierPrices,
    cashSessions,
    cashMovements,
    sales,
    saleItems,
    salePayments,
    inventoryMovements,
    customers,
    suppliers,
    purchases,
    purchaseItems
  ] = await Promise.all([
    db.select<any[]>('SELECT * FROM categories').catch(() => []),
    db.select<any[]>('SELECT * FROM products').catch(() => []),
    db.select<any[]>('SELECT * FROM product_barcodes').catch(() => []),
    db.select<any[]>('SELECT * FROM product_tier_prices').catch(() => []),
    db.select<any[]>('SELECT * FROM cash_sessions').catch(() => []),
    db.select<any[]>('SELECT * FROM cash_movements').catch(() => []),
    db.select<any[]>('SELECT * FROM sales').catch(() => []),
    db.select<any[]>('SELECT * FROM sale_items').catch(() => []),
    db.select<any[]>('SELECT * FROM sale_payments').catch(() => []),
    db.select<any[]>('SELECT * FROM inventory_movements').catch(() => []),
    db.select<any[]>('SELECT * FROM customers').catch(() => []),
    db.select<any[]>('SELECT * FROM suppliers').catch(() => []),
    db.select<any[]>('SELECT * FROM purchases').catch(() => []),
    db.select<any[]>('SELECT * FROM purchase_items').catch(() => [])
  ]);

  return {
    version: '1.0.0',
    exportedAt: new Date().toLocaleString('pt-BR'),
    appName: 'Mercearia Uber POS',
    recordsCount: {
      products: products.length,
      categories: categories.length,
      sales: sales.length,
      saleItems: saleItems.length,
      salePayments: salePayments.length,
      cashSessions: cashSessions.length,
      cashMovements: cashMovements.length,
      inventoryMovements: inventoryMovements.length,
      customers: customers.length,
      suppliers: suppliers.length,
      purchases: purchases.length,
      purchaseItems: purchaseItems.length
    },
    data: {
      categories,
      products,
      productBarcodes,
      productTierPrices,
      cashSessions,
      cashMovements,
      sales,
      saleItems,
      salePayments,
      inventoryMovements,
      customers,
      suppliers,
      purchases,
      purchaseItems
    }
  };
}


export async function restoreFullDatabaseDumpDb(dump: FullDatabaseDump): Promise<{ success: boolean; message: string }> {
  if (!dump || !dump.data) {
    throw new Error('Arquivo de backup inválido ou corrompido.');
  }

  const db = await getDb();
  const d = dump.data;

  // Restaura categorias
  if (Array.isArray(d.categories)) {
    for (const c of d.categories) {
      await db.execute(
        `INSERT INTO categories (id, name) VALUES ($1, $2)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        [c.id, c.name]
      ).catch(() => {});
    }
  }

  // Restaura produtos
  if (Array.isArray(d.products)) {
    for (const p of d.products) {
      await db.execute(
        `INSERT INTO products (id, internal_code, name, category_id, unit_measure, cost_price_cents, retail_price_cents, current_stock, min_stock, is_weighable, is_active)
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
          p.id,
          p.internal_code,
          p.name,
          p.category_id || null,
          p.unit_measure || 'UN',
          p.cost_price_cents || 0,
          p.retail_price_cents,
          p.current_stock || 0,
          p.min_stock || 0,
          p.is_weighable ? 1 : 0,
          p.is_active ? 1 : 0
        ]
      ).catch(() => {});
    }
  }

  // Restaura códigos de barra
  if (Array.isArray(d.productBarcodes)) {
    for (const b of d.productBarcodes) {
      await db.execute(
        `INSERT INTO product_barcodes (id, product_id, barcode) VALUES ($1, $2, $3)
         ON CONFLICT(id) DO NOTHING`,
        [b.id, b.product_id, b.barcode]
      ).catch(() => {});
    }
  }

  // Restaura preços por faixa
  if (Array.isArray(d.productTierPrices)) {
    for (const t of d.productTierPrices) {
      await db.execute(
        `INSERT INTO product_tier_prices (id, product_id, min_quantity, price_cents) VALUES ($1, $2, $3, $4)
         ON CONFLICT(id) DO NOTHING`,
        [t.id, t.product_id, t.min_quantity, t.price_cents]
      ).catch(() => {});
    }
  }

  // Restaura sessões de caixa
  if (Array.isArray(d.cashSessions)) {
    for (const s of d.cashSessions) {
      await db.execute(
        `INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, closed_at, initial_amount_cents, sales_cash_cents, supplies_cents, withdraws_cents, expected_drawer_cents, counted_cents, difference_cents, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
          s.id,
          s.user_id,
          s.user_name,
          s.is_open,
          s.opened_at,
          s.closed_at,
          s.initial_amount_cents,
          s.sales_cash_cents,
          s.supplies_cents,
          s.withdraws_cents,
          s.expected_drawer_cents,
          s.counted_cents,
          s.difference_cents,
          s.notes
        ]
      ).catch(() => {});
    }
  }

  // Restaura movimentações de caixa
  if (Array.isArray(d.cashMovements)) {
    for (const m of d.cashMovements) {
      await db.execute(
        `INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           amount_cents = excluded.amount_cents,
           reason = excluded.reason`,
        [m.id, m.session_id, m.user_id, m.type, m.amount_cents, m.reason, m.timestamp]
      ).catch(() => {});
    }
  }

  // Restaura vendas
  if (Array.isArray(d.sales)) {
    for (const s of d.sales) {
      await db.execute(
        `INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, cancelled_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT(id) DO UPDATE SET
           subtotal_cents = excluded.subtotal_cents,
           discount_cents = excluded.discount_cents,
           total_cents = excluded.total_cents,
           change_cents = excluded.change_cents,
           payment_method = excluded.payment_method,
           status = excluded.status,
           cancelled_at = excluded.cancelled_at`,
        [
          s.id,
          s.session_id,
          s.user_id,
          s.customer_id,
          s.customer_name,
          s.subtotal_cents,
          s.discount_cents,
          s.total_cents,
          s.change_cents,
          s.payment_method,
          s.status || 'COMPLETED',
          s.cancelled_at || null,
          s.created_at
        ]
      ).catch(() => {});
    }
  }

  // Restaura itens de vendas
  if (Array.isArray(d.saleItems)) {
    for (const si of d.saleItems) {
      await db.execute(
        `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
           quantity = excluded.quantity,
           total_cents = excluded.total_cents`,
        [
          si.id,
          si.sale_id,
          si.product_id,
          si.product_name,
          si.quantity,
          si.unit_price_cents,
          si.cost_price_cents,
          si.total_cents
        ]
      ).catch(() => {});
    }
  }

  // Restaura pagamentos de vendas
  if (Array.isArray(d.salePayments)) {
    for (const p of d.salePayments) {
      await db.execute(
        `INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(id) DO NOTHING`,
        [
          p.id,
          p.sale_id,
          p.method,
          p.amount_cents,
          p.created_at || new Date().toISOString()
        ]
      ).catch(() => {});
    }
  }

  // Restaura movimentações de estoque
  if (Array.isArray(d.inventoryMovements)) {
    for (const im of d.inventoryMovements) {
      await db.execute(
        `INSERT INTO inventory_movements (id, product_id, product_name, type, quantity, previous_balance, new_balance, cost_price_cents, user_name, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT(id) DO NOTHING`,
        [
          im.id,
          im.product_id,
          im.product_name,
          im.type,
          im.quantity,
          im.previous_balance,
          im.new_balance,
          im.cost_price_cents,
          im.user_name,
          im.notes,
          im.created_at
        ]
      ).catch(() => {});
    }
  }

  // Restaura clientes
  if (Array.isArray(d.customers)) {
    for (const cust of d.customers) {
      await db.execute(
        `INSERT INTO customers (id, name, document, phone, address, notes, total_spent_cents, purchases_count, last_purchase_date, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           document = excluded.document,
           phone = excluded.phone,
           address = excluded.address,
           notes = excluded.notes,
           total_spent_cents = excluded.total_spent_cents,
           purchases_count = excluded.purchases_count,
           last_purchase_date = excluded.last_purchase_date,
           is_active = excluded.is_active`,
        [
          cust.id,
          cust.name,
          cust.document,
          cust.phone,
          cust.address,
          cust.notes,
          cust.total_spent_cents,
          cust.purchases_count,
          cust.last_purchase_date,
          cust.is_active,
          cust.created_at
        ]
      ).catch(() => {});
    }
  }

  // Restaura fornecedores
  if (Array.isArray(d.suppliers)) {
    for (const sup of d.suppliers) {
      await db.execute(
        `INSERT INTO suppliers (id, company_name, trade_name, document, phone, contact_name, email, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(id) DO UPDATE SET
           company_name = excluded.company_name,
           trade_name = excluded.trade_name,
           document = excluded.document,
           phone = excluded.phone,
           contact_name = excluded.contact_name,
           email = excluded.email`,
        [
          sup.id,
          sup.company_name,
          sup.trade_name,
          sup.document,
          sup.phone,
          sup.contact_name,
          sup.email,
          sup.created_at
        ]
      ).catch(() => {});
    }
  }

  // Restaura compras
  if (Array.isArray(d.purchases)) {
    for (const pur of d.purchases) {
      await db.execute(
        `INSERT INTO purchases (id, order_number, supplier_id, supplier_name, invoice_number, total_cents, status, received_at, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT(id) DO UPDATE SET
           order_number = excluded.order_number,
           supplier_id = excluded.supplier_id,
           supplier_name = excluded.supplier_name,
           invoice_number = excluded.invoice_number,
           total_cents = excluded.total_cents,
           status = excluded.status,
           received_at = excluded.received_at,
           notes = excluded.notes`,
        [
          pur.id,
          pur.order_number,
          pur.supplier_id,
          pur.supplier_name,
          pur.invoice_number,
          pur.total_cents,
          pur.status,
          pur.received_at,
          pur.notes,
          pur.created_at
        ]
      ).catch(() => {});
    }
  }

  // Restaura itens de compras
  if (Array.isArray(d.purchaseItems)) {
    for (const pi of d.purchaseItems) {
      await db.execute(
        `INSERT INTO purchase_items (id, purchase_id, product_id, product_name, internal_code, unit_measure, quantity, unit_cost_cents, total_cost_cents)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT(id) DO UPDATE SET
           quantity = excluded.quantity,
           unit_cost_cents = excluded.unit_cost_cents,
           total_cost_cents = excluded.total_cost_cents`,
        [
          pi.id,
          pi.purchase_id,
          pi.product_id,
          pi.product_name,
          pi.internal_code,
          pi.unit_measure,
          pi.quantity,
          pi.unit_cost_cents,
          pi.total_cost_cents
        ]
      ).catch(() => {});
    }
  }

  return { success: true, message: 'Restauração concluída com sucesso!' };
}