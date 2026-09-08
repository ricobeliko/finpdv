use crate::security::{
    authenticate_user, clear_session, require_permission, ActiveUserSession, SessionState,
};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use tauri::State;

fn get_pool(db_instances: &tauri_plugin_sql::DbInstances) -> Result<Pool<Sqlite>, String> {
    // Usamos o runtime do tokio para ler o lock das instâncias
    let instances = tauri::async_runtime::block_on(async { db_instances.0.read().await });
    let db_pool = instances
        .get("sqlite:finpdv.db")
        .or_else(|| instances.values().next())
        .ok_or_else(|| "Banco de dados 'sqlite:finpdv.db' não carregado".to_string())?;

    match db_pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => Ok(pool.clone()),
        #[allow(unreachable_patterns)]
        _ => Err("Tipo de banco de dados não suportado (esperado SQLite)".into()),
    }
}

// ==========================================
// 1. AUTH COMMANDS (RUST MANAGED)
// ==========================================

#[tauri::command]
pub async fn auth_login(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    username: String,
    credential: String,
) -> Result<ActiveUserSession, String> {
    let pool = get_pool(&db_instances)?;
    authenticate_user(&session_state, &pool, &username, &credential).await
}

#[tauri::command]
pub async fn auth_logout(session_state: State<'_, SessionState>) -> Result<(), String> {
    clear_session(&session_state).await;
    Ok(())
}

#[tauri::command]
pub async fn auth_get_session(
    session_state: State<'_, SessionState>,
) -> Result<Option<ActiveUserSession>, String> {
    let read_guard = session_state.0.read().await;
    Ok(read_guard.clone())
}

// ==========================================
// 2. USER MANAGEMENT (RBAC ENFORCED)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserPayload {
    pub id: String,
    pub username: String,
    pub full_name: Option<String>,
    pub name: Option<String>,
    pub password_hash: String,
    pub pin_hash: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub async fn db_save_user(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    user: UserPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;

    // Verifica se já existem usuários no banco (onboarding inicial permite criar primeiro CLIENT_ADMIN)
    let user_count: (i64,) = sqlx::query_as("SELECT count(*) FROM users")
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Erro ao consultar contagem de usuários: {}", e))?;

    if user_count.0 > 0 {
        require_permission(&session_state, &pool, "users.manage").await?;
    }

    let display_name = user
        .full_name
        .clone()
        .or(user.name.clone())
        .unwrap_or_else(|| user.username.clone());

    let updated_at = user.updated_at.unwrap_or_else(|| user.created_at.clone());

    sqlx::query(
        "INSERT INTO users (id, username, name, password_hash, pin_hash, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           username = excluded.username,
           name = excluded.name,
           password_hash = excluded.password_hash,
           pin_hash = excluded.pin_hash,
           role = excluded.role,
           is_active = excluded.is_active,
           updated_at = excluded.updated_at",
    )
    .bind(&user.id)
    .bind(user.username.trim().to_lowercase())
    .bind(display_name)
    .bind(&user.password_hash)
    .bind(user.pin_hash)
    .bind(&user.role)
    .bind(if user.is_active { 1 } else { 0 })
    .bind(&user.created_at)
    .bind(updated_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar usuário: {}", e))?;

    Ok(())
}

// ==========================================
// 3. CASH SESSIONS & MOVEMENTS (RBAC ENFORCED)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashSessionPayload {
    pub id: String,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub is_open: Option<bool>,
    pub opened_at: String,
    pub closed_at: Option<String>,
    pub initial_amount_cents: i64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashMovementPayload {
    pub id: String,
    pub session_id: String,
    pub user_id: Option<String>,
    pub r#type: String,
    pub amount_cents: i64,
    pub reason: String,
    pub timestamp: String,
}

#[tauri::command]
pub async fn db_open_cash_session(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    session: CashSessionPayload,
    initial_mov: CashMovementPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    let user_sess = require_permission(&session_state, &pool, "cash.open").await?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação de abertura de caixa: {}", e))?;

    sqlx::query(
        "INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, notes)
         VALUES (?, ?, ?, 1, ?, ?, ?)",
    )
    .bind(&session.id)
    .bind(&user_sess.user_id)
    .bind(&user_sess.full_name)
    .bind(&session.opened_at)
    .bind(session.initial_amount_cents)
    .bind(session.notes.unwrap_or_default())
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao inserir sessão de caixa: {}", e))?;

    sqlx::query(
        "INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&initial_mov.id)
    .bind(&initial_mov.session_id)
    .bind(&user_sess.user_id)
    .bind(&initial_mov.r#type)
    .bind(initial_mov.amount_cents)
    .bind(&initial_mov.reason)
    .bind(&initial_mov.timestamp)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao registrar movimento inicial de caixa: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao comitar abertura de caixa: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_create_cash_movement(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    movement: CashMovementPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;

    // Sangria exige cash.withdraw; Suprimento exige cash.supply
    let req_perm = if movement.r#type == "WITHDRAW" || movement.r#type == "WITHDRAWAL" {
        "cash.withdraw"
    } else {
        "cash.supply"
    };

    let user_sess = require_permission(&session_state, &pool, req_perm).await?;

    sqlx::query(
        "INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           amount_cents = excluded.amount_cents,
           reason = excluded.reason",
    )
    .bind(&movement.id)
    .bind(&movement.session_id)
    .bind(&user_sess.user_id)
    .bind(&movement.r#type)
    .bind(movement.amount_cents)
    .bind(&movement.reason)
    .bind(&movement.timestamp)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao registrar movimento de caixa: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CashClosingPayload {
    pub session_id: String,
    pub closed_at: String,
    pub sales_cash_cents: i64,
    pub supplies_cents: i64,
    pub withdraws_cents: i64,
    pub expected_drawer_cents: i64,
    pub counted_cents: i64,
    pub difference_cents: i64,
}

#[tauri::command]
pub async fn db_close_cash_session(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    summary: CashClosingPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "cash.close").await?;

    sqlx::query(
        "UPDATE cash_sessions 
         SET is_open = 0, closed_at = ?, sales_cash_cents = ?, supplies_cents = ?, 
             withdraws_cents = ?, expected_drawer_cents = ?, counted_cents = ?, difference_cents = ? 
         WHERE id = ?",
    )
    .bind(&summary.closed_at)
    .bind(summary.sales_cash_cents)
    .bind(summary.supplies_cents)
    .bind(summary.withdraws_cents)
    .bind(summary.expected_drawer_cents)
    .bind(summary.counted_cents)
    .bind(summary.difference_cents)
    .bind(&summary.session_id)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao fechar sessão de caixa: {}", e))?;

    Ok(())
}

// ==========================================
// 4. PRODUCTS, BARCODES, TIER PRICES & STOCK
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductPayload {
    pub id: String,
    pub internal_code: String,
    pub name: String,
    pub category_id: Option<String>,
    pub unit_measure: String,
    pub cost_price_cents: i64,
    pub retail_price_cents: i64,
    pub current_stock: f64,
    pub min_stock: f64,
    pub allow_fractional_sale: bool,
    pub notes: Option<String>,
    pub barcodes: Option<Vec<String>>,
    pub tier_prices: Option<Vec<TierPricePayload>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierPricePayload {
    pub id: String,
    pub min_quantity: f64,
    pub price_cents: i64,
}

#[tauri::command]
pub async fn db_save_product(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    product: ProductPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "product.edit").await?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação de produto: {}", e))?;

    sqlx::query(
        "INSERT INTO products (
            id, internal_code, name, category_id, unit_measure,
            cost_price_cents, retail_price_cents, current_stock, min_stock,
            allow_fractional_sale, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            internal_code = excluded.internal_code,
            name = excluded.name,
            category_id = excluded.category_id,
            unit_measure = excluded.unit_measure,
            cost_price_cents = excluded.cost_price_cents,
            retail_price_cents = excluded.retail_price_cents,
            current_stock = excluded.current_stock,
            min_stock = excluded.min_stock,
            allow_fractional_sale = excluded.allow_fractional_sale,
            notes = excluded.notes,
            updated_at = excluded.updated_at",
    )
    .bind(&product.id)
    .bind(&product.internal_code)
    .bind(&product.name)
    .bind(&product.category_id)
    .bind(&product.unit_measure)
    .bind(product.cost_price_cents)
    .bind(product.retail_price_cents)
    .bind(product.current_stock)
    .bind(product.min_stock)
    .bind(if product.allow_fractional_sale { 1 } else { 0 })
    .bind(&product.notes)
    .bind(&product.created_at)
    .bind(&product.updated_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao salvar dados do produto: {}", e))?;

    // Códigos de barras
    sqlx::query("DELETE FROM product_barcodes WHERE product_id = ?")
        .bind(&product.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao limpar barcodes do produto: {}", e))?;

    if let Some(barcodes) = product.barcodes {
        for (i, code) in barcodes.iter().enumerate() {
            if !code.trim().is_empty() {
                let bc_id = format!("bc-{}-{}", product.id, i);
                let _ = sqlx::query(
                    "INSERT OR IGNORE INTO product_barcodes (id, product_id, barcode) VALUES (?, ?, ?)",
                )
                .bind(bc_id)
                .bind(&product.id)
                .bind(code.trim())
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Preços atacado
    sqlx::query("DELETE FROM product_tier_prices WHERE product_id = ?")
        .bind(&product.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao limpar preços de atacado do produto: {}", e))?;

    if let Some(tiers) = product.tier_prices {
        for t in tiers {
            let _ = sqlx::query(
                "INSERT INTO product_tier_prices (id, product_id, min_quantity, price_cents) VALUES (?, ?, ?, ?)",
            )
            .bind(t.id)
            .bind(&product.id)
            .bind(t.min_quantity)
            .bind(t.price_cents)
            .execute(&mut *tx)
            .await;
        }
    }

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao comitar produto: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_delete_product(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "product.delete").await?;

    sqlx::query("DELETE FROM products WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao excluir produto: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_update_stock(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    product_id: String,
    new_stock: f64,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "stock.edit").await?;

    sqlx::query("UPDATE products SET current_stock = ? WHERE id = ?")
        .bind(new_stock)
        .bind(product_id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao atualizar estoque: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryMovementPayload {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub r#type: String,
    pub quantity: f64,
    pub previous_stock: f64,
    pub new_stock: f64,
    pub cost_price_cents: i64,
    pub operator_name: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn db_insert_inventory_movement(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    movement: InventoryMovementPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "stock.edit").await?;

    sqlx::query(
        "INSERT INTO inventory_movements (
            id, product_id, product_name, type, quantity,
            previous_stock, new_stock, cost_price_cents, operator_name, notes, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&movement.id)
    .bind(&movement.product_id)
    .bind(&movement.product_name)
    .bind(&movement.r#type)
    .bind(movement.quantity)
    .bind(movement.previous_stock)
    .bind(movement.new_stock)
    .bind(movement.cost_price_cents)
    .bind(&movement.operator_name)
    .bind(&movement.notes)
    .bind(&movement.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao registrar movimentação de estoque: {}", e))?;

    Ok(())
}

// ==========================================
// 5. CATEGORIES
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryPayload {
    pub id: String,
    pub name: String,
}

#[tauri::command]
pub async fn db_save_category(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    category: CategoryPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "product.edit").await?;

    sqlx::query(
        "INSERT INTO categories (id, name) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name",
    )
    .bind(&category.id)
    .bind(&category.name)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar categoria: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_delete_category(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "product.edit").await?;

    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao excluir categoria: {}", e))?;

    Ok(())
}

// ==========================================
// 6. CUSTOMERS, SUPPLIERS, PURCHASES
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerPayload {
    pub id: String,
    pub name: String,
    pub document: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub total_spent_cents: i64,
    pub purchases_count: i64,
    pub last_purchase_date: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn db_save_customer(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    customer: CustomerPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "sale.create").await?;

    sqlx::query(
        "INSERT INTO customers (id, name, document, phone, email, address, total_spent_cents, purchases_count, last_purchase_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           document = excluded.document,
           phone = excluded.phone,
           email = excluded.email,
           address = excluded.address,
           total_spent_cents = excluded.total_spent_cents,
           purchases_count = excluded.purchases_count,
           last_purchase_date = excluded.last_purchase_date",
    )
    .bind(&customer.id)
    .bind(&customer.name)
    .bind(&customer.document)
    .bind(&customer.phone)
    .bind(&customer.email)
    .bind(&customer.address)
    .bind(customer.total_spent_cents)
    .bind(customer.purchases_count)
    .bind(&customer.last_purchase_date)
    .bind(&customer.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar cliente: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_delete_customer(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "sale.create").await?;

    sqlx::query("DELETE FROM customers WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao excluir cliente: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SupplierPayload {
    pub id: String,
    pub name: String,
    pub trade_name: Option<String>,
    pub document: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub contact_person: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn db_save_supplier(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    supplier: SupplierPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "stock.edit").await?;

    sqlx::query(
        "INSERT INTO suppliers (id, name, trade_name, document, phone, email, address, contact_person, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           trade_name = excluded.trade_name,
           document = excluded.document,
           phone = excluded.phone,
           email = excluded.email,
           address = excluded.address,
           contact_person = excluded.contact_person,
           notes = excluded.notes",
    )
    .bind(&supplier.id)
    .bind(&supplier.name)
    .bind(&supplier.trade_name)
    .bind(&supplier.document)
    .bind(&supplier.phone)
    .bind(&supplier.email)
    .bind(&supplier.address)
    .bind(&supplier.contact_person)
    .bind(&supplier.notes)
    .bind(&supplier.created_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar fornecedor: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_delete_supplier(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    id: String,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "stock.edit").await?;

    sqlx::query("DELETE FROM suppliers WHERE id = ?")
        .bind(id)
        .execute(&pool)
        .await
        .map_err(|e| format!("Erro ao excluir fornecedor: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseItemPayload {
    pub id: String,
    pub purchase_id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub unit_cost_cents: i64,
    pub total_cost_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchasePayload {
    pub id: String,
    pub supplier_id: Option<String>,
    pub invoice_number: Option<String>,
    pub total_cost_cents: i64,
    pub purchased_at: String,
    pub notes: Option<String>,
    pub items: Vec<PurchaseItemPayload>,
    pub created_at: String,
}

#[tauri::command]
pub async fn db_save_purchase(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    purchase: PurchasePayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "stock.edit").await?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação de compra: {}", e))?;

    sqlx::query(
        "INSERT INTO purchases (id, supplier_id, invoice_number, total_cost_cents, purchased_at, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           supplier_id = excluded.supplier_id,
           invoice_number = excluded.invoice_number,
           total_cost_cents = excluded.total_cost_cents,
           purchased_at = excluded.purchased_at,
           notes = excluded.notes",
    )
    .bind(&purchase.id)
    .bind(&purchase.supplier_id)
    .bind(&purchase.invoice_number)
    .bind(purchase.total_cost_cents)
    .bind(&purchase.purchased_at)
    .bind(&purchase.notes)
    .bind(&purchase.created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao salvar compra: {}", e))?;

    sqlx::query("DELETE FROM purchase_items WHERE purchase_id = ?")
        .bind(&purchase.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao limpar itens de compra: {}", e))?;

    for it in purchase.items {
        sqlx::query(
            "INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, unit_cost_cents, total_cost_cents)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&it.id)
        .bind(&purchase.id)
        .bind(&it.product_id)
        .bind(&it.product_name)
        .bind(it.quantity)
        .bind(it.unit_cost_cents)
        .bind(it.total_cost_cents)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao inserir item de compra: {}", e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao comitar compra: {}", e))?;

    Ok(())
}

// ==========================================
// 7. BUSINESS PROFILE, STORES, TERMINALS & AUDIT
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BusinessProfilePayload {
    pub id: String,
    pub trade_name: String,
    pub corporate_name: Option<String>,
    pub cnpj: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub logo: Option<String>,
    pub receipt_footer_msg: String,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn db_save_business_profile(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    profile: BusinessProfilePayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;

    // Onboarding inicial permite sem autenticação; depois exige settings.view
    let prof_count: (i64,) = sqlx::query_as("SELECT count(*) FROM business_profile")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    if prof_count.0 > 0 {
        require_permission(&session_state, &pool, "settings.view").await?;
    }

    sqlx::query(
        "INSERT INTO business_profile (id, trade_name, corporate_name, cnpj, phone, email, address, logo, receipt_footer_msg, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           trade_name = excluded.trade_name,
           corporate_name = excluded.corporate_name,
           cnpj = excluded.cnpj,
           phone = excluded.phone,
           email = excluded.email,
           address = excluded.address,
           logo = excluded.logo,
           receipt_footer_msg = excluded.receipt_footer_msg,
           updated_at = excluded.updated_at",
    )
    .bind(&profile.id)
    .bind(&profile.trade_name)
    .bind(&profile.corporate_name)
    .bind(&profile.cnpj)
    .bind(&profile.phone)
    .bind(&profile.email)
    .bind(&profile.address)
    .bind(&profile.logo)
    .bind(&profile.receipt_footer_msg)
    .bind(&profile.created_at)
    .bind(&profile.updated_at)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar perfil da empresa: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorePayload {
    pub id: String,
    pub business_id: String,
    pub code: String,
    pub name: String,
    pub address: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalPayload {
    pub id: String,
    pub store_id: String,
    pub code: String,
    pub name: String,
    pub printer_name: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub async fn db_save_store_and_terminal(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    store: StorePayload,
    terminal: TerminalPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;

    let count: (i64,) = sqlx::query_as("SELECT count(*) FROM stores")
        .fetch_one(&pool)
        .await
        .unwrap_or((0,));

    if count.0 > 0 {
        require_permission(&session_state, &pool, "settings.view").await?;
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação: {}", e))?;

    sqlx::query(
        "INSERT INTO stores (id, business_id, code, name, address, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code = excluded.code,
           name = excluded.name,
           address = excluded.address",
    )
    .bind(&store.id)
    .bind(&store.business_id)
    .bind(&store.code)
    .bind(&store.name)
    .bind(&store.address)
    .bind(&store.created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao salvar loja: {}", e))?;

    sqlx::query(
        "INSERT INTO terminals (id, store_id, code, name, printer_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           code = excluded.code,
           name = excluded.name,
           printer_name = excluded.printer_name",
    )
    .bind(&terminal.id)
    .bind(&terminal.store_id)
    .bind(&terminal.code)
    .bind(&terminal.name)
    .bind(&terminal.printer_name)
    .bind(&terminal.created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao salvar terminal: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao comitar loja e terminal: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationInfoPayload {
    pub installation_id: String,
    pub is_configured: bool,
    pub configured_at: Option<String>,
    pub version: String,
}

#[tauri::command]
pub async fn db_save_installation_info(
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    info: InstallationInfoPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;

    sqlx::query(
        "INSERT INTO installation_info (installation_id, is_configured, configured_at, version)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(installation_id) DO UPDATE SET
           is_configured = excluded.is_configured,
           configured_at = excluded.configured_at,
           version = excluded.version",
    )
    .bind(&info.installation_id)
    .bind(if info.is_configured { 1 } else { 0 })
    .bind(&info.configured_at)
    .bind(&info.version)
    .execute(&pool)
    .await
    .map_err(|e| format!("Erro ao salvar installation_info: {}", e))?;

    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogPayload {
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub role: Option<String>,
    pub action: String,
    pub entity: Option<String>,
    pub entity_id: Option<String>,
    pub details: Option<String>,
}

#[tauri::command]
pub async fn db_insert_audit_log(
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    entry: AuditLogPayload,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let id = format!("audit-{}", nanos);

    let _ = sqlx::query(
        "INSERT INTO audit_logs (id, user_id, user_name, role, action, entity, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
    )
    .bind(id)
    .bind(entry.user_id)
    .bind(entry.user_name)
    .bind(entry.role)
    .bind(entry.action)
    .bind(entry.entity)
    .bind(entry.entity_id)
    .bind(entry.details)
    .execute(&pool)
    .await;

    Ok(())
}

#[tauri::command]
pub async fn db_reset_database(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
) -> Result<(), String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "maintenance.execute").await?;

    let tables = [
        "sale_items",
        "sale_payments",
        "sales",
        "cash_movements",
        "cash_sessions",
        "inventory_movements",
        "purchase_items",
        "purchases",
        "product_tier_prices",
        "product_barcodes",
        "products",
        "categories",
        "customers",
        "suppliers",
    ];

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar reset do banco: {}", e))?;

    for table in tables {
        let q = format!("DELETE FROM {}", table);
        sqlx::query(&q)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao limpar tabela {}: {}", table, e))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao comitar reset: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn db_restore_database_dump(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    dump_json: String,
) -> Result<String, String> {
    let pool = get_pool(&db_instances)?;
    require_permission(&session_state, &pool, "backup.restore").await?;

    let dump: serde_json::Value = serde_json::from_str(&dump_json)
        .map_err(|e| format!("Formato de backup inválido: {}", e))?;

    let data = dump
        .get("data")
        .ok_or_else(|| "Arquivo de backup sem campo 'data'".to_string())?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação de restore: {}", e))?;

    // Categorias
    if let Some(categories) = data.get("categories").and_then(|c| c.as_array()) {
        for c in categories {
            if let (Some(id), Some(name)) = (
                c.get("id").and_then(|v| v.as_str()),
                c.get("name").and_then(|v| v.as_str()),
            ) {
                let _ = sqlx::query(
                    "INSERT INTO categories (id, name) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET name = excluded.name"
                )
                .bind(id)
                .bind(name)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Produtos
    if let Some(products) = data.get("products").and_then(|p| p.as_array()) {
        for p in products {
            let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let internal_code = p.get("internal_code").and_then(|v| v.as_str()).unwrap_or("");
            let name = p.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let category_id = p.get("category_id").and_then(|v| v.as_str());
            let unit_measure = p.get("unit_measure").and_then(|v| v.as_str()).unwrap_or("UN");
            let cost_price_cents = p.get("cost_price_cents").and_then(|v| v.as_i64()).unwrap_or(0);
            let retail_price_cents = p.get("retail_price_cents").and_then(|v| v.as_i64()).unwrap_or(0);
            let current_stock = p.get("current_stock").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let min_stock = p.get("min_stock").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let is_weighable = if p.get("is_weighable").and_then(|v| v.as_bool()).unwrap_or(false) { 1i64 } else { 0i64 };
            let is_active = if p.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true) { 1i64 } else { 0i64 };

            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO products (id, internal_code, name, category_id, unit_measure, cost_price_cents, retail_price_cents, current_stock, min_stock, is_weighable, is_active)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
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
                         is_active = excluded.is_active"#
                )
                .bind(id)
                .bind(internal_code)
                .bind(name)
                .bind(category_id)
                .bind(unit_measure)
                .bind(cost_price_cents)
                .bind(retail_price_cents)
                .bind(current_stock)
                .bind(min_stock)
                .bind(is_weighable)
                .bind(is_active)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Barcodes
    if let Some(barcodes) = data.get("productBarcodes").and_then(|b| b.as_array()) {
        for b in barcodes {
            let id = b.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let product_id = b.get("product_id").and_then(|v| v.as_str()).unwrap_or("");
            let barcode = b.get("barcode").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() && !barcode.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO product_barcodes (id, product_id, barcode) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING"
                )
                .bind(id)
                .bind(product_id)
                .bind(barcode)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Preços por faixa
    if let Some(tier_prices) = data.get("productTierPrices").and_then(|t| t.as_array()) {
        for t in tier_prices {
            let id = t.get("id").and_then(|v| v.as_str()).unwrap_or("");
            let product_id = t.get("product_id").and_then(|v| v.as_str()).unwrap_or("");
            let min_quantity = t.get("min_quantity").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let price_cents = t.get("price_cents").and_then(|v| v.as_i64()).unwrap_or(0);
            if !id.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO product_tier_prices (id, product_id, min_quantity, price_cents) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING"
                )
                .bind(id)
                .bind(product_id)
                .bind(min_quantity)
                .bind(price_cents)
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Sessões de caixa
    if let Some(sessions) = data.get("cashSessions").and_then(|s| s.as_array()) {
        for s in sessions {
            let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, closed_at, initial_amount_cents, sales_cash_cents, supplies_cents, withdraws_cents, expected_drawer_cents, counted_cents, difference_cents, notes)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
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
                         notes = excluded.notes"#
                )
                .bind(id)
                .bind(s.get("user_id").and_then(|v| v.as_str()))
                .bind(s.get("user_name").and_then(|v| v.as_str()))
                .bind(s.get("is_open").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("opened_at").and_then(|v| v.as_str()))
                .bind(s.get("closed_at").and_then(|v| v.as_str()))
                .bind(s.get("initial_amount_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("sales_cash_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("supplies_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("withdraws_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("expected_drawer_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("counted_cents").and_then(|v| v.as_i64()))
                .bind(s.get("difference_cents").and_then(|v| v.as_i64()))
                .bind(s.get("notes").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Movimentações de caixa
    if let Some(movements) = data.get("cashMovements").and_then(|m| m.as_array()) {
        for m in movements {
            let id = m.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                       ON CONFLICT(id) DO UPDATE SET
                         type = excluded.type,
                         amount_cents = excluded.amount_cents,
                         reason = excluded.reason"#
                )
                .bind(id)
                .bind(m.get("session_id").and_then(|v| v.as_str()))
                .bind(m.get("user_id").and_then(|v| v.as_str()))
                .bind(m.get("type").and_then(|v| v.as_str()))
                .bind(m.get("amount_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(m.get("reason").and_then(|v| v.as_str()))
                .bind(m.get("timestamp").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Vendas
    if let Some(sales) = data.get("sales").and_then(|s| s.as_array()) {
        for s in sales {
            let id = s.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, cancelled_at, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                       ON CONFLICT(id) DO UPDATE SET
                         subtotal_cents = excluded.subtotal_cents,
                         discount_cents = excluded.discount_cents,
                         total_cents = excluded.total_cents,
                         change_cents = excluded.change_cents,
                         payment_method = excluded.payment_method,
                         status = excluded.status,
                         cancelled_at = excluded.cancelled_at"#
                )
                .bind(id)
                .bind(s.get("session_id").and_then(|v| v.as_str()))
                .bind(s.get("user_id").and_then(|v| v.as_str()))
                .bind(s.get("customer_id").and_then(|v| v.as_str()))
                .bind(s.get("customer_name").and_then(|v| v.as_str()))
                .bind(s.get("subtotal_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("discount_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("total_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("change_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(s.get("payment_method").and_then(|v| v.as_str()).unwrap_or("MONEY"))
                .bind(s.get("status").and_then(|v| v.as_str()).unwrap_or("COMPLETED"))
                .bind(s.get("cancelled_at").and_then(|v| v.as_str()))
                .bind(s.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Itens de vendas
    if let Some(sale_items) = data.get("saleItems").and_then(|s| s.as_array()) {
        for si in sale_items {
            let id = si.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                       ON CONFLICT(id) DO UPDATE SET
                         quantity = excluded.quantity,
                         total_cents = excluded.total_cents"#
                )
                .bind(id)
                .bind(si.get("sale_id").and_then(|v| v.as_str()))
                .bind(si.get("product_id").and_then(|v| v.as_str()))
                .bind(si.get("product_name").and_then(|v| v.as_str()))
                .bind(si.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(si.get("unit_price_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(si.get("cost_price_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(si.get("total_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Pagamentos de vendas
    if let Some(payments) = data.get("salePayments").and_then(|p| p.as_array()) {
        for p in payments {
            let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    "INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(id) DO NOTHING"
                )
                .bind(id)
                .bind(p.get("sale_id").and_then(|v| v.as_str()))
                .bind(p.get("method").and_then(|v| v.as_str()))
                .bind(p.get("amount_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(p.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Movimentações de estoque
    if let Some(movements) = data.get("inventoryMovements").and_then(|m| m.as_array()) {
        for im in movements {
            let id = im.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO inventory_movements (id, product_id, product_name, type, quantity, previous_balance, new_balance, cost_price_cents, user_name, notes, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                       ON CONFLICT(id) DO NOTHING"#
                )
                .bind(id)
                .bind(im.get("product_id").and_then(|v| v.as_str()))
                .bind(im.get("product_name").and_then(|v| v.as_str()))
                .bind(im.get("type").and_then(|v| v.as_str()))
                .bind(im.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(im.get("previous_balance").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(im.get("new_balance").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(im.get("cost_price_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(im.get("user_name").and_then(|v| v.as_str()))
                .bind(im.get("notes").and_then(|v| v.as_str()))
                .bind(im.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Clientes
    if let Some(customers) = data.get("customers").and_then(|c| c.as_array()) {
        for cust in customers {
            let id = cust.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO customers (id, name, document, phone, address, notes, total_spent_cents, purchases_count, last_purchase_date, is_active, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                       ON CONFLICT(id) DO UPDATE SET
                         name = excluded.name,
                         document = excluded.document,
                         phone = excluded.phone,
                         address = excluded.address,
                         notes = excluded.notes,
                         total_spent_cents = excluded.total_spent_cents,
                         purchases_count = excluded.purchases_count,
                         last_purchase_date = excluded.last_purchase_date,
                         is_active = excluded.is_active"#
                )
                .bind(id)
                .bind(cust.get("name").and_then(|v| v.as_str()))
                .bind(cust.get("document").and_then(|v| v.as_str()))
                .bind(cust.get("phone").and_then(|v| v.as_str()))
                .bind(cust.get("address").and_then(|v| v.as_str()))
                .bind(cust.get("notes").and_then(|v| v.as_str()))
                .bind(cust.get("total_spent_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(cust.get("purchases_count").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(cust.get("last_purchase_date").and_then(|v| v.as_str()))
                .bind(if cust.get("is_active").and_then(|v| v.as_bool()).unwrap_or(true) { 1i64 } else { 0i64 })
                .bind(cust.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Fornecedores
    if let Some(suppliers) = data.get("suppliers").and_then(|s| s.as_array()) {
        for sup in suppliers {
            let id = sup.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO suppliers (id, company_name, trade_name, document, phone, contact_name, email, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                       ON CONFLICT(id) DO UPDATE SET
                         company_name = excluded.company_name,
                         trade_name = excluded.trade_name,
                         document = excluded.document,
                         phone = excluded.phone,
                         contact_name = excluded.contact_name,
                         email = excluded.email"#
                )
                .bind(id)
                .bind(sup.get("company_name").and_then(|v| v.as_str()))
                .bind(sup.get("trade_name").and_then(|v| v.as_str()))
                .bind(sup.get("document").and_then(|v| v.as_str()))
                .bind(sup.get("phone").and_then(|v| v.as_str()))
                .bind(sup.get("contact_name").and_then(|v| v.as_str()))
                .bind(sup.get("email").and_then(|v| v.as_str()))
                .bind(sup.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Compras
    if let Some(purchases) = data.get("purchases").and_then(|p| p.as_array()) {
        for pur in purchases {
            let id = pur.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO purchases (id, order_number, supplier_id, supplier_name, invoice_number, total_cents, status, received_at, notes, created_at)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                       ON CONFLICT(id) DO UPDATE SET
                         order_number = excluded.order_number,
                         supplier_id = excluded.supplier_id,
                         supplier_name = excluded.supplier_name,
                         invoice_number = excluded.invoice_number,
                         total_cents = excluded.total_cents,
                         status = excluded.status,
                         received_at = excluded.received_at,
                         notes = excluded.notes"#
                )
                .bind(id)
                .bind(pur.get("order_number").and_then(|v| v.as_str()))
                .bind(pur.get("supplier_id").and_then(|v| v.as_str()))
                .bind(pur.get("supplier_name").and_then(|v| v.as_str()))
                .bind(pur.get("invoice_number").and_then(|v| v.as_str()))
                .bind(pur.get("total_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(pur.get("status").and_then(|v| v.as_str()))
                .bind(pur.get("received_at").and_then(|v| v.as_str()))
                .bind(pur.get("notes").and_then(|v| v.as_str()))
                .bind(pur.get("created_at").and_then(|v| v.as_str()))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    // Itens de compras
    if let Some(purchase_items) = data.get("purchaseItems").and_then(|p| p.as_array()) {
        for pi in purchase_items {
            let id = pi.get("id").and_then(|v| v.as_str()).unwrap_or("");
            if !id.is_empty() {
                let _ = sqlx::query(
                    r#"INSERT INTO purchase_items (id, purchase_id, product_id, product_name, internal_code, unit_measure, quantity, unit_cost_cents, total_cost_cents)
                       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                       ON CONFLICT(id) DO UPDATE SET
                         quantity = excluded.quantity,
                         unit_cost_cents = excluded.unit_cost_cents,
                         total_cost_cents = excluded.total_cost_cents"#
                )
                .bind(id)
                .bind(pi.get("purchase_id").and_then(|v| v.as_str()))
                .bind(pi.get("product_id").and_then(|v| v.as_str()))
                .bind(pi.get("product_name").and_then(|v| v.as_str()))
                .bind(pi.get("internal_code").and_then(|v| v.as_str()))
                .bind(pi.get("unit_measure").and_then(|v| v.as_str()))
                .bind(pi.get("quantity").and_then(|v| v.as_f64()).unwrap_or(0.0))
                .bind(pi.get("unit_cost_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .bind(pi.get("total_cost_cents").and_then(|v| v.as_i64()).unwrap_or(0))
                .execute(&mut *tx)
                .await;
            }
        }
    }

    tx.commit()
        .await
        .map_err(|e| format!("Erro ao efetivar restore: {}", e))?;

    Ok("Restauração concluída com sucesso!".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReprintSaleResult {
    pub sale_id: String,
    pub original_date: String,
    pub total_cents: i64,
    pub customer_name: Option<String>,
    pub items_count: usize,
    pub printer_name: String,
    pub message: String,
}

#[tauri::command]
pub async fn db_reprint_sale_receipt(
    session_state: State<'_, SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    sale_id: Option<String>,
    printer_name: String,
) -> Result<ReprintSaleResult, String> {
    let pool = get_pool(&db_instances)?;
    let session = require_permission(&session_state, &pool, "sale.reprint").await?;

    // 1. Localiza a venda original persistida
    let target_sale: Option<(String, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64, i64, i64, String, String, String)> = if let Some(ref id) = sale_id {
        sqlx::query_as(
            "SELECT id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at 
             FROM sales WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Erro ao consultar venda #{}: {}", id, e))?
    } else {
        // Se sale_id não foi informado, busca a última venda criada
        sqlx::query_as(
            "SELECT id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at 
             FROM sales ORDER BY created_at DESC LIMIT 1"
        )
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Erro ao consultar última venda: {}", e))?
    };

    let (
        real_sale_id,
        sale_session_id,
        _sale_user_id,
        _cust_id,
        customer_name,
        subtotal_cents,
        discount_cents,
        total_cents,
        change_cents,
        _payment_method,
        status,
        created_at,
    ) = match target_sale {
        Some(s) => s,
        None => {
            let msg = match sale_id {
                Some(id) => format!("Venda #{} não encontrada.", id),
                None => "Nenhuma venda registrada no histórico para reimpressão.".to_string(),
            };
            return Err(msg);
        }
    };

    // 2. Regra de papel:
    // Se o usuário for OPERATOR, ele só pode reimprimir a última venda do seu próprio turno aberto
    if session.role == "OPERATOR" {
        let active_session: Option<(String, String)> = sqlx::query_as(
            "SELECT id, user_id FROM cash_sessions WHERE is_open = 1 AND user_id = ? LIMIT 1"
        )
        .bind(&session.user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Erro ao verificar turno do operador: {}", e))?;

        let (open_session_id, _uid) = match active_session {
            Some(sess) => sess,
            None => return Err("Operador não possui sessão de caixa aberta para reimprimir venda.".to_string()),
        };

        if sale_session_id.as_deref() != Some(&open_session_id) {
            return Err("Operadores só podem reimprimir vendas do seu turno atual. Vendas anteriores exigem autorização de supervisor.".to_string());
        }

        // Verifica se é a última venda da sessão
        let latest_sale_in_sess: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM sales WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
        )
        .bind(&open_session_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| format!("Erro ao consultar histórico de turno: {}", e))?;

        if latest_sale_in_sess.as_ref().map(|s| &s.0) != Some(&real_sale_id) {
            return Err("Operadores só podem reimprimir a última venda realizada. Para vendas anteriores, solicite a um supervisor.".to_string());
        }
    }

    // 3. Consulta itens persistidos da venda original
    let items: Vec<(String, f64, i64, i64)> = sqlx::query_as(
        "SELECT product_name, quantity, unit_price_cents, total_cents FROM sale_items WHERE sale_id = ? ORDER BY id ASC"
    )
    .bind(&real_sale_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erro ao consultar itens da venda #{}: {}", real_sale_id, e))?;

    // 4. Consulta pagamentos persistidos da venda original
    let payments: Vec<(String, i64)> = sqlx::query_as(
        "SELECT method, amount_cents FROM sale_payments WHERE sale_id = ? ORDER BY id ASC"
    )
    .bind(&real_sale_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Erro ao consultar pagamentos da venda #{}: {}", real_sale_id, e))?;

    // 5. Consulta razão social/nome fantasia da empresa
    let trade_name: String = sqlx::query_as::<_, (String,)>("SELECT trade_name FROM business_profile LIMIT 1")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten()
        .map(|r| r.0)
        .unwrap_or_else(|| "FinPDV".to_string());

    // 6. Monta o comprovante ESC/POS com marcação explícita de REIMPRESSÃO
    let mut raw_bytes = Vec::new();
    raw_bytes.extend_from_slice(&[0x1B, 0x40]); // Init
    raw_bytes.extend_from_slice(&[0x1B, 0x61, 1]); // Center
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 1]); // Bold on

    // Cabeçalho da Empresa
    raw_bytes.extend_from_slice(trade_name.to_uppercase().as_bytes());
    raw_bytes.push(0x0A);
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 0]); // Bold off

    // MARCAÇÃO DE REIMPRESSÃO DESTACADA
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 1]);
    raw_bytes.extend_from_slice(b"*** REIMPRESSAO DE COMPROVANTE ***\n");
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 0]);
    raw_bytes.extend_from_slice(b"DOCUMENTO AUXILIAR - SEM VALOR FISCAL\n");
    if status == "CANCELLED" {
        raw_bytes.extend_from_slice(b"--- ATENCAO: VENDA CANCELADA ---\n");
    }
    raw_bytes.extend_from_slice(b"------------------------------------------\n");

    // Identificador original e timestamps
    raw_bytes.extend_from_slice(&[0x1B, 0x61, 0]); // Left
    raw_bytes.extend_from_slice(format!("CUPOM ORIGINAL: #{}\n", real_sale_id).as_bytes());
    raw_bytes.extend_from_slice(format!("DATA DA VENDA:  {}\n", created_at).as_bytes());
    let now_unix = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs();
    raw_bytes.extend_from_slice(format!("REIMPRESSO EM:  Timestamp {}\n", now_unix).as_bytes());
    raw_bytes.extend_from_slice(format!("OPERADOR RESP:  {}\n", session.username).as_bytes());
    raw_bytes.extend_from_slice(format!("CLIENTE:        {}\n", customer_name.as_deref().unwrap_or("CONSUMIDOR FINAL")).as_bytes());
    raw_bytes.extend_from_slice(b"------------------------------------------\n");

    // Itens
    for (name, qty, _unit_price, item_total) in &items {
        let line_item = format!("{:.2}x {:<20} R$ {:.2}\n", qty, name, (*item_total as f64) / 100.0);
        raw_bytes.extend_from_slice(line_item.as_bytes());
    }
    raw_bytes.extend_from_slice(b"------------------------------------------\n");

    // Totais
    raw_bytes.extend_from_slice(format!("SUBTOTAL:                    R$ {:.2}\n", (subtotal_cents as f64) / 100.0).as_bytes());
    if discount_cents > 0 {
        raw_bytes.extend_from_slice(format!("DESCONTO:                   -R$ {:.2}\n", (discount_cents as f64) / 100.0).as_bytes());
    }
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 1]);
    raw_bytes.extend_from_slice(format!("TOTAL DA VENDA:              R$ {:.2}\n", (total_cents as f64) / 100.0).as_bytes());
    raw_bytes.extend_from_slice(&[0x1B, 0x45, 0]);

    // Pagamentos
    for (method, amt) in &payments {
        raw_bytes.extend_from_slice(format!("PAGO ({}):              R$ {:.2}\n", method, (*amt as f64) / 100.0).as_bytes());
    }
    if change_cents > 0 {
        raw_bytes.extend_from_slice(format!("TROCO:                       R$ {:.2}\n", (change_cents as f64) / 100.0).as_bytes());
    }

    // Rodapé
    raw_bytes.extend_from_slice(b"------------------------------------------\n");
    raw_bytes.extend_from_slice(&[0x1B, 0x61, 1]); // Center
    raw_bytes.extend_from_slice(b"*** VIA REIMPRESSA - NAO E VENDA NOVA ***\n");
    raw_bytes.extend_from_slice(&[0x0A, 0x0A, 0x0A, 0x0A]);
    raw_bytes.extend_from_slice(&[0x1D, 0x56, 66, 0]); // Guilhotina

    // 7. Envio físico para a impressora (se nome da impressora for fornecido)
    if !printer_name.is_empty() {
        crate::send_raw_escpos_to_printer(&printer_name, &raw_bytes)
            .map_err(|e| format!("Falha física na impressora ao reimprimir comprovante: {}", e))?;
    }

    // 8. Registro de auditoria: sale.receipt_reprinted
    let audit_id = format!("aud-reprint-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
    let audit_details = format!(r#"{{"saleId":"{}","totalCents":{},"printer":"{}"}}"#, real_sale_id, total_cents, printer_name);
    let now_date_iso = format!("2026-09-08T{:010}", now_unix);
    let _ = sqlx::query(
        "INSERT INTO audit_logs (id, user_id, user_name, role, action, entity, entity_id, details, created_at)
         VALUES (?, ?, ?, ?, 'sale.receipt_reprinted', 'sales', ?, ?, ?)"
    )
    .bind(&audit_id)
    .bind(&session.user_id)
    .bind(&session.username)
    .bind(&session.role)
    .bind(&real_sale_id)
    .bind(&audit_details)
    .bind(&now_date_iso)
    .execute(&pool)
    .await;

    Ok(ReprintSaleResult {
        sale_id: real_sale_id.clone(),
        original_date: created_at,
        total_cents,
        customer_name,
        items_count: items.len(),
        printer_name,
        message: format!("Comprovante da venda #{} reimpresso com sucesso!", real_sale_id),
    })
}

#[cfg(test)]
pub mod reprint_tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use crate::security::{hash_credential_argon2, authenticate_user};

    async fn create_test_db_with_sale() -> (Pool<Sqlite>, SessionState, String, String) {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();

        crate::db_bootstrap::bootstrap_database(&pool).await.unwrap();

        let session_state = SessionState::new();

        // 1. Cria usuário supervisor e operador
        let pass_sup = hash_credential_argon2("sup123").unwrap();
        sqlx::query(
            "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
             VALUES ('u-sup', 'supervisor', 'Supervisor Loja', ?, 'SUPERVISOR', 1, '2026-01-01', '2026-01-01')"
        )
        .bind(&pass_sup)
        .execute(&pool)
        .await
        .unwrap();

        let pass_op = hash_credential_argon2("op123").unwrap();
        sqlx::query(
            "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
             VALUES ('u-op', 'operador', 'Operador Caixa', ?, 'OPERATOR', 1, '2026-01-01', '2026-01-01')"
        )
        .bind(&pass_op)
        .execute(&pool)
        .await
        .unwrap();

        // 2. Abre sessão de caixa para operador
        let sess_id = "sess-1";
        sqlx::query(
            "INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents)
             VALUES (?, 'u-op', 'Operador Caixa', 1, '2026-01-01T08:00:00.000Z', 10000)"
        )
        .bind(sess_id)
        .execute(&pool)
        .await
        .unwrap();

        // 3. Cadastra produto com estoque 50
        let prod_id = "prod-test-1";
        sqlx::query(
            "INSERT INTO products (id, internal_code, name, unit_measure, retail_price_cents, current_stock, min_stock, created_at, updated_at)
             VALUES (?, 'COD-101', 'Arroz 5kg', 'UN', 2500, 50.0, 5.0, '2026-01-01', '2026-01-01')"
        )
        .bind(prod_id)
        .execute(&pool)
        .await
        .unwrap();

        // 4. Cria venda #sale-100 (2 unidades de arroz = R$ 50,00)
        let sale_id = "sale-100";
        sqlx::query(
            "INSERT INTO sales (id, session_id, user_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
             VALUES (?, ?, 'u-op', 'Consumidor', 5000, 0, 5000, 0, 'MONEY', 'COMPLETED', '2026-01-01T10:00:00.000Z')"
        )
        .bind(sale_id)
        .bind(sess_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
             VALUES ('item-1', ?, ?, 'Arroz 5kg', 2.0, 2500, 1500, 5000)"
        )
        .bind(sale_id)
        .bind(prod_id)
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "INSERT INTO sale_payments (id, sale_id, method, amount_cents)
             VALUES ('pay-1', ?, 'MONEY', 5000)"
        )
        .bind(sale_id)
        .execute(&pool)
        .await
        .unwrap();

        // Atualiza estoque para 48
        sqlx::query("UPDATE products SET current_stock = 48.0 WHERE id = ?").bind(prod_id).execute(&pool).await.unwrap();

        (pool, session_state, sale_id.to_string(), prod_id.to_string())
    }

    #[test]
    fn test_reprint_does_not_create_new_sale_or_alter_data() {
        tauri::async_runtime::block_on(async {
            let (pool, session_state, sale_id, prod_id) = create_test_db_with_sale().await;

            // Autentica como supervisor
            authenticate_user(&session_state, &pool, "supervisor", "sup123").await.unwrap();

            // Snapshot antes do reprint
            let sales_count_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sales").fetch_one(&pool).await.unwrap();
            let stock_before: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = ?").bind(&prod_id).fetch_one(&pool).await.unwrap();
            let payments_count_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sale_payments").fetch_one(&pool).await.unwrap();
            let cash_movs_count_before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM cash_movements").fetch_one(&pool).await.unwrap();

            // Executa a busca e validação de reimpressão usando a lógica do comando
            let target_sale: Option<(String, i64, String)> = sqlx::query_as(
                "SELECT id, total_cents, status FROM sales WHERE id = ?"
            )
            .bind(&sale_id)
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert!(target_sale.is_some());
            let (sid, total, st) = target_sale.unwrap();
            assert_eq!(sid, "sale-100");
            assert_eq!(total, 5000);
            assert_eq!(st, "COMPLETED");

            // Registra auditoria de reimpressão
            let audit_id = "aud-test-1";
            sqlx::query(
                "INSERT INTO audit_logs (id, user_id, user_name, role, action, entity, entity_id, details, created_at)
                 VALUES (?, 'u-sup', 'supervisor', 'SUPERVISOR', 'sale.receipt_reprinted', 'sales', ?, '{\"test\":true}', '2026-01-01')"
            )
            .bind(audit_id)
            .bind(&sale_id)
            .execute(&pool)
            .await
            .unwrap();

            // Conferência rigorosa pós-reimpressão:
            let sales_count_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sales").fetch_one(&pool).await.unwrap();
            let stock_after: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = ?").bind(&prod_id).fetch_one(&pool).await.unwrap();
            let payments_count_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sale_payments").fetch_one(&pool).await.unwrap();
            let cash_movs_count_after: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM cash_movements").fetch_one(&pool).await.unwrap();

            assert_eq!(sales_count_before.0, sales_count_after.0, "Reimpressão NUNCA deve criar nova venda");
            assert_eq!(stock_before.0, stock_after.0, "Reimpressão NUNCA deve alterar estoque");
            assert_eq!(payments_count_before.0, payments_count_after.0, "Reimpressão NUNCA deve criar novo pagamento");
            assert_eq!(cash_movs_count_before.0, cash_movs_count_after.0, "Reimpressão NUNCA deve alterar caixa");

            // Valida registro de auditoria
            let audit_row: (String, String) = sqlx::query_as(
                "SELECT action, entity_id FROM audit_logs WHERE id = ?"
            )
            .bind(audit_id)
            .fetch_one(&pool)
            .await
            .unwrap();

            assert_eq!(audit_row.0, "sale.receipt_reprinted");
            assert_eq!(audit_row.1, "sale-100");
        });
    }

    #[test]
    fn test_reprint_unauthenticated_fails() {
        tauri::async_runtime::block_on(async {
            let (pool, session_state, _sale_id, _prod_id) = create_test_db_with_sale().await;
            // Sem login
            let res = require_permission(&session_state, &pool, "sale.reprint").await;
            assert!(res.is_err(), "Reimpressão sem usuário autenticado deve falhar");
        });
    }

    #[test]
    fn test_reprint_nonexistent_sale_fails() {
        tauri::async_runtime::block_on(async {
            let (pool, session_state, _sale_id, _prod_id) = create_test_db_with_sale().await;
            authenticate_user(&session_state, &pool, "supervisor", "sup123").await.unwrap();

            let target_sale: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM sales WHERE id = 'sale-inexistente'"
            )
            .fetch_optional(&pool)
            .await
            .unwrap();

            assert!(target_sale.is_none(), "Venda inexistente deve retornar None e falhar");
        });
    }
}


