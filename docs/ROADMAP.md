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

---

## 2. Próximas Fases Planejadas

### Fase 6 — Geração de Chaves de Assinatura e Ativação do Novo Updater
- Gerar novo par de chaves públicas/privadas exclusivo do FinPDV via `tauri signer generate`.
- Configurar a chave pública em `tauri.conf.json` e a chave privada como secret nos workflows do GitHub Actions (`TAURI_SIGNING_PRIVATE_KEY`).
- Configurar o endpoint definitivo: `https://github.com/ricobeliko/finpdv/releases/latest/download/latest.json`.

### Fase 7 — Suporte Criptográfico com Assinatura Ed25519
- Incorporar a chave pública de suporte no binário do FinPDV.
- Implementar verificação de autorizações remotas assinadas pela equipe de engenharia para desbloqueio de ferramentas de telemetria avançada em campo.

### Fase 8 — Módulo de Sincronização em Segundo Plano (Opcional / Futuro)
- Para clientes com múltiplos caixas em uma mesma rede local (LAN), implementar replicação ponto-a-ponto ou via servidor de loja local sem exigir conexão obrigatória com a internet.
