# MERCADO-POS CORE RULE

Antes de realizar mudanças relevantes, consulte:
- [docs/PROJECT_CONTEXT.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/PROJECT_CONTEXT.md)
- [docs/CURRENT_STATUS.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/CURRENT_STATUS.md)

Quando houver decisão arquitetural ou de design:
- [docs/ARCHITECTURE.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/ARCHITECTURE.md)
- [docs/DECISIONS.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/DECISIONS.md)

Para implementação e validação:
- [docs/DEVELOPMENT_RULES.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/DEVELOPMENT_RULES.md)
- [docs/TESTING.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/TESTING.md)

---

## Regras Essenciais de Conduta:
1. **Working Tree Local:** O working tree local é a fonte da verdade. Nunca descarte, reverta ou sobrescreva alterações locais sem autorização.
2. **Git Seguro:** PROIBIDO executar `git reset`, `git clean`, `git restore`, `git commit` ou `git push` sem autorização explícita do usuário.
3. **Investigar Antes de Alterar:** Entenda o fluxo e diagnostique a causa raiz antes de modificar código. Faça sempre a menor alteração necessária.
4. **Offline-First:** Todas as rotinas de PDV, caixa e estoque devem funcionar sem internet. O SQLite local é a única fonte da verdade.
5. **Integridade de Dados:** Valores monetários sempre em centavos inteiros (`cents`). Nunca silencie erros do SQLite com `INSERT OR IGNORE` sem validação.
6. **Validação Obrigatória:** Execute checagens (`npx tsc --noEmit`, `npm run build`, `cargo check`) e reporte com a tabela `PASS/FAIL/WARNING/NOT RUN`.
