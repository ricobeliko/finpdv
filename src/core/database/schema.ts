import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// --- USUÁRIOS E PERMISSÕES ---
export const roles = sqliteTable('roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
});

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  roleId: text('role_id').notNull().references(() => roles.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// --- PRODUTOS E PREÇOS ---
export const productCategories = sqliteTable('product_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  internalCode: text('internal_code').notNull().unique(),
  name: text('name').notNull(),
  categoryId: text('category_id').references(() => productCategories.id),
  unitMeasure: text('unit_measure').notNull().default('UN'),
  costPriceCents: integer('cost_price_cents').notNull().default(0),
  retailPriceCents: integer('retail_price_cents').notNull(),
  minStock: integer('min_stock').notNull().default(0),
  maxStock: integer('max_stock'),
  currentStock: integer('current_stock').notNull().default(0),
  isWeighable: integer('is_weighable', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  nameIdx: index('idx_products_name').on(table.name),
  codeIdx: index('idx_products_code').on(table.internalCode),
}));

export const productBarcodes = sqliteTable('product_barcodes', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  barcode: text('barcode').notNull().unique(),
}, (table) => ({
  barcodeIdx: uniqueIndex('idx_product_barcodes_barcode').on(table.barcode),
}));

export const productTierPrices = sqliteTable('product_tier_prices', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  minQuantity: integer('min_quantity').notNull(),
  priceCents: integer('price_cents').notNull(),
});

// --- ESTOQUE E AUDITORIA DE MOVIMENTAÇÕES ---
export const inventoryMovements = sqliteTable('inventory_movements', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  type: text('type').notNull(), // 'PURCHASE', 'SALE', 'ADJUST_IN', 'ADJUST_OUT', 'LOSS'
  quantity: integer('quantity').notNull(),
  previousBalance: integer('previous_balance').notNull(),
  newBalance: integer('new_balance').notNull(),
  costPriceCents: integer('cost_price_cents').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
  referenceId: text('reference_id'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
}, (table) => ({
  productIdx: index('idx_inventory_movements_product').on(table.productId, table.createdAt),
}));

// --- CAIXA ---
export const cashSessions = sqliteTable('cash_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  openedAt: integer('opened_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
  initialAmountCents: integer('initial_amount_cents').notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
  finalAmountCountedCents: integer('final_amount_counted_cents'),
  finalAmountExpectedCents: integer('final_amount_expected_cents'),
  differenceCents: integer('difference_cents'),
  status: text('status').notNull().default('OPEN'),
  notes: text('notes'),
});

export const cashMovements = sqliteTable('cash_movements', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => cashSessions.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type').notNull(), // 'INITIAL', 'SALE', 'SUPPLY', 'WITHDRAW'
  amountCents: integer('amount_cents').notNull(),
  reason: text('reason').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

// --- VENDAS ---
export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  cashSessionId: text('cash_session_id').notNull().references(() => cashSessions.id),
  userId: text('user_id').notNull().references(() => users.id),
  customerId: text('customer_id'),
  subtotalCents: integer('subtotal_cents').notNull(),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  changeCents: integer('change_cents').notNull().default(0),
  status: text('status').notNull().default('COMPLETED'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`(strftime('%s', 'now'))`),
});

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  costPriceCents: integer('cost_price_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
});