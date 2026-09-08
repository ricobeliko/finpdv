# FINPDV CORE RULES & GOVERNANCE

Antes de realizar mudanças relevantes, consulte:
- [docs/FINPDV_PRODUCT.md](docs/FINPDV_PRODUCT.md)
- [docs/FINPDV_ARCHITECTURE.md](docs/FINPDV_ARCHITECTURE.md)
- [docs/AUTHORIZATION.md](docs/AUTHORIZATION.md)
- [docs/SUPPORT_MODE.md](docs/SUPPORT_MODE.md)
- [docs/INSTALLATION_ISOLATION.md](docs/INSTALLATION_ISOLATION.md)
- [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md)
- [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)
- [docs/DECISIONS.md](docs/DECISIONS.md)
- [docs/DEVELOPMENT_RULES.md](docs/DEVELOPMENT_RULES.md)
- [docs/TESTING.md](docs/TESTING.md)

---

## Regras Essenciais de Conduta:
1. **Legado Intocado (`LEGACY_TOUCHED: false`):** NUNCA executar push, commit, tag ou alteração no repositório antigo `mercado-pos`. O remote antigo é estritamente somente leitura. O remote de escrita é exclusivamente `ricobeliko/finpdv`.
2. **Isolamento de Runtime:** O FinPDV (`com.finpdv.app`, `%APPDATA%\com.finpdv.app`, `finpdv.db`) deve permanecer 100% isolado de qualquer versão legada do aplicativo no mesmo computador.
3. **Offline-First:** Todas as rotinas de PDV, caixa, suprimento, sangria e estoque devem operar continuamente sem conexão à internet. O SQLite local é a única fonte da verdade operacional.
4. **Integridade Financeira:** Valores monetários sempre em centavos inteiros (`cents`). Transações de venda e cancelamento devem usar a camada transacional nativa em Rust (`sqlx::Transaction`).
5. **Zero Backdoors & Hashing Forte:** Proibido o uso de credenciais padrão, senhas mestras ou bypass de autenticação. Todas as senhas e PINs usam Argon2id nativo com salt individual de 16 bytes.
6. **Validação Obrigatória:** Toda alteração exige execução prévia de `npx tsc --noEmit`, `npm run build`, `cargo check` e `cargo test`, com tabela `PASS/FAIL`.
