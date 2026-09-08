---
name: finpdv-pos-integrity
description: >-
  Diretrizes e verificações obrigatórias de integridade para vendas, itens, pagamentos, estoque, caixa, cancelamentos e reimpressões no FinPDV.
---

# FinPDV POS & Financial Integrity Standards

Utilize esta skill sempre que modificar fluxos de frente de caixa, carrinho, pagamentos, regras de desconto, cálculo de totais, cancelamento ou reimpressão de comprovantes no FinPDV.

---

## 1. Integridade Monetária em Centavos
* **Valores Inteiros (`cents`):** Valores monetários transitam exclusivamente como inteiros em centavos (`i64` no Rust, `cents: number` no TypeScript).
* **Arredondamento e Frações:** Multiplicações de preço por quantidade fracionária (ex: pesáveis em kg) devem arredondar de forma determinística (`Math.round(...)` ou `.round()` no Rust).
* **Proibição de Float em Cálculos de Saldo:** Nunca utilize tipos de ponto flutuante para acumular saldo de caixa ou calcular totais de pagamento.

## 2. Transações de Venda Atômicas no Rust
* **Transação Única (`sqlx::Transaction`):** Todas as etapas de uma venda (gravação do cupom, itens, pagamentos, baixa de estoque, movimentação em dinheiro e atualização da sessão de caixa) ocorrem dentro de uma única transação global.
* **Validação de Rows Affected:** Cada atualização de produto ou sessão deve verificar `rows_affected() == 1`. Qualquer discrepância aborta imediatamente a venda com rollback integral.
* **Isolamento de Itens Virtuais:** O item virtual `Varejo Diversos` / `prod-open-price-1` não altera o estoque de produtos físicos nem bloqueia a venda por ausência de cadastro prévio.

## 3. Reimpressão Segura de Comprovantes
* **Leitura Exclusiva de Dados Persistidos:** A reimpressão de cupom (`db_reprint_sale_receipt` ou atalho `[F10]`) reconstrói o comprovante unicamente a partir de registros já gravados em `sales`, `sale_items` e `sale_payments`.
* **Zero Efeitos Colaterais:** A reimpressão NUNCA cria nova venda, não altera estoque, não movimenta caixa, não altera timestamps e não modifica totais da venda original.
* **Identificação Visual:** O comprovante reimpresso exibe explicitamente a marcação `REIMPRESSÃO`, preservando o ID original da transação.
* **Auditoria:** Toda reimpressão registra o evento `sale.receipt_reprinted` com usuário, perfil, cupom e timestamp.

## 4. Desacoplamento Pós-Commit
* **Venda Inviolável:** Uma vez comitada a venda no SQLite, eventuais falhas de periféricos (falta de papel na impressora térmica, gaveta travada) JAMAIS devem cancelar a venda nem permitir que o operador re-submeta o mesmo carrinho.
* **Limpeza Imediata:** O carrinho é limpo no momento do commit e a tela de comprovante permite retentativas de impressão sem risco de duplicidade de venda.
