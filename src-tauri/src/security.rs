use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use std::collections::HashSet;

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
                | "product.view"
                | "cash.open"
                | "cash.close"
                | "cash.withdraw"
                | "cash.supply"
                | "stock.view"
        ),
        "OPERATOR" => matches!(
            permission,
            "sale.create" | "product.view" | "cash.open" | "cash.close"
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

#[cfg(test)]
mod tests {
    use super::*;

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
    fn test_operator_users_manage_fail() {
        assert!(!check_role_permission("OPERATOR", "users.manage"));
    }

    #[test]
    fn test_operator_maintenance_execute_fail() {
        assert!(!check_role_permission("OPERATOR", "maintenance.execute"));
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
    fn test_expired_support_session_fail() {
        let mut validator = SupportSessionValidator::new();
        let expires_at = 1000;
        let current_time = 1050; // expirado
        let res = validator.validate_and_consume(
            "sess-1",
            "FP-SUP-ABC123",
            "FP-SUP-ABC123",
            expires_at,
            current_time,
            false,
        );
        assert_eq!(res, Err("Sessão de suporte expirada."));
    }

    #[test]
    fn test_revoked_support_session_fail() {
        let mut validator = SupportSessionValidator::new();
        let expires_at = 2000;
        let current_time = 1000;
        let res = validator.validate_and_consume(
            "sess-2",
            "FP-SUP-ABC123",
            "FP-SUP-ABC123",
            expires_at,
            current_time,
            true, // revogado
        );
        assert_eq!(res, Err("Sessão de suporte revogada pelo administrador."));
    }

    #[test]
    fn test_invalid_challenge_fail() {
        let mut validator = SupportSessionValidator::new();
        let expires_at = 2000;
        let current_time = 1000;
        let res = validator.validate_and_consume(
            "sess-3",
            "FP-SUP-WRONG",
            "FP-SUP-ABC123",
            expires_at,
            current_time,
            false,
        );
        assert_eq!(res, Err("Challenge de suporte inválido."));
    }

    #[test]
    fn test_replay_attack_prevention_fail() {
        let mut validator = SupportSessionValidator::new();
        let expires_at = 2000;
        let current_time = 1000;

        // Primeira utilização: sucesso
        let res1 = validator.validate_and_consume(
            "sess-replay-1",
            "FP-SUP-ABC123",
            "FP-SUP-ABC123",
            expires_at,
            current_time,
            false,
        );
        assert!(res1.is_ok());

        // Segunda tentativa com mesmo session_id: falha por replay
        let res2 = validator.validate_and_consume(
            "sess-replay-1",
            "FP-SUP-ABC123",
            "FP-SUP-ABC123",
            expires_at,
            current_time,
            false,
        );
        assert_eq!(
            res2,
            Err("Tentativa de replay detectada: token já utilizado.")
        );
    }
}
