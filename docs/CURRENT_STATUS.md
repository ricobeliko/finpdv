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

## 5. Gate 2 — Transação Global da Finalização da Venda: FECHADO
* **Status:** VALIDADO LOCALMENTE & VALIDADO NO GITHUB ACTIONS (Run ID: `32798320087`, Commit: `f7714c3`)
* [x] **Transação Atômica Unificada:** Uma única conexão física com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` em `src-tauri/src/sale_transaction.rs` persistindo atomicamente `sales`, `sale_items`, `sale_payments`, baixa de estoque autoritativa em `products`, `inventory_movements`, `cash_movements`, atualização de saldo em `cash_sessions` e estatísticas em `customers`.
* [x] **Validação Estrita de `rows_affected`:** Mutações em `products`, `cash_sessions` e `customers` exigem `rows_affected == 1`, abortando com rollback imediato caso qualquer update afete zero linhas.
* [x] **Rollback Global Comprovado:** Falhas determinísticas entre `UPDATE products` e `INSERT inventory_movements`, e entre `INSERT cash_movements` e `UPDATE cash_sessions`, revertem 100% das mutações anteriores físicas do banco.
* [x] **Separação Rígida Fase 1 (Persistência) e Fase 2 (Pós-Commit):** Falhas em reload de stores ou hardware pós-commit não desfazem a venda gravada nem mantêm o carrinho para reenvio perigoso.
* [x] **Lock Síncrono no PDV:** Trava síncrona `isCompletingSaleRef` em `PosPage.tsx` previne disparos concorrentes por duplo clique ou Enter repetido.
* [x] **Testes Unitários Rust:** 12 testes unitários nativos comprovando invariantes críticas (sucesso completo, rollback por PK duplicada, produto inexistente, sessão fechada, cliente inexistente, rollback pós-stock-update, rollback pós-cash-movement-insert, execução sem lost updates, venda 100% eletrônica, produtos fracionados, tentativa de ID duplicado e foreign keys).
* [!] **Dívidas Técnicas Mantidas Fora Deste Gate:**
  1. Cancelamento e estorno ainda utilizam hard DELETE legado (escopo do Gate 3).
  2. Coluna `sales.payment_method` permanece como compatibility field para relatórios antigos.
  3. Foreign Keys não são garantidas globalmente em conexões JS genéricas do `@tauri-apps/plugin-sql` (porém rigorosamente ativas e testadas na conexão nativa Rust).
  4. Warnings legados do winspooler mantidos.



---

## 6. Gate 3 — Cancelamento / Estorno Atômico & Open Price: FECHADO
* **Status:** VALIDADO LOCALMENTE & VALIDADO NO GITHUB ACTIONS (Run ID: `32801812665`, Commit: `66f2717`)
* [x] **Soft Cancel Total (CANCELAR != APAGAR):** Remoção total de queries `DELETE FROM sales` e `DELETE FROM sale_items` do cancelamento normal. Vendas canceladas recebem `status = 'CANCELLED'` e `cancelled_at = <timestamp>`, preservando registros originais em `sales`, `sale_items` e `sale_payments` para auditoria.


* [x] **Transação Atômica Rust (`cancel_sale_transaction`):** Executada em conexão física única com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` em `src-tauri/src/sale_cancellation.rs`.
* [x] **Reversão Autoritativa de Estoque:** Devolução de estoque em `products` com validação `rows_affected == 1` e inserção de `inventory_movements` (tipo `REFUND`).
* [x] **Reversão Estrita de Caixa:** Estorno financeiro físico no caixa atual ocorre apenas sobre a soma de pagamentos `CASH`. Pagamentos 100% eletrônicos (PIX/Cartão) não afetam o saldo físico da gaveta.
* [x] **Recomputação de Estatísticas do Cliente:** Estatísticas (`total_spent_cents`, `purchases_count`, `last_purchase_date`) são recomputadas autoritativamente a partir das vendas restantes no estado `COMPLETED`.
* [x] **Proteção contra Duplo Cancelamento:** Validação estrita de status prévio `COMPLETED` no backend e trava síncrona `isRefundingRef` / `isCancellingSaleRef` no frontend bloqueiam execuções repetidas.
* [x] **Segurança com Vendas Legadas:** Vendas históricas sem detalhamento estruturado em `sale_payments` têm cancelamento automático bloqueado com mensagem explícita, sem inferência arbitrária de números.
* [x] **Item Especial de Preço Livre / Varejo Diversos (`prod-open-price-1`):** Definido canonicamente como item virtual não estocável (`OPEN_PRICE_PRODUCT_ID`). Permite venda e cancelamento de cupom com atalho `1 + ENTER` sem exigir registro físico na tabela `products` e sem fabricar movimentações/estoques fictícios, mantendo a validação estrita inalterada para todos os produtos normais.
* [x] **Alinhamento Estrito em Relatórios:** Métricas financeiras e faturamento filtram estritamente por allowlist `status === 'COMPLETED'`.
* [x] **Testes Unitários Rust:** 33 testes unitários nativos (12 do Gate 2, 13 do Gate 3 inicial e 8 novos testes para venda e estorno de open-price e itens mistos) passando com 100% de sucesso.
* [!] **Dívidas Técnicas Mantidas Fora Deste Gate:**
  1. Coluna `sales.payment_method` permanece como compatibility field para relatórios antigos.
  2. Foreign Keys não são garantidas globalmente em conexões JS genéricas do `@tauri-apps/plugin-sql` (porém rigorosamente ativas e testadas na conexão nativa Rust).
  3. Warnings legados do winspooler mantidos.


---

## 7. Gate 4 — Consolidação Final, Upgrade Seguro e Backup Pré-Migration: VALIDADO
* **Status:** VALIDADO LOCALMENTE — AGUARDANDO CI REMOTO
* [x] **Preservação Total de Dados Existentes (Zero Data Loss):** Comprovada a preservação de 100% dos dados em migração de banco legado real (categorias, produtos, códigos de barras, preços de atacado, clientes, histórico de vendas, itens, sessões e movimentações de caixa/estoque intactos).
* [x] **Zero Backfill Sintético:** Vendas legadas permanecem sem registros fabricados em `sale_payments` e com `status = 'COMPLETED'` e `cancelled_at = NULL`.
* [x] **Backup Pré-Migration Automático e Idempotente no Rust:** Snapshot consistente de `mercado.db` via `VACUUM INTO` gerado no bootstrap do Tauri antes da execução de migrations do frontend, idempotente por versão (`mercado-pre-migration-v<VERSAO>.db`).
* [x] **Restauração de Backup Novo e Legado:** Rotina `restoreFullDatabaseDumpDb` validada para restauração de dumps completos estruturados e dumps legados cobrindo 100% das 14 tabelas sem criação de pagamentos fictícios.
* [x] **Auditoria de `sales.payment_method` e Relatórios:** Coluna preservada como compatibility/display field para vendas legadas, enquanto vendas novas usam a estrutura normalizada de pagamentos e relatórios filtram por allowlist `status === 'COMPLETED'`.
* [x] **Auditoria de Foreign Keys JS:** Classificação A confirmada — transações financeiras críticas protegidas por `sqlx::Transaction` com FKs ativas e snapshots históricos de itens isolados de deleções de catálogo.
* [x] **Testes Unitários Rust:** 35 testes unitários nativos (33 anteriores + 2 novos testes de backup pré-migration e idempotência) passando com 100% de sucesso.
* [!] **Dívidas Técnicas Mantidas Fora Deste Gate:**
  1. Coluna `sales.payment_method` permanece como compatibility field para relatórios e cupons legados.
  2. Warnings legados do winspooler mantidos.

---

## 8. Próxima Etapa Planejada (Release)

**Release ainda NÃO autorizada.**

**Pendências obrigatórias pré-release:**
- Teste isolado de instalação antiga → nova.
- Teste real do updater.
- Somente depois desses testes: bump de versão, tag e publicação de release.





