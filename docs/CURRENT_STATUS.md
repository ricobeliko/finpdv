# Estado Atual do Projeto (`CURRENT_STATUS.md`)

> **Arquivo de Retomada:** Este documento deve ser lido no início de cada nova conversa para que o agente conheça o estado real do working tree e as prioridades imediatas.

---

## 1. Dados do Repositório
* **Produto:** `FinPDV`
* **Novo Repositório:** `ricobeliko/finpdv` (Remote `origin`)
* **Repositório Legado:** `ricobeliko/mercado-pos` (Remote `legacy` -> `DISABLED` / Somente Leitura)
* **Status do Legado:** `LEGACY_TOUCHED: false` (Zero alterações em produção legada)
* **Versão do Projeto:** `1.0.0`
* **Release Homologada:** `v1.0.0 (Primeira Versão Comercial Estável)`
* **Working Tree:** `HOMOLOGADO E ISOLADO COMO FINPDV`
* **CI Remoto (GitHub Actions):** `PASS (100% VERDE)`

---

## 2. Baseline de Validação
* `npm ci` — `PASS`
* `npx tsc --noEmit` — `PASS (0 erros)`
* `npm run build` — `PASS (Bundle de produção OK)`
* `cargo check --manifest-path src-tauri/Cargo.toml` — `PASS`
* `cargo test --manifest-path src-tauri/Cargo.toml` — `PASS (47/47 testes: 35 transações + 12 segurança/RBAC/Argon2id/anti-replay)`
* `Chave Pública FinPDV Updater` — `CONFIGURADA (tauri.conf.json)`
* `Isolamento AppData / SQLite` — `PASS (com.finpdv.app / finpdv.db)`

---

## 3. Resumo da Auditoria dos Fluxos Críticos (P0 / P1)

A auditoria arquitetural em modo somente leitura mapeou riscos importantes na finalização de vendas, todos devidamente mitigados e resolvidos nos Gates 1 a 5:

* **P0 — Ausência de Transação SQLite Única:** Resolvido no Gate 2 via `save_sale_transaction` unificada em conexão única com `sqlx::Transaction`.
* **P0 — Risco de Duplicação em Retry:** Resolvido no Gate 2 com travas síncronas no frontend e validações transacionais no backend.
* **P0 — Erros de Estoque Silenciados:** Resolvido no Gate 2 com validação estrita de `rows_affected == 1` e rollback automático.
* **P1 — Descarte de Métodos em Pagamentos Divididos:** Resolvido no Gate 1 com a tabela relacional `sale_payments`.
* **P1 — Colisão de ID de Venda:** Resolvido no Gate 1 com IDs alfanuméricos com entropia baseados em timestamp (`CUPOM-<TIMESTAMP>-<ENTROPIA>`).
* **P1 — Estorno com Hard DELETE:** Resolvido no Gate 3 com Soft Cancel total (`status = 'CANCELLED'`), preservação de histórico e estorno atômico em `cancel_sale_transaction`.

---

## 4. Gate 1 — Evolução Segura do Schema Financeiro & Transação Nativa Rust: FECHADO

* [x] **Tabela Relacional `sale_payments`:** Criada com FK para `sales(id) ON DELETE CASCADE` e índice em `sale_id`.
* [x] **Preparação para Soft Cancel:** Adicionadas colunas `status` (DEFAULT 'COMPLETED') e `cancelled_at` na tabela `sales`.
* [x] **Nova Estratégia de ID de Venda:** Geração de `saleId` robusto (`CUPOM-<TIMESTAMP>-<ENTROPIA>`) com `crypto.randomUUID()`. ID propagado para `customerStore` e reconhecido na `CashPage`. Inserção via `INSERT` limpo sem `ON CONFLICT DO UPDATE`.
* [x] **Transação Nativa Rust (`save_sale_transaction`):** Persistência de `sales`, `sale_items` e `sale_payments` executada em conexão única adquirida do pool com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` nativa com rollback automático em caso de erro.
* [x] **Semântica Líquida de Pagamentos:** `sale_payments.amount_cents` armazena o valor líquido aplicado à venda (troco em dinheiro deduzido), assegurando que `SUM(amount_cents) == sales.total_cents`.
* [x] **Integridade do Histórico Legado:** Remoção do backfill sintético para manter integridade dos dados históricos comprovados.
* [x] **Compatibilidade de Backup:** Estrutura `salePayments` integrada em `exportFullDatabaseDumpDb` e `restoreFullDatabaseDumpDb` com suporte retrocompatível a backups legados.
* [x] **Validações Técnicas:** `npx tsc --noEmit` PASS (0 erros), `npm run build` PASS, `cargo check` PASS, `cargo clippy` PASS, `cargo test` PASS (3 unit tests), validação em runtime SQLite PASS.

---

## 5. Gate 2 — Transação Global da Finalização da Venda: FECHADO
* **Status:** FECHADO — VALIDADO LOCALMENTE & NO GITHUB ACTIONS (Run ID: `32798320087`, Commit: `f7714c3`)
* [x] **Transação Atômica Unificada:** Uma única conexão física com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` em `src-tauri/src/sale_transaction.rs` persistindo atomicamente `sales`, `sale_items`, `sale_payments`, baixa de estoque autoritativa em `products`, `inventory_movements`, `cash_movements`, atualização de saldo em `cash_sessions` e estatísticas em `customers`.
* [x] **Validação Estrita de `rows_affected`:** Mutações em `products`, `cash_sessions` e `customers` exigem `rows_affected == 1`, abortando com rollback imediato caso qualquer update afete zero linhas.
* [x] **Rollback Global Comprovado:** Falhas determinísticas entre `UPDATE products` e `INSERT inventory_movements`, e entre `INSERT cash_movements` e `UPDATE cash_sessions`, revertem 100% das mutações anteriores físicas do banco.
* [x] **Separação Rígida Fase 1 (Persistência) e Fase 2 (Pós-Commit):** Falhas em reload de stores ou hardware pós-commit não desfazem a venda gravada nem mantêm o carrinho para reenvio perigoso.
* [x] **Lock Síncrono no PDV:** Trava síncrona `isCompletingSaleRef` em `PosPage.tsx` previne disparos concorrentes por duplo clique ou Enter repetido.
* [x] **Testes Unitários Rust:** 12 testes unitários nativos comprovando invariantes críticas.

---

## 6. Gate 3 — Cancelamento / Estorno Atômico & Open Price: FECHADO
* **Status:** FECHADO — VALIDADO LOCALMENTE & NO GITHUB ACTIONS (Run ID: `32801812665`, Commit: `66f2717`)
* [x] **Soft Cancel Total (CANCELAR != APAGAR):** Remoção total de queries `DELETE FROM sales` e `DELETE FROM sale_items` do cancelamento normal. Vendas canceladas recebem `status = 'CANCELLED'` e `cancelled_at = <timestamp>`, preservando registros originais em `sales`, `sale_items` e `sale_payments` para auditoria.
* [x] **Transação Atômica Rust (`cancel_sale_transaction`):** Executada em conexão física única com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` em `src-tauri/src/sale_cancellation.rs`.
* [x] **Reversão Autoritativa de Estoque:** Devolução de estoque em `products` com validação `rows_affected == 1` e inserção de `inventory_movements` (tipo `REFUND`).
* [x] **Reversão Estrita de Caixa:** Estorno financeiro físico no caixa atual ocorre apenas sobre a soma de pagamentos `CASH`. Pagamentos 100% eletrônicos (PIX/Cartão) não afetam o saldo físico da gaveta.
* [x] **Recomputação de Estatísticas do Cliente:** Estatísticas (`total_spent_cents`, `purchases_count`, `last_purchase_date`) são recomputadas autoritativamente a partir das vendas restantes no estado `COMPLETED`.
* [x] **Proteção contra Duplo Cancelamento:** Validação estrita de status prévio `COMPLETED` no backend e trava síncrona no frontend bloqueiam execuções repetidas.
* [x] **Segurança com Vendas Legadas:** Vendas históricas sem detalhamento em `sale_payments` têm cancelamento automático bloqueado com mensagem explícita, sem inferência arbitrária de números.
* [x] **Item Especial de Preço Livre / Varejo Diversos (`prod-open-price-1`):** Definido canonicamente como item virtual não estocável (`OPEN_PRICE_PRODUCT_ID`). Permite venda e cancelamento de cupom com atalho `1 + ENTER` sem exigir registro físico na tabela `products` e sem fabricar movimentações/estoques fictícios.
* [x] **Alinhamento Estrito em Relatórios:** Métricas financeiras e faturamento filtram estritamente por allowlist `status === 'COMPLETED'`.
* [x] **Testes Unitários Rust:** 33 testes unitários nativos passando com 100% de sucesso.

---

## 7. Gate 4 — Consolidação Final, Upgrade Seguro e Backup Pré-Migration: FECHADO
* **Status:** FECHADO — VALIDADO LOCALMENTE E NO GITHUB ACTIONS (Run ID: `32803130539`, Commit: `e3420f8`)
* [x] **Preservação Total de Dados Existentes (Zero Data Loss):** Comprovada a preservação de 100% dos dados em migração de banco legado real (categorias, produtos, códigos de barras, preços de atacado, clientes, histórico de vendas, itens, sessões e movimentações de caixa/estoque intactos).
* [x] **Zero Backfill Sintético:** Vendas legadas permanecem sem registros fabricados em `sale_payments` e com `status = 'COMPLETED'` e `cancelled_at = NULL`.
* [x] **Backup Pré-Migration Automático e Idempotente no Rust:** Snapshot consistente de `mercado.db` via `VACUUM INTO` gerado no bootstrap do Tauri antes da execução de migrations do frontend, idempotente por versão (`mercado-pre-migration-v<VERSAO>.db`).
* [x] **Restauração de Backup Novo e Legado:** Rotina `restoreFullDatabaseDumpDb` validada para restauração de dumps completos estruturados e dumps legados cobrindo 100% das 14 tabelas sem criação de pagamentos fictícios.
* [x] **Testes Unitários Rust:** 35 testes unitários nativos (33 anteriores + 2 novos testes de backup pré-migration e idempotência) passando com 100% de sucesso.

---

## 8. Gate 5 — Validação de Upgrade e Release: FECHADO
* **Status:** FECHADO — HOMOLOGADO E PRONTO PARA DISTRIBUIÇÃO
* **Release Homologada:** `v0.2.0`
* **Commit da Release:** `3677247`
* **CI Pré-Release:** Run ID `32806021920` (PASS — 100% verde)
* **Release Workflow (GitHub Actions):** Run ID `32806559817` (PASS — Tag `v0.2.0`)
* **Artefatos Oficiais Publicados:**
  * `Mercearia.Uber_0.2.0_x64-setup.exe` (6.692.825 bytes)
  * `Mercearia.Uber_0.2.0_x64-setup.exe.sig` (428 bytes)
  * `latest.json` (1.357 bytes)
* **Validações Concluídas com Sucesso:**
  * [x] **Upgrade manual (`0.1.16 → 0.2.0`):** PASS (instalador NSIS executado por cima em ambiente isolado `currentUser`, mantendo `%APPDATA%\com.merceariauber.pos\mercado.db`).
  * [x] **Tauri Updater end-to-end (`0.1.16 → 0.2.0`):** PASS (detecção automática de versão, download do GitHub Releases, validação de assinatura Minisign, instalação e reinício automático).
  * [x] **Preservação Total do Banco:** PASS (clientes, produtos, estoques, histórico de vendas e movimentações de caixa 100% preservados).
  * [x] **Backup Pré-Migration:** PASS (geração automática de `mercado-pre-migration-v0.2.0.db` via `VACUUM INTO` com `PRAGMA integrity_check = ok`).
  * [x] **Open Price no PDV:** PASS (atalho `1 + ENTER` / Varejo Diversos funcional e virtual).
  * [x] **Transações e Cancelamento:** PASS (vendas novas e cancelamentos atômicos auditados).
  * [x] **Idempotência e Reinício:** PASS (múltiplos reinícios sem duplicidade de backups ou reexecução destrutiva de migrações).
* **Diretrizes para Clientes Existentes:**
  * A migração de `v0.1.16` para `v0.2.0` foi 100% homologada com preservação integral de dados.
  * O canal oficial e recomendado para atualização de clientes existentes é o **Tauri Updater** integrado na aplicação.
  * Nenhuma reinstalação limpa ou intervenção manual no banco de dados é necessária.
* **Release Pronta para Distribuição ao Cliente:** **SIM**

---

## 9. Gate 6 — Release v0.2.1 (Bluesoft Cosmos, Categorias Automáticas e ESC): FECHADO
* **Status:** FECHADO — HOMOLOGADO E PUBLICADO
* **Release Homologada:** `v0.2.1`
* **Commit da Release:** `d70d16c`
* **CI Pré-Release:** Run ID `32816831892` (PASS — 100% verde)
* **Release Workflow (GitHub Actions):** Run ID `32817402850` (PASS — Tag `v0.2.1`)
* **Artefatos Oficiais Publicados:**
  * `Mercearia.Uber_0.2.1_x64-setup.exe` (6.864.998 bytes)
  * `Mercearia.Uber_0.2.1_x64-setup.exe.sig` (428 bytes)
  * `latest.json` (1.357 bytes)
* **Entregas da Release v0.2.1:**
  * [x] **Correção da Classificação Automática de Categorias:** Sistema de matching hierárquico priorizando Padaria, Frios/Laticínios, Bebidas, Limpeza/Higiene, Hortifrúti e Mercearia, eliminando falsos positivos de `Bebidas` em pães (ex: Panco 500g) e laticínios (ex: Iogurte Corpus).
  * [x] **Suporte à Tecla ESC no Modal de Produtos:** Fechamento ergonômico por ESC em criação e edição, com proteção ativa contra fechamento durante o salvamento.
  * [x] **Integração Bluesoft Cosmos (Prioridade 1):** Consulta por GTIN/EAN com extração de descrição, marca, NCM e GPC, elevando a taxa de identificação para 100% na amostra de mercado.
  * [x] **Fallback Transparente Open Food Facts & Manual:** Fallback automático gratuito para o Open Food Facts em caso de produtos ausentes, timeouts, erros de rede ou rate-limiting (429), com suporte final desimpedido a cadastro manual.
  * [x] **Execução Nativa no Rust (`lookup_cosmos_gtin`):** Chamada HTTP nativa via `reqwest` com `rustls-tls` no backend Tauri, eliminando restrições de `User-Agent` e bloqueios de CORS do WebView.
  * [x] **Configurações Locais Seguras:** Persistência de token e User-Agent restrita ao `localStorage` (isolada de SQLite, logs e backups relacionais).
  * [x] **Preservação de Dados e Backup Pré-Migration:** Snapshot consistente `mercado-pre-migration-v0.2.1.db` gerado no bootstrap antes de migrations, preservando 100% do histórico e dados relacionais.
* **Status Final:** **RELEASE v0.2.1 PUBLICADA E HOMOLOGADA**

---

## 10. Gate 7 — Release v0.2.2 (Notas de Versão Dinâmicas no Updater): FECHADO
* **Status:** FECHADO — HOMOLOGADO E PUBLICADO
* **Release Homologada:** `v0.2.2`
* **Commit da Release:** `3e23947`
* **CI Pré-Release:** Run ID `32819635194` (PASS — 100% verde)
* **Release Workflow (GitHub Actions):** Run ID `32820220960` (PASS — Tag `v0.2.2`)
* **Artefatos Oficiais Publicados:**
  * `Mercearia.Uber_0.2.2_x64-setup.exe` (6.864.998 bytes)
  * `Mercearia.Uber_0.2.2_x64-setup.exe.sig` (428 bytes)
  * `latest.json` (1.468 bytes com notas dinâmicas estruturadas)
* **Entregas da Release v0.2.2:**
  * [x] **Notas de Atualização Dinâmicas no Pipeline:** Step `Extract Release Notes` em `.github/workflows/release.yml` extrai automaticamente os tópicos reais de `RELEASE_NOTES.md` correspondentes à tag em publicação para o campo `"notes"` do `latest.json`.
  * [x] **Parser Unificado de Release Notes:** Helper `parseReleaseHighlights` em `src/core/updater/updaterService.ts` com suporte a markdown, bullet points e catálogo de novidades por versão.
  * [x] **Assistente de Atualização Flutuante:** `AutoUpdateNotification.tsx` exibe os itens reais de melhorias da versão que está sendo baixada e instalada.
  * [x] **Painel de Configurações:** `SettingsPage.tsx` reflete dinamicamente a lista de novidades da versão disponível sem textos legados fixos.
* **Status Final:** **RELEASE v0.2.2 PUBLICADA E HOMOLOGADA**

---

## 11. FinPDV v1.0.0 — Primeira Versão Comercial Estável: HOMOLOGAÇÃO
* **Status:** HOMOLOGAÇÃO PRÉ-RELEASE CONCLUÍDA
* **Versão Comercial:** `1.0.0`
* **Governança de Atualização:**
  * `AUTO_UPDATER_ENABLED = false`
  * `UPDATER_PROVIDER = 'DISABLED'`
  * `endpoints = []` (em `tauri.conf.json`)
  * Repositório `ricobeliko/finpdv` é privado; proibida exposição de credenciais/tokens no cliente.
  * Distribuição inicial da v1.0.0 via instalador manual homologado (`FinPDV_1.0.0_x64-setup.exe`).
  * Chave pública Minisign preservada para futuras integrações de CDN/API dedicada.
  * Análise de arquitetura de update documentada em `docs/UPDATE_DISTRIBUTION.md`.
* **Segurança e Suporte:**
  * `FINPDV_SUPPORT = NOT_PRODUCTION_READY` (Inacessível em produção).
  * `LEGACY_TOUCHED = false` (Zero pushes/commits para `ricobeliko/mercado-pos`).
  * `DO_NOT_TAG = true` / `DO_NOT_RELEASE = true` (Trava de release respeitada).


