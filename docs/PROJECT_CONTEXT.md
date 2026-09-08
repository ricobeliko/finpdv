# Contexto do Produto: FinPDV

## 1. Visão Geral
* **Nome da Linha de Produto:** FinPDV (`finpdv`)
* **Repositório:** `ricobeliko/finpdv`
* **Legado:** `ricobeliko/mercado-pos` (produção legada, intocada)
* **Finalidade:** Sistema comercial de Ponto de Venda (PDV), controle de estoque, frente de caixa multi-loja/multi-terminal e retaguarda para estabelecimentos comerciais de varejo.
* **Paradigma:** Desktop **Offline-First**. O comércio opera continuamente com autonomia total sem dependência de internet.
* **Stack Tecnológica:**
  * **Frontend:** React 18/19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Zustand
  * **Backend Desktop:** Tauri 2 (Rust) com Argon2id nativo
  * **Banco de Dados Local:** SQLite 3 (WAL Mode via `@tauri-apps/plugin-sql`), nomeado `finpdv.db`
  * **OS Alvo Principal:** Windows 10 / 11 Desktop

---

## 2. Prioridades do Sistema (Ordem Rígida)
1. **Integridade dos Dados:** Dinheiro, estoque e movimentações fiscais/caixa nunca podem ser corrompidos ou perdidos.
2. **Confiabilidade & Isolamento:** O FinPDV não pode colidir nem interferir com instalações legadas no mesmo host.
3. **Funcionamento Offline:** A internet é opcional e auxiliar. Nenhuma rotina crítica de PDV/Cadastro/Caixa depende de rede externa.
4. **Segurança & RBAC:** Zero backdoors, zero senhas mestras de fábrica, hashing forte com Argon2id.
5. **Velocidade Operacional:** Checkout rápido por teclado e leitor de código de barras.
6. **Facilidade de Uso:** Onboarding Wizard para parametrização comercial no primeiro uso.

---

## 3. Premissas de Negócio e Escopo
* **Modelo Comercial:** Uma base de código única, N clientes, configuração individual persistida no banco SQLite de cada instalação.
* **Hierarquia Organizacional:** Empresa (`BusinessProfile`) -> Loja (`Store`) -> Terminal (`Terminal`).
* **Monetário:** Valores monetários são sempre calculados e persistidos em centavos inteiros (`cents: integer`) no SQLite.

---

## 4. Referências Rápidas
* Produto FinPDV: [FINPDV_PRODUCT.md](docs/FINPDV_PRODUCT.md)
* Arquitetura do FinPDV: [FINPDV_ARCHITECTURE.md](docs/FINPDV_ARCHITECTURE.md)
* Modelo de Autorização e RBAC: [AUTHORIZATION.md](docs/AUTHORIZATION.md)
* Modo Suporte: [SUPPORT_MODE.md](docs/SUPPORT_MODE.md)
* Isolamento de Instalação: [INSTALLATION_ISOLATION.md](docs/INSTALLATION_ISOLATION.md)
* Estado Atual: [CURRENT_STATUS.md](docs/CURRENT_STATUS.md)
* Registro de Decisões: [DECISIONS.md](docs/DECISIONS.md)
