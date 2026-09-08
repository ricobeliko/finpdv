import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { Product, Category, InventoryMovement } from '../../modules/products/types';

import { CashSession, CashMovement, CashClosingSummary } from '../../modules/cash/types';
import { Customer } from '../../modules/customers/types';
import { Supplier, Purchase, PurchaseItem } from '../../modules/purchases/types';
import { SalePayment } from '../../modules/pos/types';
import { initFinPdvDb } from './finpdvDb';
import { authService } from '../auth/authService';

let dbInstance: Database | null = null;
let tablesInitialized = false;

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:finpdv.db');
  }
  if (!tablesInitialized) {
    await initTables(dbInstance);
    tablesInitialized = true;
  }
  return dbInstance;
}


async function initTables(db: Database) {
  // Inicialização DDL executada de forma nativa e isolada no startup em db_bootstrap.rs (Rust)
  // Sem necessidade de privilégios sql:allow-execute no contexto WebView/Frontend
  await initFinPdvDb(db);
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
  await invoke('db_open_cash_session', {
    session: {
      id: session.id,
      userId: session.userId,
      userName: session.userName,
      isOpen: true,
      openedAt: session.openedAt,
      initialAmountCents: session.initialAmountCents,
      notes: ''
    },
    initialMov: {
      id: initialMov.id,
      sessionId: initialMov.sessionId,
      userId: initialMov.userId,
      type: initialMov.type,
      amountCents: initialMov.amountCents,
      reason: initialMov.reason,
      timestamp: initialMov.timestamp
    }
  });
}

export async function insertCashMovementDb(mov: CashMovement) {
  if (authService.getCurrentUser()) {
    const requiredPerm = mov.type === 'WITHDRAW' ? 'cash.withdraw' : 'cash.supply';
    authService.checkPermissionOrThrow(requiredPerm, 'Movimentação de caixa');
  }
  await invoke('db_create_cash_movement', {
    movement: {
      id: mov.id,
      sessionId: mov.sessionId,
      userId: mov.userId,
      type: mov.type,
      amountCents: mov.amountCents,
      reason: mov.reason,
      timestamp: mov.timestamp
    }
  });
}

export async function closeCashSessionDb(summary: CashClosingSummary) {
  await invoke('db_close_cash_session', {
    summary: {
      sessionId: summary.sessionId,
      closedAt: summary.closedAt,
      salesCashCents: summary.salesCashCents,
      suppliesCents: summary.suppliesCents,
      withdrawsCents: summary.withdrawsCents,
      expectedDrawerCents: summary.expectedDrawerCents,
      countedCents: summary.countedCents,
      differenceCents: summary.differenceCents
    }
  });
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
  if (session && !session.isOpen && session.closedAt) {
    await closeCashSessionDb({
      sessionId: session.id,
      openedAt: session.openedAt || new Date().toISOString(),
      closedAt: session.closedAt,
      userName: session.userName || '',
      initialAmountCents: session.initialCents ?? session.initialAmountCents ?? 0,
      salesCashCents: session.totalSalesCents ?? session.salesCashCents ?? 0,
      suppliesCents: session.totalSupplementsCents ?? session.suppliesCents ?? 0,
      withdrawsCents: session.totalBleedsCents ?? session.withdrawsCents ?? 0,
      expectedDrawerCents: session.expectedCents ?? session.expectedDrawerCents ?? 0,
      countedCents: session.finalCents ?? session.countedCents ?? 0,
      differenceCents: session.differenceCents ?? 0
    });
  }
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
  await insertCashMovementDb({
    id: mov.id,
    sessionId: mov.sessionId,
    userId: mov.userId || 'usr-admin',
    type: mov.type,
    amountCents: mov.amountCents ?? mov.amount_cents ?? 0,
    reason: mov.reason,
    timestamp: mov.timestamp
  });
}

export async function updateCashMovementDb(_id: string, _type: string, _reason: string): Promise<void> {
  // Movimentos de caixa são imutáveis por compliance fiscal/contábil
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
    userName: sale.userName || sale.user_name || null,
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

export interface CancelSaleOptions {
  saleId: string;
  currentSessionId?: string | null;
  userId?: string | null;
  userName?: string | null;
  reason?: string | null;
  cancelledAt?: string | null;
}

export async function cancelSaleDb(optionsOrSaleId: string | CancelSaleOptions): Promise<void> {
  if (authService.getCurrentUser()) {
    authService.checkPermissionOrThrow('sale.cancel', 'Cancelar venda');
  }
  const options: CancelSaleOptions = typeof optionsOrSaleId === 'string'
    ? { saleId: optionsOrSaleId }
    : optionsOrSaleId;

  const now = options.cancelledAt || new Date().toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$2-$1');

  const payload = {
    saleId: options.saleId,
    currentSessionId: options.currentSessionId || null,
    userId: options.userId || null,
    userName: options.userName || null,
    reason: options.reason || null,
    cancelledAt: now
  };

  try {
    await invoke('cancel_sale_transaction', { payload });
  } catch (err) {
    console.error('Erro na transação de cancelamento da venda:', err);
    throw err;
  }
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
  if (authService.getCurrentUser()) {
    if (!authService.hasPermission('product.create') && !authService.hasPermission('product.edit')) {
      authService.checkPermissionOrThrow('product.edit', 'Salvar/editar produto');
    }
  }

  await invoke('db_save_product', {
    product: {
      id: product.id,
      internalCode: product.internalCode,
      name: product.name,
      categoryId: product.categoryId || null,
      unitMeasure: product.unitMeasure,
      costPriceCents: product.costPriceCents,
      retailPriceCents: product.retailPriceCents,
      currentStock: product.currentStock,
      minStock: product.minStock,
      allowFractionalSale: Boolean(product.isWeighable),
      notes: null,
      barcodes: product.barcodes || [],
      tierPrices: (product.tierPrices || []).map(t => ({
        id: (t as any).id || `tier-${Date.now()}-${Math.random()}`,
        minQuantity: t.minQuantity,
        priceCents: t.priceCents
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  });
}

export const saveProductDb = saveProductToDb;

export async function deleteProductDb(id: string): Promise<void> {
  if (authService.getCurrentUser()) {
    authService.checkPermissionOrThrow('product.delete', 'Excluir produto');
  }
  await invoke('db_delete_product', { id });
}

export async function updateStockDb(productId: string, newStock: number): Promise<void> {
  if (authService.getCurrentUser()) {
    authService.checkPermissionOrThrow('stock.edit', 'Ajustar saldo de estoque');
  }
  await invoke('db_update_stock', { productId, newStock });
}

export async function insertMovementDb(movement: InventoryMovement): Promise<void> {
  if (authService.getCurrentUser()) {
    authService.checkPermissionOrThrow('stock.edit', 'Registrar movimentação de estoque');
  }
  await invoke('db_insert_inventory_movement', {
    movement: {
      id: movement.id,
      productId: movement.productId,
      productName: movement.productName,
      type: movement.type,
      quantity: movement.quantity,
      previousStock: movement.previousBalance,
      newStock: movement.newBalance,
      costPriceCents: movement.costPriceCents,
      operatorName: movement.userName || null,
      notes: movement.notes || null,
      createdAt: movement.createdAt
    }
  });
}

export async function importNexCsv(csvContent: string): Promise<number> {
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
      await saveProductToDb({
        id: prodId,
        internalCode: code,
        name,
        categoryId: '',
        costPriceCents: costCents,
        retailPriceCents: retailCents,
        currentStock: stock,
        minStock: 0,
        maxStock: 0,
        unitMeasure: 'UN',
        isWeighable: false,
        isActive: true,
        barcodes: barcode ? [barcode] : [],
        tierPrices: []
      });
      count++;
    } catch (err) {
      console.error(`Erro ao importar item ${name}:`, err);
    }
  }

  return count;
}

// ZERA 100% DE TODAS AS TABELAS DO BANCO DE DADOS VIA BACKEND RUST AUTORIZADO
export async function resetDatabaseDb(): Promise<void> {
  await invoke('db_reset_database');
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
  await invoke('db_save_category', {
    category: {
      id: category.id,
      name: category.name
    }
  });
}

export async function deleteCategoryDb(id: string): Promise<void> {
  await invoke('db_delete_category', { id });
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
  await invoke('db_save_customer', {
    customer: {
      id: c.id,
      name: c.name,
      document: c.document || null,
      phone: c.phone || null,
      email: null,
      address: c.address || null,
      totalSpentCents: c.totalSpentCents || 0,
      purchasesCount: c.purchasesCount || 0,
      lastPurchaseDate: c.lastPurchaseDate || null,
      createdAt: c.createdAt || new Date().toISOString()
    }
  });
}

export async function deleteCustomerDb(id: string): Promise<void> {
  await invoke('db_delete_customer', { id });
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
  await invoke('db_save_supplier', {
    supplier: {
      id: s.id,
      name: s.companyName,
      tradeName: s.tradeName || null,
      document: s.document || null,
      phone: s.phone || null,
      email: s.email || null,
      address: null,
      contactPerson: s.contactName || null,
      notes: null,
      createdAt: s.createdAt || new Date().toISOString()
    }
  });
}

export async function deleteSupplierDb(id: string): Promise<void> {
  await invoke('db_delete_supplier', { id });
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
  await invoke('db_save_purchase', {
    purchase: {
      id: p.id,
      supplierId: p.supplierId || null,
      invoiceNumber: p.invoiceNumber || null,
      totalCostCents: p.totalCents,
      purchasedAt: p.receivedAt || new Date().toISOString(),
      notes: p.notes || null,
      items: (p.items || []).map(it => ({
        id: it.id || `pi-${Date.now()}-${Math.random()}`,
        purchaseId: p.id,
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        unitCostCents: it.unitCostCents,
        totalCostCents: it.totalCostCents
      })),
      createdAt: (p as any).createdAt || p.receivedAt || new Date().toISOString()
    }
  });
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
    appName: 'FinPDV',
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
  if (authService.getCurrentUser()) {
    authService.checkPermissionOrThrow('backup.restore', 'Restaurar backup');
  }
  if (!dump || !dump.data) {
    throw new Error('Arquivo de backup inválido ou corrompido.');
  }

  const dumpJson = JSON.stringify(dump);
  const message = await invoke<string>('db_restore_database_dump', { dumpJson });
  return { success: true, message: message || 'Restauração concluída com sucesso!' };
}