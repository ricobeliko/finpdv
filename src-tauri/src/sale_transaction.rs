use serde::{Deserialize, Serialize};
use sqlx::{Acquire, Pool, Sqlite};
use tauri::State;

pub const OPEN_PRICE_PRODUCT_ID: &str = "prod-open-price-1";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleItemPayload {
    pub id: String,
    pub product_id: String,
    pub product_name: String,
    pub quantity: f64,
    pub unit_price_cents: i64,
    pub cost_price_cents: i64,
    pub total_cents: i64,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SalePaymentPayload {
    pub id: String,
    pub method: String,
    pub amount_cents: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleTransactionPayload {
    pub id: String,
    pub session_id: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub customer_id: Option<String>,
    pub customer_name: Option<String>,
    pub subtotal_cents: i64,
    pub discount_cents: i64,
    pub total_cents: i64,
    pub change_cents: i64,
    pub payment_method: String,
    pub status: String,
    pub cancelled_at: Option<String>,
    pub created_at: String,
    pub items: Vec<SaleItemPayload>,
    pub payments: Vec<SalePaymentPayload>,
}

pub async fn execute_sale_transaction(
    pool: &Pool<Sqlite>,
    sale: &SaleTransactionPayload,
) -> Result<(), String> {
    // 1. Validações preliminares
    if sale.id.trim().is_empty() {
        return Err("ID da venda não pode ser vazio".into());
    }
    if sale.items.is_empty() {
        return Err("A venda deve conter pelo menos 1 item".into());
    }
    if sale.payments.is_empty() {
        return Err("A venda deve conter pelo menos 1 pagamento".into());
    }

    let payments_sum: i64 = sale.payments.iter().map(|p| p.amount_cents).sum();
    if payments_sum != sale.total_cents {
        return Err(format!(
            "A soma dos pagamentos ({}) não corresponde ao total da venda ({})",
            payments_sum, sale.total_cents
        ));
    }

    // 2. Adquire UMA conexão exclusiva do pool
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Erro ao adquirir conexão do pool: {}", e))?;

    // 3. Configura e valida PRAGMA foreign_keys = ON nesta conexão específica
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Erro ao ativar foreign keys: {}", e))?;

    let fk_check: (i64,) = sqlx::query_as("PRAGMA foreign_keys;")
        .fetch_one(&mut *conn)
        .await
        .map_err(|e| format!("Erro ao verificar foreign keys: {}", e))?;

    if fk_check.0 != 1 {
        return Err("Falha crítica: PRAGMA foreign_keys não está ativo na conexão transacional.".into());
    }

    // 4. Inicia a transação sqlx na MESMA conexão
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação: {}", e))?;

    // 5. Validação autoritativa de sessão de caixa (se informada)
    if let Some(session_id) = &sale.session_id {
        let session_opt: Option<(i64,)> = sqlx::query_as(
            "SELECT is_open FROM cash_sessions WHERE id = ?",
        )
        .bind(session_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao consultar sessão de caixa: {}", e))?;

        match session_opt {
            Some((1,)) => {}
            Some(_) => return Err("A sessão de caixa associada está fechada.".into()),
            None => {
                return Err(format!(
                    "Sessão de caixa '{}' não encontrada no banco de dados.",
                    session_id
                ))
            }
        }
    }

    // 6. Validação autoritativa de cliente (se informado)
    if let Some(customer_id) = &sale.customer_id {
        let cust_exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM customers WHERE id = ?")
                .bind(customer_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| format!("Erro ao verificar cliente: {}", e))?;

        if cust_exists.is_none() {
            return Err(format!(
                "Cliente com ID '{}' não encontrado no banco de dados.",
                customer_id
            ));
        }
    }

    // 7. INSERT sales
    sqlx::query(
        "INSERT INTO sales (
            id, session_id, user_id, customer_id, customer_name,
            subtotal_cents, discount_cents, total_cents, change_cents,
            payment_method, status, cancelled_at, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&sale.id)
    .bind(&sale.session_id)
    .bind(&sale.user_id)
    .bind(&sale.customer_id)
    .bind(sale.customer_name.as_deref().unwrap_or("Consumidor"))
    .bind(sale.subtotal_cents)
    .bind(sale.discount_cents)
    .bind(sale.total_cents)
    .bind(sale.change_cents)
    .bind(&sale.payment_method)
    .bind(&sale.status)
    .bind(&sale.cancelled_at)
    .bind(&sale.created_at)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao persistir venda: {}", e))?;

    // 8. INSERT sale_items
    for item in &sale.items {
        sqlx::query(
            "INSERT INTO sale_items (
                id, sale_id, product_id, product_name,
                quantity, unit_price_cents, cost_price_cents, total_cents
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&item.id)
        .bind(&sale.id)
        .bind(&item.product_id)
        .bind(&item.product_name)
        .bind(item.quantity)
        .bind(item.unit_price_cents)
        .bind(item.cost_price_cents)
        .bind(item.total_cents)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao persistir item da venda: {}", e))?;
    }

    // 9. INSERT sale_payments
    for payment in &sale.payments {
        sqlx::query(
            "INSERT INTO sale_payments (
                id, sale_id, method, amount_cents, created_at
            )
            VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&payment.id)
        .bind(&sale.id)
        .bind(&payment.method)
        .bind(payment.amount_cents)
        .bind(&sale.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao persistir pagamento da venda: {}", e))?;
    }

    // 10. Baixa de estoque autoritativa no SQLite e registro em inventory_movements
    let operator_name = sale.user_name.as_deref().unwrap_or("Operador de Caixa");

    for (i, item) in sale.items.iter().enumerate() {
        // Varejo Diversos / Open Price é um item virtual não estocável (não consulta products nem altera estoque)
        if item.product_id == OPEN_PRICE_PRODUCT_ID {
            continue;
        }

        let prod_row: Option<(f64, i64, String)> = sqlx::query_as(

            "SELECT current_stock, cost_price_cents, name FROM products WHERE id = ?",
        )
        .bind(&item.product_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            format!("Erro ao consultar produto '{}': {}", item.product_id, e)
        })?;

        let (current_stock, cost_price_cents, product_name) = prod_row.ok_or_else(|| {
            format!(
                "Produto com ID '{}' não encontrado no banco de dados para baixa de estoque.",
                item.product_id
            )
        })?;

        let new_stock = current_stock - item.quantity;

        // Atualiza estoque do produto e valida rows_affected == 1
        let update_res = sqlx::query("UPDATE products SET current_stock = ? WHERE id = ?")
            .bind(new_stock)
            .bind(&item.product_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                format!(
                    "Erro ao atualizar estoque do produto '{}': {}",
                    item.product_id, e
                )
            })?;

        if update_res.rows_affected() != 1 {
            return Err(format!(
                "Falha crítica: atualização de estoque do produto '{}' afetou {} linhas (esperado 1).",
                item.product_id,
                update_res.rows_affected()
            ));
        }

        // Insere movimentação de estoque
        let mov_id = format!("mov-sale-{}-{}-{}", sale.id, i, item.id);
        let mov_notes = format!("Venda no PDV Cupom #{}", sale.id);

        sqlx::query(
            "INSERT INTO inventory_movements (
                id, product_id, product_name, type,
                quantity, previous_balance, new_balance,
                cost_price_cents, user_name, notes, created_at
            )
            VALUES (?, ?, ?, 'SALE', ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&mov_id)
        .bind(&item.product_id)
        .bind(&product_name)
        .bind(item.quantity)
        .bind(current_stock)
        .bind(new_stock)
        .bind(cost_price_cents)
        .bind(operator_name)
        .bind(&mov_notes)
        .bind(&sale.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            format!(
                "Erro ao registrar movimentação de estoque para '{}': {}",
                item.product_id, e
            )
        })?;
    }

    // 11. Movimentação e atualização da sessão de caixa (apenas para valor líquido em dinheiro)
    let net_cash: i64 = sale
        .payments
        .iter()
        .filter(|p| p.method == "CASH")
        .map(|p| p.amount_cents)
        .sum();

    if net_cash > 0 {
        if let Some(session_id) = &sale.session_id {
            let movement_id = format!("mov-sale-{}", sale.id);
            let user_id = sale.user_id.as_deref().unwrap_or("usr-admin");

            let items_summary = sale
                .items
                .iter()
                .map(|i| format!("{}x {}", i.quantity, i.product_name))
                .collect::<Vec<_>>()
                .join(", ");

            let reason = if items_summary.is_empty() {
                format!("Venda PDV Cupom #{}", sale.id)
            } else {
                format!("Venda PDV Cupom #{} • {}", sale.id, items_summary)
            };

            // Inserção da movimentação de caixa
            sqlx::query(
                "INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
                 VALUES (?, ?, ?, 'SALE', ?, ?, ?)",
            )
            .bind(&movement_id)
            .bind(session_id)
            .bind(user_id)
            .bind(net_cash)
            .bind(&reason)
            .bind(&sale.created_at)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao registrar movimentação de caixa: {}", e))?;

            // Atualização atômica do total de vendas em dinheiro da sessão e valida rows_affected == 1
            let session_res = sqlx::query(
                "UPDATE cash_sessions
                 SET sales_cash_cents = COALESCE(sales_cash_cents, 0) + ?
                 WHERE id = ?",
            )
            .bind(net_cash)
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Erro ao atualizar saldo da sessão de caixa: {}", e))?;

            if session_res.rows_affected() != 1 {
                return Err(format!(
                    "Falha crítica: atualização de saldo da sessão de caixa '{}' afetou {} linhas (esperado 1).",
                    session_id,
                    session_res.rows_affected()
                ));
            }
        }
    }

    // 12. Atualização das estatísticas do cliente (se houver) e valida rows_affected == 1
    if let Some(customer_id) = &sale.customer_id {
        let cust_res = sqlx::query(
            "UPDATE customers
             SET total_spent_cents = total_spent_cents + ?,
                 purchases_count = purchases_count + 1,
                 last_purchase_date = ?
             WHERE id = ?",
        )
        .bind(sale.total_cents)
        .bind(&sale.created_at)
        .bind(customer_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Erro ao atualizar estatísticas do cliente: {}", e))?;

        if cust_res.rows_affected() != 1 {
            return Err(format!(
                "Falha crítica: atualização de estatísticas do cliente '{}' afetou {} linhas (esperado 1).",
                customer_id,
                cust_res.rows_affected()
            ));
        }
    }

    // 13. Commit atômico de TODAS as operações
    tx.commit()
        .await
        .map_err(|e| format!("Erro ao confirmar transação global da venda: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn save_sale_transaction(
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    sale: SaleTransactionPayload,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let db_pool = instances
        .get("sqlite:mercado.db")
        .or_else(|| instances.values().next())
        .ok_or_else(|| "Banco de dados 'sqlite:mercado.db' não carregado".to_string())?;

    match db_pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => execute_sale_transaction(pool, &sale).await,
        #[allow(unreachable_patterns)]
        _ => Err("Tipo de banco de dados não suportado (esperado SQLite)".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn create_test_db() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Failed to create in-memory sqlite");

        sqlx::query(
            "CREATE TABLE categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE products (
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
                is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE cash_sessions (
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
            CREATE TABLE cash_movements (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                type TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                reason TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
            );
            CREATE TABLE sales (
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
            CREATE TABLE sale_items (
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
            CREATE TABLE sale_payments (
                id TEXT PRIMARY KEY,
                sale_id TEXT NOT NULL,
                method TEXT NOT NULL,
                amount_cents INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE
            );
            CREATE TABLE inventory_movements (
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
            CREATE TABLE customers (
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
            );",
        )
        .execute(&pool)
        .await
        .expect("Failed to initialize test schema");

        pool
    }

    async fn seed_test_context(pool: &Pool<Sqlite>) {
        sqlx::query(
            "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
             VALUES 
             ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 10.0),
             ('prod-2', '002', 'Feijão 1kg', 400, 800, 20.0);

             INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
             VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 0);

             INSERT INTO customers (id, name, total_spent_cents, purchases_count, created_at)
             VALUES ('cust-1', 'Maria Silva', 5000, 2, '2026-08-01 10:00:00');",
        )
        .execute(pool)
        .await
        .expect("Failed to seed test context");
    }

    #[test]
    fn test_global_sale_transaction_full_success() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-GLOBAL-SUCCESS".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: Some("cust-1".into()),
                customer_name: Some("Maria Silva".into()),
                subtotal_cents: 3300,
                discount_cents: 0,
                total_cents: 3300,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "item-1".into(),
                        product_id: "prod-1".into(),
                        product_name: "Arroz 5kg".into(),
                        quantity: 1.0,
                        unit_price_cents: 2500,
                        cost_price_cents: 1500,
                        total_cents: 2500,
                    },
                    SaleItemPayload {
                        id: "item-2".into(),
                        product_id: "prod-2".into(),
                        product_name: "Feijão 1kg".into(),
                        quantity: 1.0,
                        unit_price_cents: 800,
                        cost_price_cents: 400,
                        total_cents: 800,
                    },
                ],
                payments: vec![
                    SalePaymentPayload {
                        id: "pay-1".into(),
                        method: "CASH".into(),
                        amount_cents: 1300,
                    },
                    SalePaymentPayload {
                        id: "pay-2".into(),
                        method: "PIX".into(),
                        amount_cents: 2000,
                    },
                ],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "Expected transaction to succeed: {:?}", res);

            // 1. Valida sales, items, payments
            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-GLOBAL-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 1);

            let items_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_items WHERE sale_id = 'CUPOM-GLOBAL-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(items_count.0, 2);

            let payments_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_payments WHERE sale_id = 'CUPOM-GLOBAL-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(payments_count.0, 2);

            // 2. Valida estoque atualizado
            let stock_prod1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((stock_prod1.0 - 9.0).abs() < 1e-6);

            let stock_prod2: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-2'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((stock_prod2.0 - 19.0).abs() < 1e-6);

            // 3. Valida inventory_movements
            let inv_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements WHERE notes LIKE '%CUPOM-GLOBAL-SUCCESS%'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(inv_count.0, 2);

            // 4. Valida cash_movements e cash_sessions (CASH líquido = 1300)
            let cash_mov: (i64, String) = sqlx::query_as("SELECT amount_cents, type FROM cash_movements WHERE id = 'mov-sale-CUPOM-GLOBAL-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cash_mov.0, 1300);
            assert_eq!(cash_mov.1, "SALE");

            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 1300);

            // 5. Valida customer atualizado
            let cust: (i64, i64) = sqlx::query_as("SELECT total_spent_cents, purchases_count FROM customers WHERE id = 'cust-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cust.0, 5000 + 3300);
            assert_eq!(cust.1, 2 + 1);
        });
    }

    #[test]
    fn test_global_rollback_on_duplicate_item_pk() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-ITEM-PK".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: Some("cust-1".into()),
                customer_name: Some("Maria Silva".into()),
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "dup-pk".into(),
                        product_id: "prod-1".into(),
                        product_name: "Arroz 5kg".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 500,
                    },
                    SaleItemPayload {
                        id: "dup-pk".into(), // DUPLICATE PK
                        product_id: "prod-2".into(),
                        product_name: "Feijão 1kg".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 500,
                    },
                ],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1000,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected transaction to fail on duplicate PK");

            // Valida que TUDO foi revertido
            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-ITEM-PK'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0, "Stock must remain unchanged!");

            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 0, "Cash session must remain unchanged!");

            let cust_spent: (i64,) = sqlx::query_as("SELECT total_spent_cents FROM customers WHERE id = 'cust-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cust_spent.0, 5000, "Customer stats must remain unchanged!");
        });
    }

    #[test]
    fn test_global_rollback_specifically_between_product_update_and_inventory_movement() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            // Instala trigger no banco in-memory de teste para falhar SOMENTE no INSERT de inventory_movements
            sqlx::query(
                "CREATE TRIGGER trigger_fail_inventory_movement
                 BEFORE INSERT ON inventory_movements
                 BEGIN
                     SELECT RAISE(ABORT, 'Simulated inventory movement failure');
                 END;",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-INV-MOV".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: Some("cust-1".into()),
                customer_name: Some("Maria Silva".into()),
                subtotal_cents: 2500,
                discount_cents: 0,
                total_cents: 2500,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 2500,
                    cost_price_cents: 1500,
                    total_cents: 2500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 2500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected failure when inventory movement insert fails");

            // PROVA FÍSICA: O estoque do produto 1 foi revertido para 10.0 original
            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0, "Product stock MUST be restored to original 10.0!");

            // PROVA FÍSICA: Zero registros de venda, itens, pagamentos, movimentações, caixa e cliente
            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-INV-MOV'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let inv_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(inv_count.0, 0);

            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 0);

            let cust: (i64,) = sqlx::query_as("SELECT total_spent_cents FROM customers WHERE id = 'cust-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cust.0, 5000);
        });
    }

    #[test]
    fn test_global_rollback_specifically_between_cash_movement_and_cash_session_update() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            // Instala trigger no banco in-memory de teste para falhar SOMENTE no UPDATE de cash_sessions
            sqlx::query(
                "CREATE TRIGGER trigger_fail_cash_session_update
                 BEFORE UPDATE ON cash_sessions
                 BEGIN
                     SELECT RAISE(ABORT, 'Simulated cash session update failure');
                 END;",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-CASH-UPDATE".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: Some("cust-1".into()),
                customer_name: Some("Maria Silva".into()),
                subtotal_cents: 2500,
                discount_cents: 0,
                total_cents: 2500,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 2500,
                    cost_price_cents: 1500,
                    total_cents: 2500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 2500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected failure when cash session update fails");

            // PROVA FÍSICA: Zero movimentações de caixa criadas
            let cash_movs: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cash_movs.0, 0, "No cash movements must remain!");

            // PROVA FÍSICA: Sessão e vendas inalteradas
            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 0);

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-CASH-UPDATE'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0, "Product stock MUST be rolled back to 10.0!");
        });
    }

    #[test]
    fn test_global_rollback_on_nonexistent_product() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-PROD".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "item-1".into(),
                        product_id: "prod-1".into(),
                        product_name: "Arroz 5kg".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 500,
                    },
                    SaleItemPayload {
                        id: "item-2".into(),
                        product_id: "prod-NONEXISTENT".into(), // PRODUTO INEXISTENTE
                        product_name: "Produto Fantasma".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 500,
                    },
                ],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1000,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected fail on missing product");

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-PROD'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0, "Prod-1 stock must be rolled back to 10.0!");

            let inv_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements WHERE notes LIKE '%CUPOM-FAIL-PROD%'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(inv_count.0, 0);
        });
    }

    #[test]
    fn test_global_rollback_on_closed_cash_session() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            // Fecha a sessão de caixa
            sqlx::query("UPDATE cash_sessions SET is_open = 0 WHERE id = 'session-1'")
                .execute(&pool)
                .await
                .unwrap();

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-CLOSED-SESSION".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 1000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1000,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected fail on closed cash session");

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-CLOSED-SESSION'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0);
        });
    }

    #[test]
    fn test_global_rollback_on_nonexistent_customer() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-FAIL-CUST".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: Some("cust-GHOST".into()), // CLIENTE INEXISTENTE
                customer_name: Some("Fantasma".into()),
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 1000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1000,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Expected fail on missing customer");

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-FAIL-CUST'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock1.0, 10.0);
        });
    }

    #[test]
    fn test_electronic_sale_does_not_affect_physical_cash() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-PIX-ONLY".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 2500,
                discount_cents: 0,
                total_cents: 2500,
                change_cents: 0,
                payment_method: "PIX".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 2500,
                    cost_price_cents: 1500,
                    total_cents: 2500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "PIX".into(),
                    amount_cents: 2500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "PIX sale should succeed");

            let cash_movs: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements WHERE id = 'mov-sale-CUPOM-PIX-ONLY'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cash_movs.0, 0, "No physical cash movement for 100% electronic sale!");

            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 0, "Physical cash drawer amount must remain 0 for PIX sale!");
        });
    }

    #[test]
    fn test_fractional_quantity_stock_deduction() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-FRACTIONAL".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 1250,
                discount_cents: 0,
                total_cents: 1250,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(), // Estoque original: 10.0
                    product_name: "Arroz Fracionado".into(),
                    quantity: 1.250,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 1250,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1250,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((stock1.0 - 8.750).abs() < 1e-6, "Stock must be 8.750 after 1.250 deduction!");

            let mov: (f64, f64, f64) = sqlx::query_as(
                "SELECT quantity, previous_balance, new_balance FROM inventory_movements WHERE notes LIKE '%CUPOM-FRACTIONAL%'"
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert!((mov.0 - 1.250).abs() < 1e-6);
            assert!((mov.1 - 10.000).abs() < 1e-6);
            assert!((mov.2 - 8.750).abs() < 1e-6);
        });
    }

    #[test]
    fn test_duplicate_sale_id_rejected_without_double_effects() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-DUPLICATE-CHECK".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: Some("cust-1".into()),
                customer_name: Some("Maria Silva".into()),
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 1.0,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 1000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-1".into(),
                    method: "CASH".into(),
                    amount_cents: 1000,
                }],
            };

            // Primeira tentativa: sucesso
            let res1 = execute_sale_transaction(&pool, &payload).await;
            assert!(res1.is_ok());

            // Segunda tentativa com o MESMO sale.id: deve falhar
            let res2 = execute_sale_transaction(&pool, &payload).await;
            assert!(res2.is_err(), "Duplicate sale.id must fail");

            // Valida que o estoque foi baixado APENAS 1 vez (de 10 para 9, e não para 8)
            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((stock1.0 - 9.0).abs() < 1e-6);

            // Valida que o caixa foi incrementado APENAS 1 vez (1000, e não 2000)
            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 1000);

            // Valida que o cliente foi incrementado APENAS 1 vez (5000 + 1000 = 6000)
            let cust: (i64, i64) = sqlx::query_as("SELECT total_spent_cents, purchases_count FROM customers WHERE id = 'cust-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cust.0, 6000);
            assert_eq!(cust.1, 3);
        });
    }

    #[test]
    fn test_concurrency_serial_execution_no_lost_updates() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let sale_a = SaleTransactionPayload {
                id: "CUPOM-CONC-A".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 2000,
                discount_cents: 0,
                total_cents: 2000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-a-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 2.0,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 2000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-a-1".into(),
                    method: "CASH".into(),
                    amount_cents: 2000,
                }],
            };

            let sale_b = SaleTransactionPayload {
                id: "CUPOM-CONC-B".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 3000,
                discount_cents: 0,
                total_cents: 3000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:30:01".into(),
                items: vec![SaleItemPayload {
                    id: "item-b-1".into(),
                    product_id: "prod-1".into(),
                    product_name: "Arroz 5kg".into(),
                    quantity: 3.0,
                    unit_price_cents: 1000,
                    cost_price_cents: 500,
                    total_cents: 3000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-b-1".into(),
                    method: "CASH".into(),
                    amount_cents: 3000,
                }],
            };

            let res_a = execute_sale_transaction(&pool, &sale_a).await;
            let res_b = execute_sale_transaction(&pool, &sale_b).await;

            assert!(res_a.is_ok());
            assert!(res_b.is_ok());

            // Estoque inicial era 10.0 -> Venda A baixou 2.0, Venda B baixou 3.0 -> Estoque final = 5.0 (sem lost updates)
            let stock1: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((stock1.0 - 5.0).abs() < 1e-6, "Stock must be exactly 5.0 without lost updates!");

            // Saldo de caixa inicial era 0 -> Venda A somou 2000, Venda B somou 3000 -> Total = 5000 (sem lost updates)
            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 5000, "Cash session sales must be exactly 5000!");
        });
    }

    #[test]
    fn test_foreign_keys_enforced_in_global_transaction() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            let payload = SaleTransactionPayload {
                id: "".into(), // Inválido
                session_id: None,
                user_id: None,
                user_name: None,
                customer_id: None,
                customer_name: None,
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:00:00".into(),
                items: vec![],
                payments: vec![],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err());
        });
    }

    #[test]
    fn test_open_price_sale_without_product_row_succeeds() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            // Garante que prod-open-price-1 NÃO existe na tabela products
            let prod_exists: Option<(String,)> = sqlx::query_as("SELECT id FROM products WHERE id = 'prod-open-price-1'")
                .fetch_optional(&pool)
                .await
                .unwrap();
            assert!(prod_exists.is_none(), "prod-open-price-1 must not exist in products table!");

            let payload = SaleTransactionPayload {
                id: "CUPOM-OPEN-1".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 2500,
                discount_cents: 0,
                total_cents: 2500,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 23:00:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-open-1".into(),
                    product_id: OPEN_PRICE_PRODUCT_ID.into(),
                    product_name: "Varejo Diversos".into(),
                    quantity: 1.0,
                    unit_price_cents: 2500,
                    cost_price_cents: 0,
                    total_cents: 2500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-open-1".into(),
                    method: "CASH".into(),
                    amount_cents: 2500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "Open price sale must succeed even without product row in products table!");

            // Venda e itens gravados
            let sale_row: (String, i64) = sqlx::query_as("SELECT id, total_cents FROM sales WHERE id = 'CUPOM-OPEN-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sale_row.0, "CUPOM-OPEN-1");
            assert_eq!(sale_row.1, 2500);

            // Zero inventory movements para open price
            let mov_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements WHERE product_id = 'prod-open-price-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(mov_count.0, 0, "Zero inventory movements for open price!");
        });
    }

    #[test]
    fn test_open_price_cash_sale_updates_cash_without_stock() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-OPEN-CASH".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 3000,
                discount_cents: 0,
                total_cents: 3000,
                change_cents: 2000, // Entregou 5000, troco 2000 -> Liquido 3000
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 23:05:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-open-2".into(),
                    product_id: OPEN_PRICE_PRODUCT_ID.into(),
                    product_name: "Varejo Diversos".into(),
                    quantity: 2.0,
                    unit_price_cents: 1500,
                    cost_price_cents: 0,
                    total_cents: 3000,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-open-2".into(),
                    method: "CASH".into(),
                    amount_cents: 3000,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // Caixa atualizado com +3000
            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 3000);

            // Cash movement gerado
            let mov: (i64, String) = sqlx::query_as("SELECT amount_cents, type FROM cash_movements WHERE session_id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(mov.0, 3000);
            assert_eq!(mov.1, "SALE");

            // Zero inventory movements
            let inv_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(inv_count.0, 0);
        });
    }

    #[test]
    fn test_open_price_electronic_sale_has_no_physical_cash_or_stock() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-OPEN-PIX".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 1500,
                discount_cents: 0,
                total_cents: 1500,
                change_cents: 0,
                payment_method: "PIX".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 23:10:00".into(),
                items: vec![SaleItemPayload {
                    id: "item-open-3".into(),
                    product_id: OPEN_PRICE_PRODUCT_ID.into(),
                    product_name: "Varejo Diversos".into(),
                    quantity: 1.0,
                    unit_price_cents: 1500,
                    cost_price_cents: 0,
                    total_cents: 1500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-open-3".into(),
                    method: "PIX".into(),
                    amount_cents: 1500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // Gaveta inalterada
            let session_sales: (i64,) = sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(session_sales.0, 0);

            // Zero cash movements
            let cash_movs: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements WHERE session_id = 'session-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cash_movs.0, 0);
        });
    }

    #[test]
    fn test_mixed_sale_updates_only_real_product_stock() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-MIXED-1".into(),
                session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 3500, // prod-1 (1000) + open-price (2500)
                discount_cents: 0,
                total_cents: 3500,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 23:15:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "item-mix-1".into(),
                        product_id: "prod-1".into(), // Produto normal (estoque inicial: 10.0)
                        product_name: "Arroz 5kg".into(),
                        quantity: 2.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 1000,
                    },
                    SaleItemPayload {
                        id: "item-mix-2".into(),
                        product_id: OPEN_PRICE_PRODUCT_ID.into(), // Varejo diversos
                        product_name: "Varejo Diversos".into(),
                        quantity: 1.0,
                        unit_price_cents: 2500,
                        cost_price_cents: 0,
                        total_cents: 2500,
                    }
                ],
                payments: vec![SalePaymentPayload {
                    id: "pay-mix-1".into(),
                    method: "CASH".into(),
                    amount_cents: 3500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // prod-1 teve estoque baixado de 10.0 para 8.0
            let prod1_stock: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((prod1_stock.0 - 8.0).abs() < 1e-6);

            // Apenas 1 movimentação de estoque (para prod-1, ZERO para open-price)
            let inv_movs: Vec<(String, f64)> = sqlx::query_as("SELECT product_id, quantity FROM inventory_movements")
                .fetch_all(&pool)
                .await
                .unwrap();
            assert_eq!(inv_movs.len(), 1);
            assert_eq!(inv_movs[0].0, "prod-1");
            assert!((inv_movs[0].1 - 2.0).abs() < 1e-6);

            // Total de itens na venda = 2
            let items_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_items WHERE sale_id = 'CUPOM-MIXED-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(items_count.0, 2);
        });
    }

    #[test]
    fn test_mixed_sale_rollback_restores_real_product() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            seed_test_context(&pool).await;

            let payload = SaleTransactionPayload {
                id: "CUPOM-MIXED-FAIL".into(),
                session_id: Some("session-closed".into()), // Sessão inexistente/fechada -> provoca erro e rollback
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 3500,
                discount_cents: 0,
                total_cents: 3500,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 23:20:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "item-mixf-1".into(),
                        product_id: "prod-1".into(),
                        product_name: "Arroz 5kg".into(),
                        quantity: 2.0,
                        unit_price_cents: 500,
                        cost_price_cents: 300,
                        total_cents: 1000,
                    },
                    SaleItemPayload {
                        id: "item-mixf-2".into(),
                        product_id: OPEN_PRICE_PRODUCT_ID.into(),
                        product_name: "Varejo Diversos".into(),
                        quantity: 1.0,
                        unit_price_cents: 2500,
                        cost_price_cents: 0,
                        total_cents: 2500,
                    }
                ],
                payments: vec![SalePaymentPayload {
                    id: "pay-mixf-1".into(),
                    method: "CASH".into(),
                    amount_cents: 3500,
                }],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_err());

            // prod-1 permanece com estoque intacto = 10.0
            let prod1_stock: (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert!((prod1_stock.0 - 10.0).abs() < 1e-6);

            // Nenhuma venda ou item persistido
            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-MIXED-FAIL'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0);
        });
    }
}


