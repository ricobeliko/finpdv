# FinPDV — Sistema Comercial de Ponto de Venda (Desktop)

O **FinPDV** é um sistema de Ponto de Venda (PDV) desktop comercial, moderno, de alta performance e **offline-first**, construído com **Tauri 2 (Rust)**, **React 18**, **TypeScript**, **SQLite** e **Tailwind CSS**.

---

## Principais Recursos
- **100% Offline-First:** Opera com total autonomia sem requerer internet.
- **Isolamento Completo:** Desenvolvido para coexistir com sistemas legados sem conflito de banco, AppData ou portas.
- **Arquitetura Multi-Cliente Configurável:** Modelo Empresa (`BusinessProfile`) ➔ Loja (`Store`) ➔ Terminal (`Terminal`), com assistente de primeiro uso (*Onboarding Wizard*).
- **Segurança & RBAC:** Controle de acesso baseado em papéis (`OPERATOR`, `SUPERVISOR`, `MANAGER`, `CLIENT_ADMIN`, `FINPDV_SUPPORT`), sem senhas de fábrica ou backdoors, com hashing **Argon2id** nativo em Rust.
- **Modo Suporte Técnico:** Acesso efêmero auditado com challenge e expiração para manutenção em campo.
- **Painel de Manutenção:** Verificação física de integridade do SQLite (`PRAGMA integrity_check`), volumetria e histórico de auditoria.
- **Integridade Financeira:** Valores estritamente em centavos inteiros (`cents`), transações ACID imediatas e estorno consistente.
- **Impressão Térmica:** Suporte nativo a ESC/POS via Spooler do Windows.

---

## Arquitetura e Documentação
- [Documento de Produto](docs/FINPDV_PRODUCT.md)
- [Arquitetura do FinPDV](docs/FINPDV_ARCHITECTURE.md)
- [Modelo de Autorização e RBAC](docs/AUTHORIZATION.md)
- [Modo Suporte Técnico](docs/SUPPORT_MODE.md)
- [Isolamento de Instalação](docs/INSTALLATION_ISOLATION.md)
- [Roadmap Comercial](docs/ROADMAP.md)
- [Estado Atual do Projeto](docs/CURRENT_STATUS.md)

---

## Desenvolvimento Local

### Pré-requisitos
- Node.js 18+ / npm
- Rust 1.75+ (Cargo)

### Comandos de Validação
```bash
# Dependências
npm ci

# Checagem de Tipagem TypeScript
npx tsc --noEmit

# Build do Frontend
npm run build

# Validação do Backend Nativo Rust
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```
