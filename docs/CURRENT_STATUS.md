# Estado Atual do Projeto (`CURRENT_STATUS.md`)

> **Arquivo de Retomada:** Este documento deve ser lido no início de cada nova conversa para que o agente conheça o estado real do working tree e as prioridades imediatas.

---

## 1. Dados do Repositório
* **Versão do Projeto:** `0.1.16`
* **Último Commit:** `4a7e629 — ci: adicionar validacao automatica do projeto`
* **Working Tree:** `MODIFICADO E VALIDADO`
* **CI Remoto (GitHub Actions):** `PASS (100% VERDE)`

---

## 2. CI GitHub Actions: Ativo e Validado

* **Workflow:** `.github/workflows/ci.yml` (disparado em push/PR na branch `main` e `workflow_dispatch`).
* **Runner:** `windows-latest`
* **Baseline de Validação:**
  * `npm ci` — `PASS`
  * `npx tsc --noEmit` — `PASS (0 erros)`
  * `npm run build` — `PASS`
  * `cargo check --manifest-path src-tauri/Cargo.toml` — `PASS`
  * `cargo clippy --manifest-path src-tauri/Cargo.toml` — `PASS`

---

## 3. Resumo da Auditoria dos Fluxos Críticos (P0 / P1)

A auditoria arquitetural em modo somente leitura mapeou riscos importantes na finalização de vendas:

* **P0 — Ausência de Transação SQLite Única:** Venda, itens, estoque, movimentações e caixa ocorrem em queries desacopladas sem bloco atômico unificado.
* **P0 — Risco de Duplicação em Retry:** Se a inserção da venda falhar após a baixa de estoque e crédito do caixa, nova tentativa pelo operador duplica as movimentações.
* **P0 — Erros de Estoque Silenciados:** `deductStockFromSale` captura exceções com `console.error` sem relançar, permitindo concluir venda sem atualizar estoque no SQLite.
* **P1 — Descarte de Métodos em Pagamentos Divididos:** Tabela `sales` armazena apenas uma string `payment_method` (primeiro método); valores e formas secundárias são descartados.
* **P1 — Colisão de ID de Venda:** Geração de `saleId` aleatório de 6 dígitos pode sobrescrever vendas antigas devido a `ON CONFLICT(id) DO UPDATE`.
* **P1 — Estorno com Hard DELETE:** Cancelamento apaga registros de `sales` e não cobre vendas eletrônicas nem estorna dados do cliente.

---

## 4. Gate 1 — Evolução Segura do Schema Financeiro & Transação Nativa Rust: VALIDADO

* [x] **Tabela Relacional `sale_payments`:** Criada com FK para `sales(id) ON DELETE CASCADE` e índice em `sale_id`.
* [x] **Preparação para Soft Cancel:** Adicionadas colunas `status` (DEFAULT 'COMPLETED') e `cancelled_at` na tabela `sales`.
* [x] **Nova Estratégia de ID de Venda:** Geração de `saleId` robusto (`CUPOM-<TIMESTAMP>-<ENTROPIA>`) com `crypto.randomUUID()`. ID propagado para `customerStore` e reconhecido na `CashPage`. Inserção via `INSERT` limpo sem `ON CONFLICT DO UPDATE`.
* [x] **Transação Nativa Rust (`save_sale_transaction`):** Persistência de `sales`, `sale_items` e `sale_payments` executada em conexão única adquirida do pool com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` nativa com rollback automático em caso de erro.
* [x] **Semântica Líquida de Pagamentos:** `sale_payments.amount_cents` armazena o valor líquido aplicado à venda (troco em dinheiro deduzido), assegurando que `SUM(amount_cents) == sales.total_cents`.
* [x] **Integridade do Histórico Legado:** Remoção do backfill sintético para manter integridade dos dados históricos comprovados.
* [x] **Compatibilidade de Backup:** Estrutura `salePayments` integrada em `exportFullDatabaseDumpDb` e `restoreFullDatabaseDumpDb` com suporte retrocompatível a backups legados.
* [x] **Validações Técnicas:** `npx tsc --noEmit` PASS (0 erros), `npm run build` PASS, `cargo check` PASS, `cargo clippy` PASS, `cargo test` PASS (3 unit tests), validação em runtime SQLite PASS.
* [!] **Dívida Técnica Conhecida:** Foreign Keys são garantidas rigorosamente na conexão transacional Rust da venda (`save_sale_transaction`), mas ainda não são garantidas globalmente em todas as conexões abertas genericamente via JavaScript no `@tauri-apps/plugin-sql`.



---

## 5. Gate 2 — Transação Global da Finalização da Venda: VALIDADO LOCALMENTE — AGUARDANDO CI REMOTO

* [x] **Transação Atômica Unificada:** Uma única conexão física com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` em `src-tauri/src/sale_transaction.rs` persistindo atomicamente `sales`, `sale_items`, `sale_payments`, baixa de estoque autoritativa em `products`, `inventory_movements`, `cash_movements`, atualização de saldo em `cash_sessions` e estatísticas em `customers`.
* [x] **Validação Estrita de `rows_affected`:** Mutações em `products`, `cash_sessions` e `customers` exigem `rows_affected == 1`, abortando com rollback imediato caso qualquer update afete zero linhas.
* [x] **Rollback Global Comprovado:** Falhas determinísticas entre `UPDATE products` e `INSERT inventory_movements`, e entre `INSERT cash_movements` e `UPDATE cash_sessions`, revertem 100% das mutações anteriores físicas do banco.
* [x] **Separação Rígida Fase 1 (Persistência) e Fase 2 (Pós-Commit):** Falhas em reload de stores ou hardware pós-commit não desfazem a venda gravada nem mantêm o carrinho para reenvio perigoso.
* [x] **Lock Síncrono no PDV:** Trava síncrona `isCompletingSaleRef` em `PosPage.tsx` previne disparos concorrentes por duplo clique ou Enter repetido.
* [x] **Testes Unitários Rust:** 12 testes unitários nativos comprovando invariantes críticas (sucesso completo, rollback por PK duplicada, produto inexistente, sessão fechada, cliente inexistente, rollback pós-stock-update, rollback pós-cash-movement-insert, execução sem lost updates, venda 100% eletrônica, produtos fracionados, tentativa de ID duplicado e foreign keys).


---

## 6. Próxima Etapa Planejada (Gate 3)

**Gate 3 — Reformulação do Cancelamento e Estorno Atômico:**
1. Substituição do hard DELETE em `sales` por soft cancel (`status = 'CANCELLED'`).
2. Reversão atômica unificada de estoque (`returnStockFromRefund`), estorno de caixa (`cash_movements` + `cash_sessions`) e dedução de estatísticas do cliente na mesma transação Rust.


