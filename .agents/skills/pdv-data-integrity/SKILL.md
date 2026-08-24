---
name: pdv-data-integrity
description: >-
  Diretrizes e verificações obrigatórias de integridade para alterações que envolvam vendas, estoque, caixa, produtos, pagamentos ou persistência SQLite no mercado-pos.
---

# PDV Data Integrity Skill

Utilize esta skill sempre que for criar, modificar ou auditar rotinas financeiras, contábeis, de catálogo ou de estoque.

## Regras Fundamentais de Integridade

1. **SQLite é a Única Fonte da Verdade:** O estado em memória do frontend (Zustand/React) não é confiável após falha de banco. O dado só existe se foi gravado no SQLite.
2. **Propagação de Falhas:** Nunca use `try/catch` para apenas dar `console.error` em erros de persistência. A falha deve ser repassada para a interface para alertar o operador e reverter qualquer estado otimista.
3. **Sem Duplicidade Silenciosa:** Evite `INSERT OR IGNORE` em tabelas críticas se isso ocultar um erro de negócio (ex: cadastrar dois produtos com o mesmo código de barras ou código interno).
4. **Valores Monetários em Centavos:** Manipule preços, totais, trocos e sangrias estritamente como números inteiros (`cents: integer`).
5. **Atomicidade em Operações Compostas:** Vendas no caixa envolvem registrar a venda, os itens, baixar o estoque e lançar no caixa. Se qualquer etapa falhar, toda a operação deve falhar.
6. **Operação Parcialmente Salva é Falha:** Não deixe estados inconsistentes (ex: venda registrada sem movimentação de caixa correspondente).
7. **Integridade > UX:** Nunca sacrifique a consistência contábil ou fiscal para tornar a interface mais rápida ou simples.
