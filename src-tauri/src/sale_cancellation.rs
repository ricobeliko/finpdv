use serde::{Deserialize, Serialize};
use sqlx::{Acquire, Pool, Sqlite};
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelSalePayload {
    pub sale_id: String,
    pub current_session_id: Option<String>,
    pub user_id: Option<String>,
    pub user_name: Option<String>,
    pub reason: Option<String>,
    pub cancelled_at: String,
}

#[derive(sqlx::FromRow)]
struct SaleDbRow {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    session_id: Option<String>,
    customer_id: Option<String>,
    #[allow(dead_code)]
    total_cents: i64,
    status: String,
    cancelled_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct SaleItemDbRow {
    #[allow(dead_code)]
    id: String,
    product_id: String,
    product_name: String,
    quantity: f64,
    #[allow(dead_code)]
    unit_price_cents: i64,
    cost_price_cents: i64,
    #[allow(dead_code)]
    total_cents: i64,
}

#[derive(sqlx::FromRow)]
struct SalePaymentDbRow {
    #[allow(dead_code)]
    id: String,
    method: String,
    amount_cents: i64,
}

pub async fn execute_cancel_sale_transaction(
    pool: &Pool<Sqlite>,
    payload: &CancelSalePayload,
) -> Result<(), String> {
    // 1. Validação preliminar do ID
    if payload.sale_id.trim().is_empty() {
        return Err("ID da venda para cancelamento não pode ser vazio".into());
    }

    // 2. Adquire UMA conexão exclusiva do pool
    let mut conn = pool
        .acquire()
        .await
        .map_err(|e| format!("Erro ao adquirir conexão do pool: {}", e))?;

    // 3. Configura e valida PRAGMA foreign_keys = ON e busy_timeout = 5000 nesta conexão
    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Erro ao ativar foreign keys: {}", e))?;

    sqlx::query("PRAGMA busy_timeout = 5000;")
        .execute(&mut *conn)
        .await
        .map_err(|e| format!("Erro ao configurar busy_timeout: {}", e))?;

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

    // 5. Consulta e valida o estado atual da venda
    let sale_row: Option<SaleDbRow> = sqlx::query_as(
        "SELECT id, session_id, customer_id, total_cents, status, cancelled_at FROM sales WHERE id = ?",
    )
    .bind(&payload.sale_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao consultar venda '{}': {}", payload.sale_id, e))?;

    let sale_db = sale_row.ok_or_else(|| {
        format!(
            "Venda com ID '{}' não encontrada no banco de dados.",
            payload.sale_id
        )
    })?;

    if sale_db.status == "CANCELLED" || sale_db.cancelled_at.is_some() {
        return Err(format!(
            "A venda '{}' já se encontra cancelada.",
            payload.sale_id
        ));
    }

    if sale_db.status != "COMPLETED" {
        return Err(format!(
            "Apenas vendas no estado COMPLETED podem ser canceladas (estado atual: '{}').",
            sale_db.status
        ));
    }

    let customer_id = sale_db.customer_id;

    // 6. Consulta os itens originais da venda
    let items: Vec<SaleItemDbRow> = sqlx::query_as(
        "SELECT id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents
         FROM sale_items
         WHERE sale_id = ?
         ORDER BY rowid ASC",
    )
    .bind(&payload.sale_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao consultar itens da venda: {}", e))?;

    if items.is_empty() {
        return Err(format!(
            "A venda '{}' não possui itens registrados para estorno de estoque.",
            payload.sale_id
        ));
    }

    // 7. Consulta os pagamentos estruturados da venda
    let payments: Vec<SalePaymentDbRow> = sqlx::query_as(
        "SELECT id, method, amount_cents FROM sale_payments WHERE sale_id = ?",
    )
    .bind(&payload.sale_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|e| format!("Erro ao consultar pagamentos da venda: {}", e))?;

    if payments.is_empty() {
        return Err(format!(
            "Cancelamento automático bloqueado: a venda '{}' é um registro legado sem breakdown financeiro estruturado em sale_payments.",
            payload.sale_id
        ));
    }

    // 8. Determina o valor líquido em dinheiro (CASH) que deve sair fisicamente da gaveta
    let net_cash: i64 = payments
        .iter()
        .filter(|p| p.method == "CASH")
        .map(|p| p.amount_cents)
        .sum();


    let operator_name = payload.user_name.as_deref().unwrap_or("Operador de Caixa");
    let reason_notes = payload
        .reason
        .as_deref()
        .unwrap_or("Estorno de Venda no PDV");

    // 9. Reversão de caixa (apenas se houver valor líquido em dinheiro físico)
    if net_cash > 0 {
        let current_session_id = payload.current_session_id.as_deref().ok_or_else(|| {
            "Para estornar uma venda com parcela em dinheiro (CASH), é obrigatório informar uma sessão de caixa aberta.".to_string()
        })?;

        // Valida se a sessão atual informada existe e está aberta
        let session_open: Option<(i64,)> =
            sqlx::query_as("SELECT is_open FROM cash_sessions WHERE id = ?")
                .bind(current_session_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| format!("Erro ao verificar sessão de caixa: {}", e))?;

        match session_open {
            Some((1,)) => {}
            Some(_) => {
                return Err("A sessão de caixa informada para o estorno está fechada.".into())
            }
            None => {
                return Err(format!(
                    "Sessão de caixa '{}' não encontrada no banco de dados.",
                    current_session_id
                ))
            }
        }

        // Inserção da movimentação de estorno (REFUND) no caixa atual
        let refund_mov_id = format!("mov-ref-{}", payload.sale_id);
        let mov_reason = format!(
            "ESTORNO: Venda PDV Cupom #{} ({})",
            payload.sale_id, reason_notes
        );
        let user_id = payload.user_id.as_deref().unwrap_or("usr-admin");

        sqlx::query(
            "INSERT INTO cash_movements (id, session_id, user_id, type, amount_cents, reason, timestamp)
             VALUES (?, ?, ?, 'REFUND', ?, ?, ?)",
        )
        .bind(&refund_mov_id)
        .bind(current_session_id)
        .bind(user_id)
        .bind(net_cash)
        .bind(&mov_reason)
        .bind(&payload.cancelled_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            format!(
                "Erro ao registrar movimentação de estorno no caixa: {}",
                e
            )
        })?;

        // Atualização atômica do saldo de vendas da sessão de caixa e valida rows_affected == 1
        let session_res = sqlx::query(
            "UPDATE cash_sessions
             SET sales_cash_cents = COALESCE(sales_cash_cents, 0) - ?
             WHERE id = ?",
        )
        .bind(net_cash)
        .bind(current_session_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            format!("Erro ao atualizar saldo da sessão de caixa no estorno: {}", e)
        })?;

        if session_res.rows_affected() != 1 {
            return Err(format!(
                "Falha crítica: atualização de saldo da sessão '{}' afetou {} linhas (esperado 1).",
                current_session_id,
                session_res.rows_affected()
            ));
        }
    }

    // 10. Devolução de estoque e registro em inventory_movements (tipo REFUND)
    for (i, item) in items.iter().enumerate() {
        // Varejo Diversos / Open Price é um item virtual não estocável (não consulta products nem restaura estoque)
        if item.product_id == crate::sale_transaction::OPEN_PRICE_PRODUCT_ID {
            continue;
        }

        let prod_row: Option<(f64,)> =
            sqlx::query_as("SELECT current_stock FROM products WHERE id = ?")

                .bind(&item.product_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| {
                    format!("Erro ao consultar produto '{}': {}", item.product_id, e)
                })?;

        let (current_stock,) = prod_row.ok_or_else(|| {
            format!(
                "Produto com ID '{}' não encontrado para devolução de estoque.",
                item.product_id
            )
        })?;

        let new_stock = current_stock + item.quantity;

        // Atualiza estoque do produto e valida rows_affected == 1
        let prod_res = sqlx::query("UPDATE products SET current_stock = ? WHERE id = ?")
            .bind(new_stock)
            .bind(&item.product_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                format!(
                    "Erro ao restaurar estoque do produto '{}': {}",
                    item.product_id, e
                )
            })?;

        if prod_res.rows_affected() != 1 {
            return Err(format!(
                "Falha crítica: devolução de estoque do produto '{}' afetou {} linhas (esperado 1).",
                item.product_id,
                prod_res.rows_affected()
            ));
        }

        // Insere movimentação de estoque de retorno
        let mov_id = format!("mov-ref-{}-{}-{}", payload.sale_id, i, item.product_id);
        let mov_notes = format!(
            "Estorno do Cupom #{} ({})",
            payload.sale_id, reason_notes
        );

        sqlx::query(
            "INSERT INTO inventory_movements (
                id, product_id, product_name, type,
                quantity, previous_balance, new_balance,
                cost_price_cents, user_name, notes, created_at
            )
            VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&mov_id)
        .bind(&item.product_id)
        .bind(&item.product_name)
        .bind(item.quantity)
        .bind(current_stock)
        .bind(new_stock)
        .bind(item.cost_price_cents)
        .bind(operator_name)
        .bind(&mov_notes)
        .bind(&payload.cancelled_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            format!(
                "Erro ao registrar movimentação de retorno de estoque: {}",
                e
            )
        })?;
    }

    // 11. Recomputação autoritativa das estatísticas do cliente (se houver)

    if let Some(cust_id) = &customer_id {
        let cust_exists: Option<(String,)> =
            sqlx::query_as("SELECT id FROM customers WHERE id = ?")
                .bind(cust_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| format!("Erro ao verificar cliente: {}", e))?;

        if cust_exists.is_none() {
            return Err(format!(
                "Cliente com ID '{}' não encontrado para estorno.",
                cust_id
            ));
        }

        // Recomputa estatísticas considerando apenas as outras vendas COMPLETED
        let stats: (i64, i64, Option<String>) = sqlx::query_as(
            "SELECT 
                COALESCE(SUM(total_cents), 0),
                COUNT(*),
                MAX(created_at)
             FROM sales
             WHERE customer_id = ? AND status = 'COMPLETED' AND id != ?",
        )
        .bind(cust_id)
        .bind(&payload.sale_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            format!(
                "Erro ao recomputar estatísticas do cliente no estorno: {}",
                e
            )
        })?;

        let (new_total_spent, new_purchases_count, last_purchase_date) = stats;

        let cust_res = sqlx::query(
            "UPDATE customers
             SET total_spent_cents = ?,
                 purchases_count = ?,
                 last_purchase_date = ?
             WHERE id = ?",
        )
        .bind(new_total_spent)
        .bind(new_purchases_count)
        .bind(last_purchase_date)
        .bind(cust_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            format!(
                "Erro ao atualizar estatísticas do cliente no estorno: {}",
                e
            )
        })?;

        if cust_res.rows_affected() != 1 {
            return Err(format!(
                "Falha crítica: atualização do cliente '{}' afetou {} linhas (esperado 1).",
                cust_id,
                cust_res.rows_affected()
            ));
        }
    }

    // 12. Soft cancel da venda: status = 'CANCELLED' e cancelled_at preenchido
    let update_sale_res = sqlx::query(
        "UPDATE sales
         SET status = 'CANCELLED', cancelled_at = ?
         WHERE id = ? AND status = 'COMPLETED'",
    )
    .bind(&payload.cancelled_at)
    .bind(&payload.sale_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        format!(
            "Erro ao atualizar status da venda para CANCELLED: {}",
            e
        )
    })?;

    if update_sale_res.rows_affected() != 1 {
        return Err(format!(
            "Falha ao cancelar venda '{}': nenhuma linha atualizada (a venda pode ter sido cancelada concorrentemente).",
            payload.sale_id
        ));
    }

    // 13. Commit atômico de TODAS as operações
    tx.commit()
        .await
        .map_err(|e| format!("Erro ao confirmar transação de cancelamento: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn cancel_sale_transaction(
    session_state: State<'_, crate::security::SessionState>,
    db_instances: State<'_, tauri_plugin_sql::DbInstances>,
    mut payload: CancelSalePayload,
) -> Result<(), String> {
    let instances = db_instances.0.read().await;
    let db_pool = instances
        .get("sqlite:finpdv.db")
        .or_else(|| instances.values().next())
        .ok_or_else(|| "Banco de dados 'sqlite:finpdv.db' não carregado".to_string())?;

    match db_pool {
        tauri_plugin_sql::DbPool::Sqlite(pool) => {
            let active_sess =
                crate::security::require_permission(&session_state, pool, "sale.cancel").await?;
            payload.user_id = Some(active_sess.user_id);
            payload.user_name = Some(active_sess.full_name);

            execute_cancel_sale_transaction(pool, &payload).await
        }
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

    #[test]
    fn test_cancel_sale_full_cash_success() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            // Seed inicial
            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO customers (id, name, total_spent_cents, purchases_count, last_purchase_date, created_at)
                 VALUES ('cust-1', 'Maria Silva', 2500, 1, '2026-08-24 10:00:00', '2026-08-01 10:00:00');

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-CANC-1', 'session-1', 'usr-admin', 'cust-1', 'Maria Silva', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-CANC-1', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-CANC-1', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-CANC-1".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: Some("Administrador".into()),
                reason: Some("Erro no pedido".into()),
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "Expected cancellation to succeed: {:?}", res);

            // 1. Valida que a venda permanece com status CANCELLED e cancelled_at preenchido
            let sale: (String, Option<String>) = sqlx::query_as(
                "SELECT status, cancelled_at FROM sales WHERE id = 'CUPOM-CANC-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(sale.0, "CANCELLED");
            assert_eq!(sale.1.as_deref(), Some("2026-08-24 10:30:00"));

            // 2. Valida que itens e pagamentos NÃO foram apagados
            let items_count: (i64,) = sqlx::query_as(
                "SELECT count(*) FROM sale_items WHERE sale_id = 'CUPOM-CANC-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(items_count.0, 1);

            let pay_count: (i64,) = sqlx::query_as(
                "SELECT count(*) FROM sale_payments WHERE sale_id = 'CUPOM-CANC-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(pay_count.0, 1);

            // 3. Valida que o estoque retornou de 9.0 para 10.0
            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!((stock.0 - 10.0).abs() < 1e-6);

            // 4. Valida inventory_movement tipo REFUND
            let mov: (String, f64) = sqlx::query_as(
                "SELECT type, quantity FROM inventory_movements WHERE product_id = 'prod-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(mov.0, "REFUND");
            assert_eq!(mov.1, 1.0);

            // 5. Valida cash_movement tipo REFUND e saldo da sessão reduzido
            let cash_mov: (String, i64) = sqlx::query_as(
                "SELECT type, amount_cents FROM cash_movements WHERE id = 'mov-ref-CUPOM-CANC-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(cash_mov.0, "REFUND");
            assert_eq!(cash_mov.1, 2500);

            let session_sales: (i64,) = sqlx::query_as(
                "SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(session_sales.0, 0);

            // 6. Valida estatísticas do cliente recomputadas
            let cust: (i64, i64, Option<String>) = sqlx::query_as(
                "SELECT total_spent_cents, purchases_count, last_purchase_date FROM customers WHERE id = 'cust-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(cust.0, 0);
            assert_eq!(cust.1, 0);
            assert_eq!(cust.2, None);
        });
    }

    #[test]
    fn test_cancel_sale_electronic_pix_card_does_not_affect_physical_cash() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 8.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 5000);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-PIX-CANC', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'PIX', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-PIX-CANC', 'prod-1', 'Arroz 5kg', 2.0, 1250, 1000, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-PIX-CANC', 'PIX', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-PIX-CANC".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: Some("Desistência".into()),
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "PIX cancellation should succeed");

            // Valida que estoque retornou (8.0 + 2.0 = 10.0)
            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!((stock.0 - 10.0).abs() < 1e-6);

            // Valida que ZERO movimentações físicas de caixa foram criadas
            let cash_movs: (i64,) =
                sqlx::query_as("SELECT count(*) FROM cash_movements WHERE type = 'REFUND'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(cash_movs.0, 0);

            // Saldo da gaveta inalterado
            let session_sales: (i64,) = sqlx::query_as(
                "SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(session_sales.0, 5000);
        });
    }

    #[test]
    fn test_cancel_sale_split_payment_refunds_only_cash_portion() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 4000);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-SPLIT-CANC', 'session-1', 'usr-admin', NULL, 'Consumidor', 10000, 0, 10000, 0, 'SPLIT', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-SPLIT-CANC', 'prod-1', 'Arroz 5kg', 1.0, 10000, 5000, 10000);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES 
                 ('pay-1', 'CUPOM-SPLIT-CANC', 'PIX', 6000, '2026-08-24 10:00:00'),
                 ('pay-2', 'CUPOM-SPLIT-CANC', 'CASH', 4000, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-SPLIT-CANC".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // Movimentação de estorno de caixa deve ser EXATAMENTE 4000 (parcela CASH), e não 10000
            let cash_mov: (i64,) = sqlx::query_as(
                "SELECT amount_cents FROM cash_movements WHERE id = 'mov-ref-CUPOM-SPLIT-CANC'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(cash_mov.0, 4000);

            let session_sales: (i64,) = sqlx::query_as(
                "SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(session_sales.0, 0);
        });
    }

    #[test]
    fn test_cancel_sale_double_cancel_blocked() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-DOUBLE-CANC', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-DOUBLE-CANC', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-DOUBLE-CANC', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-DOUBLE-CANC".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            // 1ª tentativa: Sucesso
            let res1 = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res1.is_ok());

            // 2ª tentativa: Deve falhar
            let res2 = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res2.is_err(), "Double cancellation must fail");

            // Valida que o estoque foi devolvido APENAS 1 vez (de 9.0 para 10.0, e não para 11.0)
            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!((stock.0 - 10.0).abs() < 1e-6);

            // Valida que apenas 1 movimentação de estorno foi criada
            let mov_count: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(mov_count.0, 1);
        });
    }

    #[test]
    fn test_cancel_sale_legacy_without_payments_fails_safely() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-LEGACY-1', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-20 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-LEGACY-1', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);",
                 // ZERO sale_payments
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-LEGACY-1".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(
                res.is_err(),
                "Legacy sale without structured payments must fail safely"
            );

            // Valida que a venda permanece COMPLETED e estoque inalterado
            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-LEGACY-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");

            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stock.0, 9.0);
        });
    }

    #[test]
    fn test_cancel_sale_fractional_quantity_restored() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 8.750);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 1250);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-FRAC-CANC', 'session-1', 'usr-admin', NULL, 'Consumidor', 1250, 0, 1250, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-FRAC-CANC', 'prod-1', 'Arroz 5kg', 1.250, 1000, 500, 1250);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-FRAC-CANC', 'CASH', 1250, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-FRAC-CANC".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // 8.750 + 1.250 = 10.000
            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!((stock.0 - 10.000).abs() < 1e-6);
        });
    }

    #[test]
    fn test_cancel_sale_last_purchase_date_updated_to_previous_sale() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 8.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 5000);

                 INSERT INTO customers (id, name, total_spent_cents, purchases_count, last_purchase_date, created_at)
                 VALUES ('cust-1', 'Maria Silva', 5000, 2, '2026-08-24 12:00:00', '2026-08-01 10:00:00');

                 -- Venda 1 (mais antiga, permanece COMPLETED)
                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-1', 'session-1', 'usr-admin', 'cust-1', 'Maria Silva', 2000, 0, 2000, 0, 'CASH', 'COMPLETED', '2026-08-24 09:00:00');
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-c1', 'CUPOM-1', 'prod-1', 'Arroz 5kg', 1.0, 2000, 1000, 2000);
                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-c1', 'CUPOM-1', 'CASH', 2000, '2026-08-24 09:00:00');

                 -- Venda 2 (mais recente, será cancelada)
                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-2', 'session-1', 'usr-admin', 'cust-1', 'Maria Silva', 3000, 0, 3000, 0, 'CASH', 'COMPLETED', '2026-08-24 12:00:00');
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-c2', 'CUPOM-2', 'prod-1', 'Arroz 5kg', 1.0, 3000, 1500, 3000);
                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-c2', 'CUPOM-2', 'CASH', 3000, '2026-08-24 12:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-2".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 12:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // Valida que last_purchase_date do cliente agora aponta para a Venda 1 ('2026-08-24 09:00:00')
            let cust: (i64, i64, Option<String>) = sqlx::query_as(
                "SELECT total_spent_cents, purchases_count, last_purchase_date FROM customers WHERE id = 'cust-1'",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            assert_eq!(cust.0, 2000);
            assert_eq!(cust.1, 1);
            assert_eq!(cust.2.as_deref(), Some("2026-08-24 09:00:00"));
        });
    }

    #[test]
    fn test_cancel_sale_rollback_on_inventory_movement_failure() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-FAIL-INV', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-FAIL-INV', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-FAIL-INV', 'CASH', 2500, '2026-08-24 10:00:00');

                 CREATE TRIGGER trigger_fail_inv_refund BEFORE INSERT ON inventory_movements
                 BEGIN
                     SELECT RAISE(ABORT, 'Simulated inventory refund failure');
                 END;",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-FAIL-INV".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_err());

            // Estoque deve permanecer 9.0 original (sem alteração física)
            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stock.0, 9.0);

            // Venda deve permanecer COMPLETED
            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-FAIL-INV'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");
        });
    }

    #[test]
    fn test_cancel_sale_closed_cash_session_fails_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-closed', 'usr-admin', 'Administrador', 0, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-CLOSED-CANC', 'session-closed', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-CLOSED-CANC', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-CLOSED-CANC', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-CLOSED-CANC".into(),
                current_session_id: Some("session-closed".into()), // SESSÃO FECHADA
                user_id: Some("usr-admin".into()),
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(
                res.is_err(),
                "Cash refund on closed cash session must fail"
            );

            // Venda permanece COMPLETED e estoque inalterado
            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-CLOSED-CANC'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");

            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stock.0, 9.0);
        });
    }

    #[test]
    fn test_cancel_sale_nonexistent_sale_fails() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            let payload = CancelSalePayload {
                sale_id: "CUPOM-NONEXISTENT".into(),
                current_session_id: Some("session-1".into()),
                user_id: None,
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Nonexistent sale cancellation must fail");
        });
    }

    #[test]
    fn test_cancel_sale_missing_product_fails_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-MISSING-PROD', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-MISSING-PROD', 'prod-GHOST', 'Fantasma', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-MISSING-PROD', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-MISSING-PROD".into(),
                current_session_id: Some("session-1".into()),
                user_id: None,
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Missing product in cancellation must fail");

            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-MISSING-PROD'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");
        });
    }

    #[test]
    fn test_cancel_sale_missing_customer_fails_and_rolls_back() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-MISSING-CUST', 'session-1', 'usr-admin', 'cust-GHOST', 'Fantasma', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-MISSING-CUST', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-MISSING-CUST', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-MISSING-CUST".into(),
                current_session_id: Some("session-1".into()),
                user_id: None,
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_err(), "Missing customer in cancellation must fail");

            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-MISSING-CUST'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");

            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stock.0, 9.0);
        });
    }

    #[test]
    fn test_cancel_sale_cash_session_update_failure_rolls_back() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 9.0);

                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'usr-admin', 'Administrador', 1, '2026-08-24 08:00:00', 10000, 2500);

                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-FAIL-SESS-UPDATE', 'session-1', 'usr-admin', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');

                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-FAIL-SESS-UPDATE', 'prod-1', 'Arroz 5kg', 1.0, 2500, 1500, 2500);

                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-FAIL-SESS-UPDATE', 'CASH', 2500, '2026-08-24 10:00:00');

                 CREATE TRIGGER trigger_fail_session_refund_update BEFORE UPDATE ON cash_sessions
                 BEGIN
                     SELECT RAISE(ABORT, 'Simulated cash session refund failure');
                 END;",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-FAIL-SESS-UPDATE".into(),
                current_session_id: Some("session-1".into()),
                user_id: None,
                user_name: None,
                reason: None,
                cancelled_at: "2026-08-24 10:30:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_err());

            // Venda permanece COMPLETED e estoque inalterado
            let status: (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-FAIL-SESS-UPDATE'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status.0, "COMPLETED");

            let stock: (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(stock.0, 9.0);

            let mov_count: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(mov_count.0, 0);
        });
    }

    #[test]
    fn test_cancel_open_price_cash_sale_without_product_row() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'user-1', 'Operador', 1, '2026-08-24 08:00:00', 10000, 2500);
                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-CANC-OPEN', 'session-1', 'user-1', NULL, 'Consumidor', 2500, 0, 2500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-CANC-OPEN', 'prod-open-price-1', 'Varejo Diversos', 1.0, 2500, 0, 2500);
                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-CANC-OPEN', 'CASH', 2500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-CANC-OPEN".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("user-1".into()),
                user_name: Some("Operador".into()),
                reason: Some("Cancelamento open price".into()),
                cancelled_at: "2026-08-24 10:15:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok(), "Cancel open price cash sale must succeed!");

            // Venda cancelada
            let (status, canc_at): (String, Option<String>) =
                sqlx::query_as("SELECT status, cancelled_at FROM sales WHERE id = 'CUPOM-CANC-OPEN'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status, "CANCELLED");
            assert_eq!(canc_at.unwrap(), "2026-08-24 10:15:00");

            // Caixa teve estorno de 2500
            let (session_sales,): (i64,) =
                sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(session_sales, 0);

            // Zero inventory movements de retorno para open price
            let inv_count: (i64,) = sqlx::query_as("SELECT count(*) FROM inventory_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(inv_count.0, 0);
        });
    }

    #[test]
    fn test_cancel_open_price_electronic_sale_without_product_row() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'user-1', 'Operador', 1, '2026-08-24 08:00:00', 10000, 5000);
                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-CANC-OPEN-PIX', 'session-1', 'user-1', NULL, 'Consumidor', 1500, 0, 1500, 0, 'PIX', 'COMPLETED', '2026-08-24 10:00:00');
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-CANC-OPEN-PIX', 'prod-open-price-1', 'Varejo Diversos', 1.0, 1500, 0, 1500);
                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-CANC-OPEN-PIX', 'PIX', 1500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-CANC-OPEN-PIX".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("user-1".into()),
                user_name: Some("Operador".into()),
                reason: Some("Estorno PIX".into()),
                cancelled_at: "2026-08-24 10:20:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // Venda cancelada
            let (status,): (String,) =
                sqlx::query_as("SELECT status FROM sales WHERE id = 'CUPOM-CANC-OPEN-PIX'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(status, "CANCELLED");

            // Gaveta inalterada (permaneceu 5000)
            let (session_sales,): (i64,) =
                sqlx::query_as("SELECT sales_cash_cents FROM cash_sessions WHERE id = 'session-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(session_sales, 5000);

            // Zero cash movements
            let cash_movs: (i64,) = sqlx::query_as("SELECT count(*) FROM cash_movements")
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(cash_movs.0, 0);
        });
    }

    #[test]
    fn test_cancel_mixed_sale_restores_only_real_products() {
        tauri::async_runtime::block_on(async {
            let pool = create_test_db().await;

            sqlx::query(
                "INSERT INTO products (id, internal_code, name, cost_price_cents, retail_price_cents, current_stock)
                 VALUES ('prod-1', '001', 'Arroz 5kg', 1500, 2500, 8.0);
                 INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, initial_amount_cents, sales_cash_cents)
                 VALUES ('session-1', 'user-1', 'Operador', 1, '2026-08-24 08:00:00', 10000, 3500);
                 INSERT INTO sales (id, session_id, user_id, customer_id, customer_name, subtotal_cents, discount_cents, total_cents, change_cents, payment_method, status, created_at)
                 VALUES ('CUPOM-CANC-MIXED', 'session-1', 'user-1', NULL, 'Consumidor', 3500, 0, 3500, 0, 'CASH', 'COMPLETED', '2026-08-24 10:00:00');
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-1', 'CUPOM-CANC-MIXED', 'prod-1', 'Arroz 5kg', 2.0, 500, 300, 1000);
                 INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price_cents, cost_price_cents, total_cents)
                 VALUES ('item-2', 'CUPOM-CANC-MIXED', 'prod-open-price-1', 'Varejo Diversos', 1.0, 2500, 0, 2500);
                 INSERT INTO sale_payments (id, sale_id, method, amount_cents, created_at)
                 VALUES ('pay-1', 'CUPOM-CANC-MIXED', 'CASH', 3500, '2026-08-24 10:00:00');",
            )
            .execute(&pool)
            .await
            .unwrap();

            let payload = CancelSalePayload {
                sale_id: "CUPOM-CANC-MIXED".into(),
                current_session_id: Some("session-1".into()),
                user_id: Some("user-1".into()),
                user_name: Some("Operador".into()),
                reason: Some("Cancelamento misto".into()),
                cancelled_at: "2026-08-24 10:25:00".into(),
            };

            let res = execute_cancel_sale_transaction(&pool, &payload).await;
            assert!(res.is_ok());

            // prod-1 teve estoque devolvido de 8.0 para 10.0
            let (prod1_stock,): (f64,) =
                sqlx::query_as("SELECT current_stock FROM products WHERE id = 'prod-1'")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert!((prod1_stock - 10.0).abs() < 1e-6);

            // Apenas 1 inventory movement de retorno (para prod-1, ZERO para open-price)
            let inv_movs: Vec<(String, String, f64)> =
                sqlx::query_as("SELECT product_id, type, quantity FROM inventory_movements")
                    .fetch_all(&pool)
                    .await
                    .unwrap();
            assert_eq!(inv_movs.len(), 1);
            assert_eq!(inv_movs[0].0, "prod-1");
            assert_eq!(inv_movs[0].1, "REFUND");
            assert!((inv_movs[0].2 - 2.0).abs() < 1e-6);
        });
    }
}



