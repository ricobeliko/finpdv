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

## 4. Próxima Etapa Planejada

**Gate 1 — Evolução Segura do Schema Financeiro:**
1. Criação da tabela relacional `sale_payments` para persistir todas as formas e valores de pagamentos múltiplos.
2. Adição de colunas de controle de status e cancelamento (`status`, `cancelled_at`) na tabela `sales`.
3. Estratégia determinística e segura de geração de ID de venda (UUID / Timestamp + Sequencial).
4. Migrations idempotentes e compatíveis com bancos SQLite existentes.
