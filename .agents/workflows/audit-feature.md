# Workflow: /audit-feature

**Objetivo:** Auditar rigorosamente uma funcionalidade ou alteração existente sem modificar arquivos ou regras de negócio.

---

## Passos de Execução:

1. **Leitura de Contexto:**
   * Ler [docs/PROJECT_CONTEXT.md](../../docs/PROJECT_CONTEXT.md) e [docs/CURRENT_STATUS.md](../../docs/CURRENT_STATUS.md).
2. **Inspeção de Estado do Git:**
   * Executar `git status --short`, `git diff --stat` e `git diff`.
3. **Mapeamento de Escopo:**
   * Identificar quais arquivos foram modificados e relacionar com os requisitos esperados.
4. **Análise de Regressões e Falhas:**
   * Verificar concorrência, condições de corrida, quebra de offline, duplicidade e perda de integridade.
5. **Execução de Validações Não-Destrutivas:**
   * Executar `npx tsc --noEmit`, `npm run build` e `cargo check`.
6. **Classificação de Severidade:**
   * Classificar problemas encontrados em P0 (Crítico), P1 (Alto), P2 (Médio) ou P3 (Baixo).
7. **Emissão de Relatório:**
   * Apresentar o relatório no padrão técnico com tabela de funcionalidades e testes.
8. **Parada Obrigatória:**
   * **PARAR** e não aplicar correções até receber instruções explícitas do usuário.
