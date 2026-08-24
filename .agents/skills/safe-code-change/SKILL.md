---
name: safe-code-change
description: >-
  Padroniza o fluxo para qualquer alteração de código no projeto mercado-pos, garantindo investigação prévia, menor alteração necessária e proteção do working tree.
---

# Safe Code Change Workflow

Use esta skill sempre que for planejar, implementar ou modificar qualquer arquivo de código no projeto.

## Fluxo Obrigatório

1. **Entender e Mapear:** Leia os arquivos envolvidos e consulte o [CURRENT_STATUS.md](../../../docs/CURRENT_STATUS.md).
2. **Verificar Working Tree:** Confirme que não há alterações pendentes que possam ser sobrescritas acidentalmente.
3. **Investigar Causa Raiz:** Não faça alterações por tentativa e erro. Entenda o fluxo completo antes de editar.
4. **Menor Alteração Segura:** Projete a menor modificação de código possível para atingir o objetivo sem efeitos colaterais.
5. **Implementar com Foco:** Modifique apenas os arquivos estritamente dentro do escopo.
6. **Validar:** Execute as checagens técnicas ([TESTING.md](../../../docs/TESTING.md)).
7. **Revisar Diff:** Execute `git diff` e valide linha a linha o que foi alterado.
8. **Relatar:** Apresente o resumo das mudanças ao usuário e aguarde autorização antes de qualquer commit.

## Restrições Críticas
* Nunca execute comandos destrutivos de Git (`reset`, `clean`, `restore`, `stash`).
* Não altere regras de negócio fora do escopo da solicitação.
* Não adicione novas dependências sem autorização.
