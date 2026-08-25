use serde::{Deserialize, Serialize};
use sqlx::{Acquire, Pool, Sqlite};
use tauri::State;

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

    // Adquire UMA conexão exclusiva do pool
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Erro ao adquirir conexão do pool: {}", e))?;

    // Configura e valida PRAGMA foreign_keys = ON nesta conexão específica
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

    // Inicia a transação sqlx na MESMA conexão
    let mut tx = conn
        .begin()
        .await
        .map_err(|e| format!("Erro ao iniciar transação: {}", e))?;

    // 1. INSERT sales
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

    // 2. INSERT sale_items
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

    // 3. INSERT sale_payments
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

    // 4. Commit atômico
    tx.commit()
        .await
        .map_err(|e| format!("Erro ao confirmar transação da venda: {}", e))?;

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
            "CREATE TABLE sales (
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
            );",
        )
        .execute(&pool)
        .await
        .expect("Failed to initialize test schema");

        pool
    }

    #[test]
    fn test_sale_transaction_success() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            let payload = SaleTransactionPayload {
                id: "CUPOM-TEST-SUCCESS".into(),
                session_id: None,
                user_id: Some("usr-admin".into()),
                customer_id: None,
                customer_name: Some("Consumidor".into()),
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:00:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "item-1".into(),
                        product_id: "prod-1".into(),
                        product_name: "Item 1".into(),
                        quantity: 1.0,
                        unit_price_cents: 600,
                        cost_price_cents: 300,
                        total_cents: 600,
                    },
                    SaleItemPayload {
                        id: "item-2".into(),
                        product_id: "prod-2".into(),
                        product_name: "Item 2".into(),
                        quantity: 1.0,
                        unit_price_cents: 400,
                        cost_price_cents: 200,
                        total_cents: 400,
                    },
                ],
                payments: vec![
                    SalePaymentPayload {
                        id: "pay-1".into(),
                        method: "CASH".into(),
                        amount_cents: 400,
                    },
                    SalePaymentPayload {
                        id: "pay-2".into(),
                        method: "PIX".into(),
                        amount_cents: 600,
                    },
                ],
            };

            let res = execute_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "Expected transaction to succeed: {:?}", res);

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-TEST-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 1);

            let items_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_items WHERE sale_id = 'CUPOM-TEST-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(items_count.0, 2);

            let payments_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_payments WHERE sale_id = 'CUPOM-TEST-SUCCESS'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(payments_count.0, 2);
        });
    }

    #[test]
    fn test_sale_transaction_rollback_on_duplicate_item_pk() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            let payload = SaleTransactionPayload {
                id: "CUPOM-TEST-FAIL".into(),
                session_id: None,
                user_id: Some("usr-admin".into()),
                customer_id: None,
                customer_name: Some("Consumidor".into()),
                subtotal_cents: 1000,
                discount_cents: 0,
                total_cents: 1000,
                change_cents: 0,
                payment_method: "CASH".into(),
                status: "COMPLETED".into(),
                cancelled_at: None,
                created_at: "2026-08-24 22:00:00".into(),
                items: vec![
                    SaleItemPayload {
                        id: "duplicate-item-pk".into(),
                        product_id: "prod-1".into(),
                        product_name: "Item 1".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 200,
                        total_cents: 500,
                    },
                    SaleItemPayload {
                        id: "duplicate-item-pk".into(), // PK duplicada proposital
                        product_id: "prod-2".into(),
                        product_name: "Item 2".into(),
                        quantity: 1.0,
                        unit_price_cents: 500,
                        cost_price_cents: 200,
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

            let sales_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sales WHERE id = 'CUPOM-TEST-FAIL'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(sales_count.0, 0, "Sales table should have been rolled back!");

            let items_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_items WHERE sale_id = 'CUPOM-TEST-FAIL'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(items_count.0, 0, "Sale items should have been rolled back!");

            let payments_count: (i64,) = sqlx::query_as("SELECT count(*) FROM sale_payments WHERE sale_id = 'CUPOM-TEST-FAIL'")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(payments_count.0, 0, "Sale payments should have been rolled back!");
        });
    }

    #[test]
    fn test_sale_transaction_foreign_keys_enforced() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;
            let payload = SaleTransactionPayload {
                id: "".into(), // Inválido
                session_id: None,
                user_id: None,
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
}
