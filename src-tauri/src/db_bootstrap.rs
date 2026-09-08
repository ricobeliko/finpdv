use sqlx::{Pool, Sqlite};

/// Inicialização DDL nativa e segura no backend Rust.
/// Garante que o SQLite é configurado com WAL, foreign_keys, busy_timeout = 5000
/// e que todas as tabelas existem antes de qualquer operação do frontend.
pub async fn bootstrap_database(pool: &Pool<Sqlite>) -> Result<(), String> {
    // 1. Pragmas de durabilidade e integridade
    sqlx::query("PRAGMA journal_mode = WAL;")
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao configurar journal_mode WAL: {}", e))?;

    sqlx::query("PRAGMA foreign_keys = ON;")
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao ativar foreign_keys: {}", e))?;

    sqlx::query("PRAGMA busy_timeout = 5000;")
        .execute(pool)
        .await
        .map_err(|e| format!("Erro ao configurar busy_timeout: {}", e))?;

    // 2. DDL do FinPDV e Core POS
    sqlx::query(
        "
        CREATE TABLE IF NOT EXISTS categories (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        );

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
            allow_fractional_sale INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS product_barcodes (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            barcode TEXT NOT NULL UNIQUE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS product_tier_prices (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            min_quantity REAL NOT NULL,
            price_cents INTEGER NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS inventory_movements (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            type TEXT NOT NULL,
            quantity REAL NOT NULL,
            previous_stock REAL NOT NULL,
            new_stock REAL NOT NULL,
            cost_price_cents INTEGER NOT NULL,
            operator_name TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (product_id) REFERENCES products(id)
        );

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

        CREATE TABLE IF NOT EXISTS sales (
            id TEXT PRIMARY KEY,
            session_id TEXT,
            user_id TEXT,
            user_name TEXT,
            customer_id TEXT,
            customer_name TEXT,
            subtotal_cents INTEGER NOT NULL,
            discount_cents INTEGER NOT NULL,
            total_cents INTEGER NOT NULL,
            change_cents INTEGER NOT NULL,
            payment_method TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'COMPLETED',
            cancelled_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES cash_sessions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

        CREATE TABLE IF NOT EXISTS sale_items (
            id TEXT PRIMARY KEY,
            sale_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit_price_cents INTEGER NOT NULL,
            cost_price_cents INTEGER NOT NULL,
            total_cents INTEGER NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id)
        );

        CREATE TABLE IF NOT EXISTS sale_payments (
            id TEXT PRIMARY KEY,
            sale_id TEXT NOT NULL,
            method TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            FOREIGN KEY (sale_id) REFERENCES sales(id)
        );

        CREATE TABLE IF NOT EXISTS customers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            document TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            total_spent_cents INTEGER NOT NULL DEFAULT 0,
            purchases_count INTEGER NOT NULL DEFAULT 0,
            last_purchase_date TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS suppliers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            trade_name TEXT,
            document TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            contact_person TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS purchases (
            id TEXT PRIMARY KEY,
            supplier_id TEXT,
            invoice_number TEXT,
            total_cost_cents INTEGER NOT NULL,
            purchased_at TEXT NOT NULL,
            notes TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        );

        CREATE TABLE IF NOT EXISTS purchase_items (
            id TEXT PRIMARY KEY,
            purchase_id TEXT NOT NULL,
            product_id TEXT NOT NULL,
            product_name TEXT NOT NULL,
            quantity REAL NOT NULL,
            unit_cost_cents INTEGER NOT NULL,
            total_cost_cents INTEGER NOT NULL,
            FOREIGN KEY (purchase_id) REFERENCES purchases(id)
        );

        CREATE TABLE IF NOT EXISTS installation_info (
            installation_id TEXT PRIMARY KEY,
            is_configured INTEGER NOT NULL DEFAULT 0,
            configured_at TEXT,
            version TEXT NOT NULL
        );

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

        CREATE TABLE IF NOT EXISTS stores (
            id TEXT PRIMARY KEY,
            business_id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            address TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (business_id) REFERENCES business_profile(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS terminals (
            id TEXT PRIMARY KEY,
            store_id TEXT NOT NULL,
            code TEXT NOT NULL,
            name TEXT NOT NULL,
            printer_name TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
        );

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

        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

        CREATE TABLE IF NOT EXISTS support_sessions (
            id TEXT PRIMARY KEY,
            challenge TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            granted_by_user_id TEXT,
            created_at TEXT NOT NULL
        );
        ",
    )
    .execute(pool)
    .await
    .map_err(|e| format!("Erro ao executar DDL de inicialização do banco: {}", e))?;

    // 3. Categorias padrão iniciais se a tabela categories estiver vazia
    let cat_count: (i64,) = sqlx::query_as("SELECT count(*) FROM categories")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Erro ao consultar categories: {}", e))?;

    if cat_count.0 == 0 {
        let _ = sqlx::query(
            "INSERT OR IGNORE INTO categories (id, name) VALUES 
             ('cat-1', 'Mercearia & Grãos'),
             ('cat-2', 'Bebidas'),
             ('cat-3', 'Laticínios & Frios'),
             ('cat-4', 'Higiene & Limpeza'),
             ('cat-5', 'Hortifrúti'),
             ('cat-6', 'Padaria & Confeitaria'),
             ('cat-7', 'Outros')"
        )
        .execute(pool)
        .await;
    }

    // 4. Produto virtual 'Varejo Diversos / Open Price'
    let open_prod_exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM products WHERE id = ?")
            .bind(crate::sale_transaction::OPEN_PRICE_PRODUCT_ID)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Erro ao verificar item open price: {}", e))?;

    if open_prod_exists.is_none() {
        let now = "2026-01-01T00:00:00.000Z";
        let _ = sqlx::query(
            "INSERT INTO products (
                id, internal_code, name, category_id, unit_measure,
                cost_price_cents, retail_price_cents, current_stock, min_stock,
                allow_fractional_sale, notes, created_at, updated_at
            ) VALUES (?, '999999', 'Varejo Diversos (Preço Livre)', 'cat-7', 'UN', 0, 0, 999999, 0, 0, 'Item de sistema', ?, ?)"
        )
        .bind(crate::sale_transaction::OPEN_PRICE_PRODUCT_ID)
        .bind(now)
        .bind(now)
        .execute(pool)
        .await;
    }

    Ok(())
}
