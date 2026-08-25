# Registro de Decisões Arquiteturais (ADR)

---

## DEC-001 — Aplicação Desktop Offline-First

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
O sistema deve operar 100% offline para todas as rotinas críticas de PDV, controle de estoque, abertura/fechamento de caixa e cadastro.

### Motivo:
Comércios de bairro sofrem com instabilidade ou falta de internet. A operação de caixa não pode ser interrompida por problemas de rede externa.

---

## DEC-002 — SQLite como Fonte Única da Verdade Persistente

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
Todos os dados persistentes residem no SQLite local (WAL mode). Estados do React e Zustand são camadas de visualização e cache efêmero.

### Motivo:
Garantir atomicidade (ACID), integridade referencial por foreign keys e independência de servidores externos.

---

## DEC-003 — Operação em Perfil Único (Administrador)

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
A aplicação operará focada em um único operador principal (`Administrador`). Desenvolvimento de RBAC complexo, troca de operadores por PIN e multiusuário está congelado/fora de escopo.

### Motivo:
Simplicidade operacional e foco nas necessidades reais do cliente no estágio atual de implantação.

---

## DEC-004 — Remoção do Backup por E-mail (Resend)

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
A integração de backup automatizado por e-mail via API Resend foi completamente removida do código funcional (Rust, TypeScript, Store, UI e GitHub Actions). O sistema mantém 100% das rotinas de backup físico, exportação e restauração local do SQLite.

### Motivo:
Eliminar dependência de provedores de e-mail de terceiros, evitar exposição de chaves de API no cliente e priorizar backups físicos e locais em pendrive/storage seguro.

---

## DEC-005 — Open Food Facts como Recurso Exclusivamente Auxiliar

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
A consulta de código de barras na internet via Open Food Facts atua apenas como sugestão de conveniência. Falha de rede, timeout (2s) ou erro da API nunca bloqueiam nem atrasam o cadastro manual de produtos.

### Motivo:
Preservar o fluxo ágil e offline do operador no balcão ao cadastrar produtos novos.

---

## DEC-006 — Arquitetura Modular Leve sem Camadas Acadêmicas

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
Manter arquitetura baseada em módulos funcionais, hooks pontuais e Zustand com persistência direta. Não adotar Clean Architecture com injeção pesada de dependências ou dezenas de interfaces desnecessárias.

### Motivo:
Manter a base de código compreensível, de rápida manutenção e com baixo custo cognitivo para o agente e para os desenvolvedores.

---

## DEC-007 — Mudanças Pequenas, Testáveis e Revisáveis

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
Toda evolução do sistema deve ser feita por etapas atômicas: investigar → diagnosticar → implementar o mínimo → validar com testes/compilação → revisar diff.

### Motivo:
Prevenir regressões em funcionalidades existentes de caixa e estoque e garantir controle seguro de versões.

---

## DEC-008 — Persistência Relacional de Pagamentos (sale_payments), IDs Robustos e Transações Nativas Rust

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
1. Pagamentos de vendas passam a ser persistidos de forma estruturada e relacional na tabela `sale_payments`, com chave estrangeira para `sales(id)`. A coluna `sales.payment_method` é preservada temporariamente como dado de compatibilidade legada.
2. `sale_payments.amount_cents` representa o valor líquido aplicado à venda (troco é deduzido estritamente dos pagamentos em dinheiro, garantindo que a soma dos pagamentos coincida exatamente com o total líquido da venda).
3. Vendas históricas legadas não recebem criação sintética de registros em `sale_payments`, preservando a integridade dos fatos comprovados.
4. Transações financeiras críticas de persistência de venda (`sales + sale_items + sale_payments`) deixam de usar `BEGIN/COMMIT` desacoplados via JavaScript e passam a ser executadas através do comando Tauri Rust `save_sale_transaction`, utilizando conexão única adquirida do pool com `PRAGMA foreign_keys = ON` e `sqlx::Transaction` nativa.
5. Identificadores de venda (`saleId`) adotam formato alfanumérico robusto baseado em timestamp e entropia (`CUPOM-<TIMESTAMP>-<ENTROPIA>`), com chave primária propagada de forma coerente para `customerStore` e `CashPage`.

### Motivo:
Garantir atomicidade física real (ACID), rastreabilidade contábil estrita de recebimentos mistos, proteção contra perda/sobrescrita de cupons e conformidade de integridade referencial no SQLite.

---

## DEC-009 — Soft Cancel e Reversão Transacional Atômica de Vendas (cancel_sale_transaction)

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
1. O cancelamento de vendas concluídas abandona completamente o hard `DELETE FROM sales` e `DELETE FROM sale_items`. Cancelar passa a significar marcar `sales.status = 'CANCELLED'` e registrar o timestamp `sales.cancelled_at`.
2. A venda original, seus itens e seus pagamentos em `sale_payments` permanecem 100% preservados para auditoria fiscal e contábil.
3. Todas as reversões financeiras e físicas são executadas dentro de uma única transação atômica nativa Rust (`cancel_sale_transaction`), sob uma única conexão física com `PRAGMA foreign_keys = ON`:
   - Validação estrita de status prévio `COMPLETED` (protegendo contra duplo cancelamento).
   - Devolução autoritativa de estoque em `products` com inserção de `inventory_movements` (tipo `REFUND`).
   - Reversão física de gaveta no caixa atual apenas para o valor líquido recebido em dinheiro (`CASH`). Pagamentos eletrônicos (PIX/Cartão) não alteram saldo físico da gaveta.
   - Recomputação autoritativa das estatísticas do cliente (`total_spent_cents`, `purchases_count`, `last_purchase_date`) a partir das vendas restantes no estado `COMPLETED`.
   - Vendas históricas legadas sem detalhamento em `sale_payments` possuem cancelamento automático bloqueado para evitar inferências financeiras falsas.
4. Consultas e métricas de faturamento passam a filtrar estritamente `WHERE status = 'COMPLETED'` (ou `status != 'CANCELLED'`), garantindo que vendas canceladas não inflem os relatórios financeiros.

### Motivo:
Eliminar perda irreversível de histórico financeiro, prevenir inconsistências parciais de estoque e caixa durante falhas no cancelamento e manter conformidade contábil estrita.

---

## DEC-010 — Varejo Diversos / Open Price como Item Virtual Não Estocável

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
1. O atalho de Preço Livre (`1 + ENTER` / `Varejo Diversos`) opera com o identificador canônico `prod-open-price-1` (`OPEN_PRICE_PRODUCT_ID`).
2. O item é definido canonicamente como um item virtual de venda não estocável:
   - Não precisa existir nem ser criado via seed na tabela `products` do SQLite.
   - Não gera baixa de estoque nem movimentação em `inventory_movements` na finalização de vendas.
   - Não gera devolução de estoque nem movimentação em `inventory_movements` no cancelamento de vendas.
   - É persistido normalmente em `sale_items` e `sale_payments`, preservando o histórico contábil e auditoria fiscal de cupons.
   - Movimenta caixa e faturamento normalmente com as regras transacionais financeiras.
3. A exceção transacional no Rust é estritamente vinculada à constante de domínio `OPEN_PRICE_PRODUCT_ID` (`prod-open-price-1`). Todos os demais produtos exigem existência física prévia em `products` com validação de `rows_affected == 1`, garantindo que produtos comuns inexistentes abortem com rollback total.
4. Métricas financeiras e agregações de faturamento em relatórios adotam allowlist explícito `status === 'COMPLETED'`.

### Motivo:
Alinhar a transação ao modelo de domínio real de mercadorias sem SKU físico individual, evitando a fabricação de estoques e movimentações sintéticas desnecessárias sem enfraquecer a integridade relacional dos produtos normais.

---

## DEC-011 — Backup Pré-Migration Automático e Idempotente no Bootstrap Rust

**Status:** Ativa  
**Data:** 2026-08-24  

### Decisão:
1. Toda inicialização da aplicação executa, no hook `setup` do Tauri Rust (antes da inicialização do WebView e da abertura do SQLite pelo frontend), a rotina de segurança `create_pre_migration_backup_in_dir`.
2. Se `mercado.db` existir no diretório de dados do app e o arquivo versionado `mercado-pre-migration-v<VERSAO>.db` ainda não existir, o sistema cria automaticamente um snapshot consistente usando a instrução atômica do SQLite `VACUUM INTO '<TARGET>'`.
3. O uso de `VACUUM INTO` garante compatibilidade nativa com WAL/SHM, desfragmentação de páginas e integridade física completa do arquivo de backup (`PRAGMA integrity_check = ok`).
4. A operação é 100% idempotente por versão: execuções subsequentes na mesma versão não duplicam nem sobrescrevem o arquivo de backup existente.
5. Em novas instalações limpas (onde `mercado.db` ainda não existe), a rotina não executa nenhuma ação.

### Motivo:
Garantir que atualizações de versão e execuções de migration pelo cliente possuam uma cópia de segurança física recuperável e íntegra de seu banco de dados anterior, protegendo contra perda acidental de dados sem sobrecarregar o armazenamento local.

---

## DEC-012 — Canal de Distribuição e Atualização via Tauri Updater Oficial

**Status:** Ativa  
**Data:** 2026-08-25  

### Decisão:
1. Atualizações de versão para clientes existentes devem utilizar prioritariamente o **Tauri Updater** oficial distribuído via GitHub Actions (`release.yml`), assinado com Minisign e indexado pelo manifesto `latest.json`.
2. O identificador da aplicação (`com.merceariauber.pos`) e o caminho do banco de dados SQLite (`%APPDATA%\com.merceariauber.pos\mercado.db`) devem permanecer rigorosamente estáveis em todas as releases para garantir a preservação automática do banco dos clientes.
3. O instalador NSIS opera em modo `currentUser` (`per-user`), instalando binários em `%LOCALAPPDATA%\Mercearia Uber` e mantendo isolamento completo por usuário do Windows.
4. Antes de aplicar qualquer migração do frontend, a aplicação garante a integridade dos dados históricos através do backup pré-migration automático (`DEC-011`).

### Motivo:
Garantir um ciclo de entrega contínua sem atrito para o operador no ponto de venda, prevenindo corrupção de dados e eliminando a necessidade de procedimentos manuais de migração ou reinstalações limpas.
