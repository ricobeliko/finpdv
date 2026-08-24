---
name: test-before-finish
description: >-
  Procedimento padrão para validar alterações, executar checagens de build/tipagem e gerar relatório técnico antes de finalizar tarefas no mercado-pos.
---

# Test Before Finish Skill

Utilize esta skill antes de declarar qualquer tarefa, correção ou funcionalidade como concluída.

## Checklist de Finalização

1. **Validação de Tipos:**
   ```bash
   npx tsc --noEmit
   ```
2. **Build do Frontend:**
   ```bash
   npm run build
   ```
3. **Verificação do Backend Nativo (Rust):**
   ```bash
   cargo check --manifest-path src-tauri/Cargo.toml
   ```
4. **Clippy (se houver alteração em Rust):**
   ```bash
   cargo clippy --manifest-path src-tauri/Cargo.toml
   ```
5. **Revisão de Warnings:** Não ignore avisos de compilação ou linter.
6. **Revisão do Diff:**
   ```bash
   git diff
   ```
   Verifique se foram alteradas apenas linhas pertinentes ao escopo.
7. **Atualização da Documentação:** Atualize [CURRENT_STATUS.md](../../../docs/CURRENT_STATUS.md) com o novo estado.
8. **Relatório Padronizado:** Apresente a tabela com `PASS / FAIL / WARNING / NOT RUN` e evidências.
