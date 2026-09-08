# FinPDV — Modelo de Autorização e RBAC

## 1. Princípios de Segurança
O FinPDV adota um modelo de **Controle de Acesso Baseado em Papéis (RBAC)** com permissões granulares.
- **Zero Senhas Padrão:** Não existe senha de fábrica, PIN mestre ou credencial hardcoded.
- **Argon2id Nativo:** Toda senha ou PIN passa por função de derivação de chave Argon2id no backend Rust com salt individual de 16 bytes.
- **Zero Backdoors:** Não existe bypass de autenticação por parâmetro ou flag oculta.

---

## 2. Níveis de Acesso (Roles)

| Papel (Role) | Descrição |
|---|---|
| `OPERATOR` | Operador de caixa comum. Pode registrar vendas, consultar produtos e abrir/fechar o próprio turno de caixa. |
| `SUPERVISOR` | Supervisor de loja. Além das ações de operador, pode autorizar cancelamentos, conceder descontos e autorizar sangrias de emergência. |
| `MANAGER` | Gerente de loja. Responsável pela gestão de produtos, preços, estoque, compras, reabertura de turnos e emissão de relatórios gerenciais. |
| `CLIENT_ADMIN` | Administrador da empresa cliente. Acesso total às configurações da empresa, lojas, terminais, cadastro de usuários e backups. |
| `FINPDV_SUPPORT` | Acesso de suporte técnico efêmero. Permite diagnóstico, verificação de integridade SQLite, logs e configurações técnicas avançadas. |

---

## 3. Matriz de Permissões Granulares

```typescript
export type PermissionCode =
  | 'sale.create'        // Registrar vendas
  | 'sale.cancel'        // Cancelar vendas e cupons
  | 'sale.discount'      // Aplicar descontos manuais
  | 'sale.reopen'        // Reabertura de cupom
  | 'cash.open'          // Abertura de turno
  | 'cash.close'         // Fechamento de turno
  | 'cash.withdraw'      // Sangria de caixa
  | 'cash.supply'        // Suprimento de caixa
  | 'product.view'       // Consulta de catálogo
  | 'product.create'     // Cadastro de produtos
  | 'product.edit'       // Alteração de preços/dados
  | 'product.delete'     // Exclusão de itens
  | 'stock.view'         // Consulta de saldo
  | 'stock.edit'         // Ajuste manual de estoque
  | 'reports.view'       // Visualização de relatórios
  | 'users.view'         // Listagem de operadores
  | 'users.manage'       // Criação/edição de usuários
  | 'settings.view'      // Consulta de configurações
  | 'settings.manage'    // Alteração de periféricos/dados
  | 'maintenance.view'   // Acesso ao painel de manutenção
  | 'maintenance.execute'// Execução de integridade/reparo
  | 'backup.create'      // Geração de cópias de segurança
  | 'backup.restore';    // Restauração de banco de dados
```

---

## 4. Auditoria de Ações Críticas
Todas as ações que envolvem autorização especial ou afetam o patrimônio da empresa são registradas na tabela `audit_logs` contendo:
- `user_id` e `user_name`
- `role` do operador
- `action` (ex: `sale.cancel`, `auth.login`, `auth.login_failed`)
- `entity` e `entity_id`
- `details` (em JSON estruturado)
- `created_at` (timestamp ISO)
