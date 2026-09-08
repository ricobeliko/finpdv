# FinPDV — Arquitetura de Software e Sistema

## 1. Visão Arquitetural
O **FinPDV** utiliza uma arquitetura híbrida de alto desempenho composta por uma casca nativa em **Rust (Tauri 2)** e uma interface reativa em **TypeScript / React / Vite / Tailwind CSS**.

```
┌─────────────────────────────────────────────────────────┐
│                    FinPDV Desktop                       │
├────────────────────────────┬────────────────────────────┤
│   Camada Frontend (UI/UX)   │   Camada Nativa (Rust)     │
│   • React 18 / Vite        │   • Tauri 2 Core           │
│   • Zustand (Stores)       │   • SQLite Transacional    │
│   • Tailwind CSS           │   • Argon2id Security      │
│   • Impressão ESC/POS      │   • Windows API & Prn Spool│
└─────────────┬──────────────┴─────────────┬──────────────┘
              │                            │
              └──────────────┬─────────────┘
                             ▼
                  SQLite Local (finpdv.db)
                  WAL Mode + ACID Immediate
```

---

## 2. Camadas do Sistema

### 2.1. Backend Nativo Rust (`src-tauri/`)
- **Crate Principal:** `finpdv`
- **Biblioteca Interna:** `finpdv_lib`
- **Módulos Core:**
  - `sale_transaction.rs`: Executa a persistência atômica da venda e baixa de estoque dentro de transação `BEGIN IMMEDIATE`.
  - `sale_cancellation.rs`: Executa o estorno integral de itens vendidos, devolução física para o estoque e estorno financeiro em caixa.
  - `security.rs`: Hashing e validação criptográfica de credenciais utilizando **Argon2id** (Argon2 com parametrização de memória e salt de 16 bytes).
  - `escpos.rs` & `printers.rs`: Comunicação direta com o Spooler do Windows para impressão térmica sem dependência de driver de terceiros.

### 2.2. Camada de Dados (SQLite Local)
- **Arquivo Principal:** `finpdv.db`
- **Snapshots de Migração:** `finpdv-pre-migration-vX.db`
- **Modo de Operação:** `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`
- **Tabelas Principais:**
  - `installation_info`: Estado do terminal e ID persistente da máquina.
  - `business_profile`: Dados legais e cadastrais da empresa cliente.
  - `stores`: Filiais ou pontos de venda.
  - `terminals`: Estações de caixa físicas.
  - `users`: Operadores, supervisores, gerentes e administradores.
  - `audit_logs`: Rastreabilidade de ações críticas.
  - `support_sessions`: Tokens e autorizações temporárias de assistência técnica.
  - `products`, `product_barcodes`, `product_tier_prices`: Cadastro e precificação.
  - `cash_sessions`, `cash_movements`: Sessões financeiras e tesouraria.
  - `sales`, `sale_items`, `sale_payments`: Histórico de cupons emitidos.
  - `inventory_movements`: Kardex de movimentação de estoque.

### 2.3. Frontend (React 18 + Zustand)
- **Stores Principais:**
  - `useFinPdvStore`: Gerencia a inicialização, dados da empresa, loja, terminal ativo e sessão do usuário logado.
  - `usePosStore`: Controla o ciclo de vida do carrinho de compras, cálculo de descontos em centavos, atalhos de teclado e leitor de código de barras.
  - `useCashStore`: Controle de abertura, sangria, reforço e fechamento cego de caixa.
  - `useSettingsStore`: Parametrizações de periféricos, impressora térmica e balança de checkout.
