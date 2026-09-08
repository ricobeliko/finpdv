# FinPDV — Modelo de Autorização e RBAC

## 1. Princípios de Segurança
O FinPDV adota um modelo de **Controle de Acesso Baseado em Papéis (RBAC)** com dupla camada de proteção:
- **Camada de Apresentação (UI):** Botões e rotas são renderizados dinamicamente de acordo com as permissões do operador ativo.
- **Camada de Domínio / Dados (Backend):** As operações de persistência crítica (`cancelSaleDb`, `insertCashMovementDb`, `saveProductToDb`, `deleteProductDb`, `updateStockDb`, `insertMovementDb`, `restoreFullDatabaseDumpDb`) validam imperativamente as permissões através de `authService.checkPermissionOrThrow`. Tentativas de bypass por console ou injeção direta são abortadas imediatamente com lançamento de exceção e gravação de log de auditoria.

---

## 2. Níveis de Acesso (Roles)

| Papel (Role) | Escopo Operacional |
|---|---|
| `OPERATOR` | Operador de caixa. Registra vendas, consulta produtos e gerencia o próprio turno de caixa. |
| `SUPERVISOR` | Supervisor de loja. Autoriza cancelamentos de cupom, descontos manuais e sangrias de emergência. |
| `MANAGER` | Gerente de loja. Responsável por catálogo de produtos, reajuste de preços, saldo de estoque, compras e relatórios. |
| `CLIENT_ADMIN` | Administrador da empresa cliente. Acesso total às configurações da empresa, filiais, estações, gestão de operadores e backups. |
| `FINPDV_SUPPORT` | Suporte técnico avançado (**`NOT_PRODUCTION_READY`** — Desabilitado para release comercial até implementação de assinatura Ed25519). |

---

## 3. Matriz de Proteção de Domínio (Gate RBAC)

| Operação Sensível | Permissão Requerida | Proteção de UI | Proteção de Domínio / Banco | Status |
|---|---|:---:|:---:|:---:|
| `sale.cancel` | `sale.cancel` | ✅ Modal restrito | ✅ `cancelSaleDb` | **ENFORCED** |
| `sale.discount` | `sale.discount` | ✅ Trava de desconto | ✅ `posStore` | **ENFORCED** |
| `cash.withdraw` | `cash.withdraw` | ✅ Modal sangria | ✅ `insertCashMovementDb` | **ENFORCED** |
| `cash.supply` | `cash.supply` | ✅ Modal reforço | ✅ `insertCashMovementDb` | **ENFORCED** |
| `product.create` | `product.create` | ✅ Botão novo | ✅ `saveProductToDb` | **ENFORCED** |
| `product.edit` | `product.edit` | ✅ Botão editar | ✅ `saveProductToDb` | **ENFORCED** |
| `product.delete` | `product.delete` | ✅ Ação excluir | ✅ `deleteProductDb` | **ENFORCED** |
| `stock.edit` | `stock.edit` | ✅ Ajuste manual | ✅ `updateStockDb` / `insertMovementDb` | **ENFORCED** |
| `users.manage` | `users.manage` | ✅ Aba operadores | ✅ `authService.createUser` / `updateUser` | **ENFORCED** |
| `settings.manage` | `settings.manage` | ✅ Painel config | ✅ `SettingsPage` | **ENFORCED** |
| `maintenance.execute` | `maintenance.execute` | ✅ Botão reparo | ✅ `handleIntegrityCheck` | **ENFORCED** |
| `backup.restore` | `backup.restore` | ✅ Modal restauração | ✅ `restoreFullDatabaseDumpDb` | **ENFORCED** |

---

## 4. Hash e Armazenamento de Credenciais
- **Argon2id:** Todas as senhas e PINs são derivados e validados via Rust nativo com salt criptográfico individual de 16 bytes gerado pelo sistema operacional (`OsRng`).
- **Sem Plaintext:** Nenhum PIN ou senha em texto puro é mantido em memória, `localStorage`, `sessionStorage` ou banco de dados.
- **Proteção contra Brute Force:** Bloqueio progressivo em memória após 5 tentativas consecutivas de senha/PIN inválidos.
