use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
#[repr(C)]
struct DocInfo1W {
    p_doc_name: *mut u16,
    p_output_file: *mut u16,
    p_datatype: *mut u16,
}

#[cfg(windows)]
extern "system" {
    fn LoadLibraryA(lp_lib_filename: *const u8) -> isize;
    fn GetProcAddress(h_module: isize, lp_proc_name: *const u8) -> *const std::ffi::c_void;
    fn FreeLibrary(h_lib_module: isize) -> i32;
}

#[cfg(windows)]
type OpenPrinterWFn = unsafe extern "system" fn(*mut u16, *mut isize, *mut std::ffi::c_void) -> i32;
#[cfg(windows)]
type StartDocPrinterWFn = unsafe extern "system" fn(isize, u32, *mut DocInfo1W) -> u32;
#[cfg(windows)]
type StartPagePrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type WritePrinterFn = unsafe extern "system" fn(isize, *const std::ffi::c_void, u32, *mut u32) -> i32;
#[cfg(windows)]
type EndPagePrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type EndDocPrinterFn = unsafe extern "system" fn(isize) -> i32;
#[cfg(windows)]
type ClosePrinterFn = unsafe extern "system" fn(isize) -> i32;

// 1. LISTA TODAS AS IMPRESSORAS INSTALADAS NO WINDOWS
#[tauri::command]
fn get_printers() -> Result<Vec<String>, String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Printer | Select-Object -ExpandProperty Name"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Erro ao buscar impressoras: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let printers: Vec<String> = stdout
                .lines()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            Ok(printers)
        } else {
            Err("Falha ao listar impressoras do Windows".into())
        }
    }
    #[cfg(not(windows))]
    {
        Ok(vec!["Impressora_Termica_Simulada".to_string()])
    }
}

// 2. ENVIA BYTES ESC/POS DIRETO PARA O SPOOLER (SEM CAIXA DE DIÁLOGO)
#[tauri::command]
fn print_raw_escpos(printer_name: String, data: Vec<u8>) -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        let spool = LoadLibraryA(b"winspool.drv\0".as_ptr());
        if spool == 0 {
            return Err("Não foi possível carregar winspool.drv".into());
        }

        let open_printer_ptr = GetProcAddress(spool, b"OpenPrinterW\0".as_ptr());
        let start_doc_ptr = GetProcAddress(spool, b"StartDocPrinterW\0".as_ptr());
        let start_page_ptr = GetProcAddress(spool, b"StartPagePrinter\0".as_ptr());
        let write_printer_ptr = GetProcAddress(spool, b"WritePrinter\0".as_ptr());
        let end_page_ptr = GetProcAddress(spool, b"EndPagePrinter\0".as_ptr());
        let end_doc_ptr = GetProcAddress(spool, b"EndDocPrinter\0".as_ptr());
        let close_printer_ptr = GetProcAddress(spool, b"ClosePrinter\0".as_ptr());

        if open_printer_ptr.is_null()
            || start_doc_ptr.is_null()
            || start_page_ptr.is_null()
            || write_printer_ptr.is_null()
            || end_page_ptr.is_null()
            || end_doc_ptr.is_null()
            || close_printer_ptr.is_null()
        {
            FreeLibrary(spool);
            return Err("Falha ao carregar funções de impressão do Windows".into());
        }

        let open_printer_w: OpenPrinterWFn = std::mem::transmute(open_printer_ptr);
        let start_doc_printer_w: StartDocPrinterWFn = std::mem::transmute(start_doc_ptr);
        let start_page_printer: StartPagePrinterFn = std::mem::transmute(start_page_ptr);
        let write_printer: WritePrinterFn = std::mem::transmute(write_printer_ptr);
        let end_page_printer: EndPagePrinterFn = std::mem::transmute(end_page_ptr);
        let end_doc_printer: EndDocPrinterFn = std::mem::transmute(end_doc_ptr);
        let close_printer: ClosePrinterFn = std::mem::transmute(close_printer_ptr);

        let mut name_wide: Vec<u16> = OsStr::new(&printer_name)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let mut handle: isize = 0;
        if open_printer_w(name_wide.as_mut_ptr(), &mut handle, std::ptr::null_mut()) == 0 {
            FreeLibrary(spool);
            return Err(format!("Impressora '{}' não foi encontrada no Windows", printer_name));
        }

        let mut doc_name: Vec<u16> = OsStr::new("Cupom PDV").encode_wide().chain(std::iter::once(0)).collect();
        let mut data_type: Vec<u16> = OsStr::new("RAW").encode_wide().chain(std::iter::once(0)).collect();

        let mut doc_info = DocInfo1W {
            p_doc_name: doc_name.as_mut_ptr(),
            p_output_file: std::ptr::null_mut(),
            p_datatype: data_type.as_mut_ptr(),
        };

        if start_doc_printer_w(handle, 1, &mut doc_info) == 0 {
            close_printer(handle);
            FreeLibrary(spool);
            return Err("Falha ao iniciar documento de impressão no spooler".into());
        }

        start_page_printer(handle);

        let mut written: u32 = 0;
        write_printer(
            handle,
            data.as_ptr() as *const std::ffi::c_void,
            data.len() as u32,
            &mut written,
        );

        end_page_printer(handle);
        end_doc_printer(handle);
        close_printer(handle);
        FreeLibrary(spool);

        Ok(())
    }

    #[cfg(not(windows))]
    {
        println!("Impressão RAW simulada: {} bytes", data.len());
        Ok(())
    }
}

mod cosmos_lookup;
mod sale_cancellation;
mod sale_transaction;
pub mod security;

// 3. PULSO PARA ABRIR GAVETA DE DINHEIRO (RJ11)
#[tauri::command]
fn open_cash_drawer(printer_name: String) -> Result<(), String> {
    let drawer_pulse = vec![0x1B, 0x70, 0x00, 0x19, 0xFA];
    print_raw_escpos(printer_name, drawer_pulse)
}

/// Cria um snapshot consistente e desfragmentado de finpdv.db antes de migrations estruturais.
/// Idempotente por versão: se o backup da versão atual já existir, não sobrescreve nem duplica.
pub fn create_pre_migration_backup_in_dir(
    app_data_dir: &std::path::Path,
    version: &str,
) -> Result<Option<std::path::PathBuf>, String> {
    let db_path = app_data_dir.join("finpdv.db");
    if !db_path.exists() {
        return Ok(None);
    }

    let backup_filename = format!("finpdv-pre-migration-v{}.db", version);
    let backup_path = app_data_dir.join(&backup_filename);

    if backup_path.exists() {
        return Ok(Some(backup_path));
    }

    let db_str = db_path.to_string_lossy().replace('\\', "/");
    let backup_str = backup_path.to_string_lossy().replace('\\', "/");
    let db_url = format!("sqlite://{}", db_str);

    tauri::async_runtime::block_on(async {
        use sqlx::sqlite::SqliteConnectOptions;
        use sqlx::ConnectOptions;
        use std::str::FromStr;

        let opts = SqliteConnectOptions::from_str(&db_url)
            .map_err(|e| format!("Erro ao configurar conexão para backup: {}", e))?
            .read_only(true);

        let mut conn = opts
            .connect()
            .await
            .map_err(|e| format!("Erro ao conectar no banco para backup: {}", e))?;

        let query = format!("VACUUM INTO '{}'", backup_str);
        sqlx::query(&query)
            .execute(&mut conn)
            .await
            .map_err(|e| format!("Erro ao executar VACUUM INTO: {}", e))?;

        Ok::<Option<std::path::PathBuf>, String>(Some(backup_path))
    })
}

// 4. AUTENTICAÇÃO E RBAC COM ARGON2ID NATIVO
#[tauri::command]
fn hash_credential(credential: String) -> Result<String, String> {
    security::hash_credential_argon2(&credential)
}

#[tauri::command]
fn verify_credential(credential: String, hash: String) -> Result<bool, String> {
    Ok(security::verify_credential_argon2(&credential, &hash))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let version = app.package_info().version.to_string();
                if let Err(err) = create_pre_migration_backup_in_dir(&app_data_dir, &version) {
                    eprintln!("Aviso: falha ao criar backup pré-migration: {}", err);
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .invoke_handler(tauri::generate_handler![
            get_printers, 
            print_raw_escpos, 
            open_cash_drawer,
            sale_transaction::save_sale_transaction,
            sale_cancellation::cancel_sale_transaction,
            cosmos_lookup::lookup_cosmos_gtin,
            hash_credential,
            verify_credential
        ])
        .run(tauri::generate_context!())
        .expect("erro ao executar aplicação tauri");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_pre_migration_backup_nonexistent_db_returns_none() {
        let temp_dir = std::env::temp_dir().join(format!("finpdv_test_nobackup_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&temp_dir).unwrap();

        let res = create_pre_migration_backup_in_dir(&temp_dir, "0.1.16");
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), None);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_pre_migration_backup_creates_consistent_backup_and_is_idempotent() {
        let temp_dir = std::env::temp_dir().join(format!("finpdv_test_backup_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&temp_dir).unwrap();

        let db_path = temp_dir.join("finpdv.db");
        let db_str = db_path.to_string_lossy().replace('\\', "/");
        let db_url = format!("sqlite://{}", db_str);

        // Inicializa o banco com dados de teste
        tauri::async_runtime::block_on(async {
            use sqlx::sqlite::SqliteConnectOptions;
            use sqlx::ConnectOptions;
            use std::str::FromStr;

            let opts = SqliteConnectOptions::from_str(&db_url)
                .unwrap()
                .create_if_missing(true);

            let mut conn = opts.connect().await.unwrap();
            sqlx::query(
                "CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
                 INSERT INTO products (id, name) VALUES ('prod-1', 'Arroz 5kg');"
            )
            .execute(&mut conn)
            .await
            .unwrap();
        });

        // 1. Primeira execução: deve criar o backup
        let res1 = create_pre_migration_backup_in_dir(&temp_dir, "0.1.16");
        assert!(res1.is_ok());
        let backup_path = res1.unwrap().expect("Backup path must be Some");
        assert!(backup_path.exists());
        assert_eq!(backup_path.file_name().unwrap(), "finpdv-pre-migration-v0.1.16.db");

        // Valida integridade e dados do backup criado
        tauri::async_runtime::block_on(async {
            use sqlx::sqlite::SqliteConnectOptions;
            use sqlx::ConnectOptions;
            use std::str::FromStr;

            let b_url = format!("sqlite://{}", backup_path.to_string_lossy().replace('\\', "/"));
            let opts = SqliteConnectOptions::from_str(&b_url).unwrap().read_only(true);
            let mut conn = opts.connect().await.unwrap();

            let (check,): (String,) = sqlx::query_as("PRAGMA integrity_check;")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(check, "ok");

            let (cnt,): (i64,) = sqlx::query_as("SELECT count(*) FROM products;")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(cnt, 1);
        });

        // 2. Segunda execução: idempotente, não dá erro e retorna o backup existente
        let res2 = create_pre_migration_backup_in_dir(&temp_dir, "0.1.16");
        assert!(res2.is_ok());
        assert_eq!(res2.unwrap(), Some(backup_path));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_clean_install_onboarding_and_persistence_flow() {
        let temp_dir = std::env::temp_dir().join(format!("finpdv_clean_test_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&temp_dir).unwrap();
        let db_path = temp_dir.join("test_finpdv.db");
        let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy().replace('\\', "/"));

        tauri::async_runtime::block_on(async {
            use sqlx::sqlite::SqlitePoolOptions;
            use crate::security::{hash_credential_argon2, verify_credential_argon2};
            use crate::sale_transaction::{
                execute_sale_transaction, SaleTransactionPayload, SaleItemPayload, SalePaymentPayload
            };

            // 1. INSTALAÇÃO LIMPA: Inicia banco zerado e aplica o schema do FinPDV v1.0.0
            let pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect(&db_url)
                .await
                .expect("Falha ao abrir banco SQLite limpo");

            sqlx::query(
                "CREATE TABLE installation_info (
                    installation_id TEXT PRIMARY KEY,
                    is_configured INTEGER NOT NULL DEFAULT 0,
                    configured_at TEXT,
                    version TEXT NOT NULL DEFAULT '1.0.0'
                );
                CREATE TABLE business_profile (
                    id TEXT PRIMARY KEY,
                    legal_name TEXT NOT NULL,
                    trade_name TEXT NOT NULL,
                    cnpj TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE stores (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE terminals (
                    id TEXT PRIMARY KEY,
                    store_id TEXT NOT NULL,
                    terminal_number TEXT NOT NULL,
                    name TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (store_id) REFERENCES stores(id)
                );
                CREATE TABLE users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    pin_hash TEXT,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
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
                CREATE TABLE cash_movements (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    amount_cents INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE
                );"
            )
            .execute(&pool)
            .await
            .expect("Falha ao criar schema limpo do FinPDV");

            // 2. ONBOARDING: Criação de Empresa, Loja, Terminal e primeiro CLIENT_ADMIN
            let inst_id = "finpdv-inst-homolog-100";
            sqlx::query("INSERT INTO installation_info (installation_id, is_configured, configured_at, version) VALUES ($1, 1, '2026-09-08T10:00:00Z', '1.0.0')")
                .bind(inst_id)
                .execute(&pool)
                .await
                .unwrap();

            let biz_id = "biz-matriz-01";
            sqlx::query("INSERT INTO business_profile (id, legal_name, trade_name, cnpj, is_active, created_at) VALUES ($1, 'FinPDV Comércio Ltda', 'FinPDV Matriz', '12.345.678/0001-90', 1, '2026-09-08T10:00:00Z')")
                .bind(biz_id)
                .execute(&pool)
                .await
                .unwrap();

            let store_id = "store-matriz-01";
            sqlx::query("INSERT INTO stores (id, code, name, is_active, created_at) VALUES ($1, '001', 'Loja Matriz Centro', 1, '2026-09-08T10:00:00Z')")
                .bind(store_id)
                .execute(&pool)
                .await
                .unwrap();

            let term_id = "term-caixa-01";
            sqlx::query("INSERT INTO terminals (id, store_id, terminal_number, name, is_active, created_at) VALUES ($1, $2, '01', 'Terminal Caixa 01', 1, '2026-09-08T10:00:00Z')")
                .bind(term_id)
                .bind(store_id)
                .execute(&pool)
                .await
                .unwrap();

            let admin_pw_hash = hash_credential_argon2("SenhaMestraAdmin2026!").expect("Falha ao gerar hash Argon2id");
            let admin_id = "usr-admin-01";
            sqlx::query("INSERT INTO users (id, username, full_name, role, password_hash, pin_hash, is_active, created_at) VALUES ($1, 'admin', 'Administrador FinPDV', 'CLIENT_ADMIN', $2, NULL, 1, '2026-09-08T10:00:00Z')")
                .bind(admin_id)
                .bind(&admin_pw_hash)
                .execute(&pool)
                .await
                .unwrap();

            // 3. LOGIN ADMIN: Valida autenticação do primeiro CLIENT_ADMIN com Argon2id
            let pw_match = verify_credential_argon2("SenhaMestraAdmin2026!", &admin_pw_hash);
            assert!(pw_match, "Senha do primeiro CLIENT_ADMIN deve ser validada com sucesso");

            // 4. ABERTURA DE CAIXA: Operador abre turno com suprimento de R$ 100,00 (10.000 cents)
            let session_id = "sess-20260908-01";
            sqlx::query("INSERT INTO cash_sessions (id, user_id, user_name, is_open, opened_at, closed_at, initial_amount_cents, expected_drawer_cents) VALUES ($1, $2, 'Administrador FinPDV', 1, '2026-09-08T10:05:00Z', NULL, 10000, 10000)")
                .bind(session_id)
                .bind(admin_id)
                .execute(&pool)
                .await
                .unwrap();

            // Cadastra produto de teste com 50 unidades no estoque
            let prod_id = "prod-arroz-5kg";
            sqlx::query("INSERT INTO products (id, internal_code, name, category_id, unit_measure, cost_price_cents, retail_price_cents, current_stock, min_stock, max_stock, is_weighable, is_open_price, is_active) VALUES ($1, '7891234567890', 'Arroz Nobre 5kg', NULL, 'UN', 1800, 2500, 50.0, 5.0, 100.0, 0, 0, 1)")
                .bind(prod_id)
                .execute(&pool)
                .await
                .unwrap();

            // 5. VENDA DE TESTE: Executa transação global atômica nativa Rust
            let sale_id = "CUPOM-20260908-1001";
            let sale_payload = SaleTransactionPayload {
                id: sale_id.to_string(),
                session_id: Some(session_id.to_string()),
                user_id: Some(admin_id.to_string()),
                user_name: Some("Administrador FinPDV".to_string()),
                customer_id: None,
                customer_name: None,
                subtotal_cents: 2500,
                discount_cents: 0,
                total_cents: 2500,
                change_cents: 0,
                payment_method: "DINHEIRO".to_string(),
                status: "COMPLETED".to_string(),
                cancelled_at: None,
                created_at: "2026-09-08T10:10:00Z".to_string(),
                items: vec![SaleItemPayload {
                    id: "item-01".to_string(),
                    product_id: prod_id.to_string(),
                    product_name: "Arroz Nobre 5kg".to_string(),
                    quantity: 1.0,
                    unit_price_cents: 2500,
                    cost_price_cents: 1800,
                    total_cents: 2500,
                }],
                payments: vec![SalePaymentPayload {
                    id: "pay-01".to_string(),
                    method: "DINHEIRO".to_string(),
                    amount_cents: 2500,
                }],
            };

            execute_sale_transaction(&pool, &sale_payload)
                .await
                .expect("Transação atômica da venda de teste deve ter sucesso");

            // Verifica estoque decrementado (50 - 1 = 49)
            let (stock,): (f64,) = sqlx::query_as("SELECT current_stock FROM products WHERE id = $1")
                .bind(prod_id)
                .fetch_one(&pool)
                .await
                .unwrap();
            assert_eq!(stock, 49.0);

            // 6. FECHAMENTO DE CAIXA: Fechamento com saldo final (10.000 + 2.500 = 12.500 cents)
            sqlx::query("UPDATE cash_sessions SET is_open = 0, closed_at = '2026-09-08T18:00:00Z', counted_cents = 12500, difference_cents = 0 WHERE id = $1")
                .bind(session_id)
                .execute(&pool)
                .await
                .unwrap();

            // 7. FECHA A CONEXÃO (Simula encerramento do processo do app)
            pool.close().await;
        });

        // 8. REINICIAR APLICATIVO: Abre nova conexão ao arquivo de banco existente e valida persistência
        tauri::async_runtime::block_on(async {
            use sqlx::sqlite::SqliteConnectOptions;
            use sqlx::ConnectOptions;
            use std::str::FromStr;

            let opts = SqliteConnectOptions::from_str(&db_url)
                .unwrap()
                .read_only(true);
            let mut conn = opts.connect().await.unwrap();

            // Integridade física SQLite
            let (check,): (String,) = sqlx::query_as("PRAGMA integrity_check;")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(check, "ok", "Integridade SQLite deve ser 'ok'");

            // Valida persistência da instalação e versão 1.0.0
            let (ver, is_conf): (String, i64) = sqlx::query_as("SELECT version, is_configured FROM installation_info LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(ver, "1.0.0", "Versão persistida no banco deve ser 1.0.0");
            assert_eq!(is_conf, 1, "Sistema deve permanecer configurado após reinício");

            // Valida persistência do perfil de empresa e terminal
            let (trade_name,): (String,) = sqlx::query_as("SELECT trade_name FROM business_profile LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(trade_name, "FinPDV Matriz");

            // Valida persistência do primeiro CLIENT_ADMIN
            let (usr_role,): (String,) = sqlx::query_as("SELECT role FROM users WHERE username = 'admin'")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(usr_role, "CLIENT_ADMIN");

            // Valida persistência da sessão de caixa fechada
            let (is_open, counted_bal): (i64, i64) = sqlx::query_as("SELECT is_open, counted_cents FROM cash_sessions LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(is_open, 0);
            assert_eq!(counted_bal, 12500);

            // Valida persistência da venda, itens e pagamentos
            let (sale_total, sale_st): (i64, String) = sqlx::query_as("SELECT total_cents, status FROM sales LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(sale_total, 2500);
            assert_eq!(sale_st, "COMPLETED");

            let (item_qty,): (f64,) = sqlx::query_as("SELECT quantity FROM sale_items LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(item_qty, 1.0);

            let (pay_amt,): (i64,) = sqlx::query_as("SELECT amount_cents FROM sale_payments LIMIT 1")
                .fetch_one(&mut conn)
                .await
                .unwrap();
            assert_eq!(pay_amt, 2500);
        });

        // Limpeza de recursos temporários
        let _ = fs::remove_dir_all(&temp_dir);
    }
}


