# Workflow: /finish-feature

**Objetivo:** Concluir de forma segura uma implementação ou correção autorizada, garantindo testes completos e documentação atualizada.

---

## Passos de Execução:

1. **Verificação do Working Tree:**
   * Garantir que apenas os arquivos necessários foram modificados (`git status --short`).
2. **Revisão Linha a Linha do Diff:**
   * Executar `git diff` e verificar se não há alterações residuais, debits ou logs de debug.
3. **Execução de Validações Obrigatórias:**
   * `npx tsc --noEmit`
   * `npm run build`
   * `cargo check --manifest-path src-tauri/Cargo.toml`
   * `cargo clippy --manifest-path src-tauri/Cargo.toml` (se aplicável)
4. **Relatório de Validação:**
   * Montar a tabela padronizada com `PASS / FAIL / WARNING / NOT RUN`.
5. **Atualização da Documentação:**
   * Atualizar [docs/CURRENT_STATUS.md](../../docs/CURRENT_STATUS.md) com a versão, funcionalidades entregues e pendências resolvidas.
6. **Apresentação do Resumo:**
   * Exibir o relatório de conclusão detalhado ao usuário.
7. **Aguardar Autorização:**
   * **PARAR** e não realizar commit ou push sem a expressa autorização do usuário.
