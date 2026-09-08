use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::async_runtime::RwLock;

pub fn hash_credential_argon2(credential: &str) -> Result<String, String> {
    if credential.trim().len() < 4 {
        return Err("A credencial deve possuir pelo menos 4 caracteres.".into());
    }
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    argon2
        .hash_password(credential.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("Erro ao gerar hash Argon2id: {}", e))
}

pub fn verify_credential_argon2(credential: &str, hash: &str) -> bool {
    if credential.is_empty() || hash.is_empty() {
        return false;
    }
    let parsed_hash = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };
    Argon2::default()
        .verify_password(credential.as_bytes(), &parsed_hash)
        .is_ok()
}

pub fn check_role_permission(role: &str, permission: &str) -> bool {
    match role {
        "CLIENT_ADMIN" => true,
        "MANAGER" => matches!(
            permission,
            "sale.create"
                | "sale.cancel"
                | "sale.discount"
                | "sale.reopen"
                | "sale.reprint"
                | "product.view"
                | "product.create"
                | "product.edit"
                | "stock.view"
                | "stock.edit"
                | "cash.open"
                | "cash.close"
                | "cash.withdraw"
                | "cash.supply"
                | "reports.view"
                | "backup.create"
        ),
        "SUPERVISOR" => matches!(
            permission,
            "sale.create"
                | "sale.cancel"
                | "sale.discount"
                | "sale.reprint"
                | "product.view"
                | "cash.open"
                | "cash.close"
                | "cash.withdraw"
                | "cash.supply"
                | "stock.view"
        ),
        "OPERATOR" => matches!(
            permission,
            "sale.create" | "sale.reprint" | "product.view" | "cash.open" | "cash.close"
        ),
        "FINPDV_SUPPORT" => matches!(
            permission,
            "maintenance.view"
                | "maintenance.execute"
                | "backup.create"
                | "backup.restore"
                | "settings.view"
        ),
        _ => false,
    }
}

pub struct SupportSessionValidator {
    consumed_tokens: HashSet<String>,
}

impl SupportSessionValidator {
    pub fn new() -> Self {
        Self {
            consumed_tokens: HashSet::new(),
        }
    }

    pub fn validate_and_consume(
        &mut self,
        session_id: &str,
        provided_challenge: &str,
        expected_challenge: &str,
        expires_at_unix: u64,
        current_time_unix: u64,
        is_revoked: bool,
    ) -> Result<(), &'static str> {
        if is_revoked {
            return Err("Sessão de suporte revogada pelo administrador.");
        }
        if current_time_unix > expires_at_unix {
            return Err("Sessão de suporte expirada.");
        }
        if provided_challenge != expected_challenge {
            return Err("Challenge de suporte inválido.");
        }
        if self.consumed_tokens.contains(session_id) {
            return Err("Tentativa de replay detectada: token já utilizado.");
        }
        self.consumed_tokens.insert(session_id.to_string());
        Ok(())
    }
}

// ==========================================
// SESSÃO CONFIÁVEL DE BACKEND (RUST-MANAGED)
// ==========================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveUserSession {
    pub user_id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub logged_at: u64,
}

#[derive(Clone)]
pub struct SessionState(pub Arc<RwLock<Option<ActiveUserSession>>>);

impl SessionState {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(None)))
    }
}

impl Default for SessionState {
    fn default() -> Self {
        Self::new()
    }
}

/// Validação autoritativa de sessão e RBAC no backend Rust.
/// - Impede execução anônima ou não autorizada;
/// - Valida em tempo real no SQLite se o usuário continua ativo (is_active == 1);
/// - Invalida imediatamente a sessão em caso de desativação do usuário.
pub async fn require_permission(
    session_state: &SessionState,
    pool: &Pool<Sqlite>,
    required_permission: &str,
) -> Result<ActiveUserSession, String> {
    let session = {
        let read_guard = session_state.0.read().await;
        read_guard.clone().ok_or_else(|| {
            "Não autenticado: nenhuma sessão ativa encontrada no backend FinPDV.".to_string()
        })?
    };

    // Consulta em tempo real no SQLite: garante que o usuário ainda existe e está ativo
    let user_row: Option<(i64, String, String)> =
        sqlx::query_as("SELECT is_active, role, name FROM users WHERE id = ?")
            .bind(&session.user_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| format!("Erro ao validar sessão no banco de dados: {}", e))?;

    let (is_active, db_role, _db_name) = match user_row {
        Some(u) => u,
        None => {
            let mut write_guard = session_state.0.write().await;
            *write_guard = None;
            return Err("Sessão revogada: usuário não encontrado no banco de dados.".into());
        }
    };

    if is_active != 1 {
        let mut write_guard = session_state.0.write().await;
        *write_guard = None;
        return Err("Sessão revogada: usuário foi inativado ou desativado.".into());
    }

    if !check_role_permission(&db_role, required_permission) {
        return Err(format!(
            "Acesso negado: a role '{}' não possui a permissão requerida '{}'.",
            db_role, required_permission
        ));
    }

    Ok(session)
}

/// Autentica o usuário com Argon2id, cria a sessão confiável no Rust e atualiza last_login
pub async fn authenticate_user(
    session_state: &SessionState,
    pool: &Pool<Sqlite>,
    username: &str,
    credential_plain: &str,
) -> Result<ActiveUserSession, String> {
    let trimmed = username.trim().to_lowercase();
    if trimmed.is_empty() || credential_plain.is_empty() {
        return Err("Usuário e credencial são obrigatórios.".into());
    }

    let user_row: Option<(String, String, String, String, Option<String>, String, i64)> =
        sqlx::query_as(
            "SELECT id, username, name, password_hash, pin_hash, role, is_active 
             FROM users 
             WHERE username = ?"
        )
        .bind(&trimmed)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Erro ao consultar usuário para autenticação: {}", e))?;

    let (user_id, user_name, full_name, password_hash, pin_hash, role, is_active) = match user_row {
        Some(row) => row,
        None => return Err("Credenciais inválidas.".into()),
    };

    if is_active != 1 {
        return Err("Usuário inativo. Contate o administrador.".into());
    }

    let is_pass_ok = verify_credential_argon2(credential_plain, &password_hash);
    let is_pin_ok = if let Some(pin) = pin_hash {
        verify_credential_argon2(credential_plain, &pin)
    } else {
        false
    };

    if !is_pass_ok && !is_pin_ok {
        return Err("Credenciais inválidas.".into());
    }

    let now_unix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let session = ActiveUserSession {
        user_id: user_id.clone(),
        username: user_name,
        full_name,
        role,
        logged_at: now_unix,
    };

    {
        let mut write_guard = session_state.0.write().await;
        *write_guard = Some(session.clone());
    }

    let _ = sqlx::query("UPDATE users SET updated_at = datetime('now') WHERE id = ?")
        .bind(&user_id)
        .execute(pool)
        .await;

    Ok(session)
}

pub async fn clear_session(session_state: &SessionState) {
    let mut write_guard = session_state.0.write().await;
    *write_guard = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn create_mock_auth_db() -> Pool<Sqlite> {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("Falha ao criar banco de teste");

        sqlx::query(
            "CREATE TABLE users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                pin_hash TEXT,
                role TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );"
        )
        .execute(&pool)
        .await
        .expect("Falha ao criar tabela users");

        pool
    }

    #[test]
    fn test_valid_password_argon2_pass() {
        let password = "MinhaSenhaForte@2026";
        let hash = hash_credential_argon2(password).expect("Hash deve ser gerado");
        assert!(verify_credential_argon2(password, &hash));
    }

    #[test]
    fn test_invalid_password_argon2_fail() {
        let password = "MinhaSenhaForte@2026";
        let hash = hash_credential_argon2(password).expect("Hash deve ser gerado");
        assert!(!verify_credential_argon2("SenhaIncorreta", &hash));
    }

    #[test]
    fn test_valid_pin_argon2_pass() {
        let pin = "9821";
        let hash = hash_credential_argon2(pin).expect("Hash do PIN deve ser gerado");
        assert!(verify_credential_argon2(pin, &hash));
    }

    #[test]
    fn test_invalid_pin_argon2_fail() {
        let pin = "9821";
        let hash = hash_credential_argon2(pin).expect("Hash do PIN deve ser gerado");
        assert!(!verify_credential_argon2("1234", &hash));
    }

    #[test]
    fn test_operator_sale_cancel_fail() {
        assert!(!check_role_permission("OPERATOR", "sale.cancel"));
    }

    #[test]
    fn test_operator_cash_withdraw_fail() {
        assert!(!check_role_permission("OPERATOR", "cash.withdraw"));
    }

    #[test]
    fn test_operator_users_manage_fail() {
        assert!(!check_role_permission("OPERATOR", "users.manage"));
    }

    #[test]
    fn test_supervisor_users_manage_fail() {
        assert!(!check_role_permission("SUPERVISOR", "users.manage"));
    }

    #[test]
    fn test_client_admin_users_manage_pass() {
        assert!(check_role_permission("CLIENT_ADMIN", "users.manage"));
    }

    #[test]
    fn test_supervisor_sale_cancel_pass() {
        assert!(check_role_permission("SUPERVISOR", "sale.cancel"));
    }

    #[test]
    fn test_require_permission_no_session_fails() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let res = require_permission(&session_state, &pool, "sale.create").await;
            assert!(res.is_err());
            assert!(res.unwrap_err().contains("Não autenticado"));
        });
    }

    #[test]
    fn test_authenticated_operator_blocked_from_cancel_sale() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let pass_hash = hash_credential_argon2("op1234").unwrap();
            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('u-op', 'operador', 'Operador Caixa', ?, 'OPERATOR', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&pass_hash)
            .execute(&pool)
            .await
            .unwrap();

            // Login do operador
            let auth_res = authenticate_user(&session_state, &pool, "operador", "op1234").await;
            assert!(auth_res.is_ok());

            // Operador tem permissão para criar venda
            let perm_create = require_permission(&session_state, &pool, "sale.create").await;
            assert!(perm_create.is_ok());

            // Operador NÃO pode cancelar venda (RBAC enforced no Rust)
            let perm_cancel = require_permission(&session_state, &pool, "sale.cancel").await;
            assert!(perm_cancel.is_err());
            assert!(perm_cancel.unwrap_err().contains("Acesso negado: a role 'OPERATOR'"));

            // Operador NÃO pode gerenciar usuários
            let perm_users = require_permission(&session_state, &pool, "users.manage").await;
            assert!(perm_users.is_err());
        });
    }

    #[test]
    fn test_user_disabled_during_active_session_is_immediately_revoked() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let pass_hash = hash_credential_argon2("sup1234").unwrap();
            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('u-sup', 'supervisor', 'Supervisor Loja', ?, 'SUPERVISOR', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&pass_hash)
            .execute(&pool)
            .await
            .unwrap();

            // Login inicial do supervisor
            let auth_res = authenticate_user(&session_state, &pool, "supervisor", "sup1234").await;
            assert!(auth_res.is_ok());

            // Confere que o supervisor tem permissão de cancelar venda
            let perm1 = require_permission(&session_state, &pool, "sale.cancel").await;
            assert!(perm1.is_ok());

            // Administrador desativa o usuário no banco (is_active = 0)
            sqlx::query("UPDATE users SET is_active = 0 WHERE id = 'u-sup'")
                .execute(&pool)
                .await
                .unwrap();

            // Na próxima tentativa de qualquer operação, o backend detecta imediatamente e revoga a sessão
            let perm2 = require_permission(&session_state, &pool, "sale.cancel").await;
            assert!(perm2.is_err());
            assert!(perm2.unwrap_err().contains("Sessão revogada: usuário foi inativado"));

            // Confere que a sessão em memória no Rust foi limpa
            let active_sess = session_state.0.read().await;
            assert!(active_sess.is_none());
        });
    }

    #[test]
    fn test_logout_clears_session() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let pass_hash = hash_credential_argon2("adm1234").unwrap();
            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('u-adm', 'admin', 'Administrador', ?, 'CLIENT_ADMIN', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&pass_hash)
            .execute(&pool)
            .await
            .unwrap();

            let auth_res = authenticate_user(&session_state, &pool, "admin", "adm1234").await;
            assert!(auth_res.is_ok());

            clear_session(&session_state).await;

            let perm = require_permission(&session_state, &pool, "users.manage").await;
            assert!(perm.is_err());
            assert!(perm.unwrap_err().contains("Não autenticado"));
        });
    }

    #[test]
    fn test_tampered_frontend_cannot_bypass_backend_rbac() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            // Atacante tenta invocar diretamente sem login prévio (mesmo alegando ser ADMIN no JS)
            let direct_call_res = require_permission(&session_state, &pool, "users.manage").await;
            assert!(direct_call_res.is_err());
            assert!(direct_call_res.unwrap_err().contains("Não autenticado"));

            // Agora cadastra operador legítimo
            let pass_hash = hash_credential_argon2("op1234").unwrap();
            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('u-op', 'operador', 'Operador', ?, 'OPERATOR', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&pass_hash)
            .execute(&pool)
            .await
            .unwrap();

            // Operador loga
            authenticate_user(&session_state, &pool, "operador", "op1234").await.unwrap();

            // Se o frontend adulterar qualquer payload ou invocar 'backup.restore' ou 'users.manage' ou 'cash.withdraw',
            // o backend Rust rejeita estritamente consultando a sessão confiável e o SQLite
            assert!(require_permission(&session_state, &pool, "backup.restore").await.is_err());
            assert!(require_permission(&session_state, &pool, "users.manage").await.is_err());
            assert!(require_permission(&session_state, &pool, "cash.withdraw").await.is_err());
            assert!(require_permission(&session_state, &pool, "sale.cancel").await.is_err());
        });
    }

    #[test]
    fn test_restart_starts_with_empty_session() {
        // Novo SessionState (equivalente a novo processo do app) sempre começa sem sessão (None)
        let fresh_session_state = SessionState::new();
        tauri::async_runtime::block_on(async {
            let guard = fresh_session_state.0.read().await;
            assert!(guard.is_none(), "Nova inicialização nunca deve restaurar sessão privilegiada automaticamente");
        });
    }

    #[test]
    fn test_login_failure_does_not_create_session() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let pass_hash = hash_credential_argon2("correta123").unwrap();
            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES ('u-1', 'caixa1', 'Caixa 1', ?, 'OPERATOR', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&pass_hash)
            .execute(&pool)
            .await
            .unwrap();

            // Tentativa com senha errada
            let fail_res = authenticate_user(&session_state, &pool, "caixa1", "senhaerrada").await;
            assert!(fail_res.is_err());
            assert_eq!(fail_res.unwrap_err(), "Credenciais inválidas.");

            // Confirma que nenhuma sessão foi criada
            let guard = session_state.0.read().await;
            assert!(guard.is_none());

            // Tentativa com usuário inexistente
            let fail_user = authenticate_user(&session_state, &pool, "fantasma", "qualquer").await;
            assert!(fail_user.is_err());
            assert_eq!(fail_user.unwrap_err(), "Credenciais inválidas.");
            let guard2 = session_state.0.read().await;
            assert!(guard2.is_none());
        });
    }

    #[test]
    fn test_operator_switch_replaces_session_and_permissions_atomically() {
        tauri::async_runtime::block_on(async {
            let pool = create_mock_auth_db().await;
            let session_state = SessionState::new();

            let admin_hash = hash_credential_argon2("admin123").unwrap();
            let op_hash = hash_credential_argon2("operador123").unwrap();

            sqlx::query(
                "INSERT INTO users (id, username, name, password_hash, role, is_active, created_at, updated_at)
                 VALUES 
                 ('u-admin', 'admin', 'Administrador', ?, 'CLIENT_ADMIN', 1, '2026-01-01', '2026-01-01'),
                 ('u-op', 'operador', 'Operador Caixa', ?, 'OPERATOR', 1, '2026-01-01', '2026-01-01')"
            )
            .bind(&admin_hash)
            .bind(&op_hash)
            .execute(&pool)
            .await
            .unwrap();

            // 1. ADMIN faz login
            authenticate_user(&session_state, &pool, "admin", "admin123").await.unwrap();
            assert!(require_permission(&session_state, &pool, "users.manage").await.is_ok());
            assert!(require_permission(&session_state, &pool, "backup.create").await.is_ok());

            // 2. Troca de operador para OPERATOR
            let op_sess = authenticate_user(&session_state, &pool, "operador", "operador123").await.unwrap();
            assert_eq!(op_sess.role, "OPERATOR");
            assert_eq!(op_sess.username, "operador");

            // Permissões privilegiadas são imediatamente revogadas
            let admin_perm = require_permission(&session_state, &pool, "users.manage").await;
            assert!(admin_perm.is_err());
            assert!(admin_perm.unwrap_err().contains("Acesso negado: a role 'OPERATOR'"));

            let backup_perm = require_permission(&session_state, &pool, "backup.create").await;
            assert!(backup_perm.is_err());

            // Permissão de operador continua válida
            assert!(require_permission(&session_state, &pool, "sale.create").await.is_ok());

            // 3. Tentativa de elevação para CLIENT_ADMIN com senha incorreta FALHA e NÃO eleva permissões
            let false_elevation = authenticate_user(&session_state, &pool, "admin", "senha-falsa").await;
            assert!(false_elevation.is_err());

            // A sessão anterior não foi adulterada para admin
            let current_guard = session_state.0.read().await;
            assert_eq!(current_guard.as_ref().unwrap().username, "operador");
            drop(current_guard);

            // 4. Logout limpa a sessão e chamadas sensíveis falham
            clear_session(&session_state).await;
            let no_sess_err = require_permission(&session_state, &pool, "sale.create").await;
            assert!(no_sess_err.is_err());
            assert!(no_sess_err.unwrap_err().contains("Não autenticado"));
        });
    }
}
