# FinPDV — Roadmap e Próximos Passos Comerciais

## 1. Fases Concluídas com Sucesso
- [x] **Fase 0 — Auditoria e Baseline:** Inventário completo de identificadores legados e criação da baseline Git.
- [x] **Fase 1 — Isolamento de Repositório:** Configuração do novo repositório `ricobeliko/finpdv` com remote antigo congelado (`DISABLED`).
- [x] **Fase 2 — Rebranding e Isolamento de Produto:**
  - Migração de identificadores Tauri para `com.finpdv.app` e `FinPDV`.
  - Migração da crate Rust para `finpdv` e `finpdv_lib`.
  - Migração do banco para `finpdv.db` e snapshots `finpdv-pre-migration-vX.db`.
  - Desativação segura do updater legado sem fallback.
- [x] **Fase 3 — Cliente Configurável e Estrutura Comercial:**
  - Implementação de `BusinessProfile`, `Store`, `Terminal` e `InstallationInfo`.
  - Assistente de Primeiro Uso (*Onboarding Wizard*) para parametrização sem recompilação.
- [x] **Fase 4 — Autenticação e RBAC sem Backdoors:**
  - Hashing forte com Argon2id nativo em Rust.
  - Eliminação de qualquer senha ou PIN fixo de fábrica (como "1234").
  - Criação obrigatória de credenciais pelo administrador da empresa no primeiro uso.
- [x] **Fase 5 — Manutenção e Suporte Efêmero:**
  - Painel de Manutenção com `PRAGMA integrity_check`, estatísticas e logs de auditoria.
  - Desafio e tokens temporários para o modo suporte.
- [x] **Fase 6 — Gate de Segurança, Autenticação Blindada e Chave Exclusiva do Updater:**
  - Par exclusivo de chaves do FinPDV gerado via `tauri signer generate`.
  - Chave pública configurada em `tauri.conf.json`.
  - Chave privada protegida fora do versionamento e do repositório Git.
  - RBAC imperativo na camada de domínio/banco de dados (`checkPermissionOrThrow`).
  - Troca de operador protegida por validação obrigatória de senha/PIN via Argon2id.
  - Suíte automatizada com 47 testes unitários (12 de segurança/RBAC/anti-replay) 100% verdes.

---

## 2. Próximas Fases Planejadas

### Fase 7 — Suporte Criptográfico com Assinatura Ed25519
- Desenvolver ferramenta externa de engenharia fora da aplicação para assinatura de autorizações de suporte.
- Incorporar a chave pública Ed25519 no binário do FinPDV.
- Implementar verificação de tokens assinados com challenge, installation_id e timestamp para desbloqueio do papel `FINPDV_SUPPORT` (atualmente `NOT_PRODUCTION_READY`).

### Fase 8 — Módulo de Sincronização em Segundo Plano (Opcional / Futuro)
- Para clientes com múltiplos caixas em uma mesma rede local (LAN), implementar replicação ponto-a-ponto ou via servidor de loja local sem exigir conexão obrigatória com a internet.
