---
name: finpdv-sqlite-integrity
description: >-
  Diretrizes de persistência, tolerância a falhas, pragmas SQLite, health checks de inicialização e rotinas seguras de backup e restore no FinPDV.
---

# FinPDV SQLite Integrity & Resilience Standards

Utilize esta skill sempre que alterar conexões com o SQLite, inicialização de tabelas (`db_bootstrap.rs`), migrações, validação de integridade física ou fluxos de export/restore de banco de dados.

---

## 1. Pragmas Mandatórios de Conexão
Toda conexão com `finpdv.db` deve obrigatoriamente configurar:
* **`PRAGMA journal_mode = WAL;`** — Garante alta concorrência entre leituras concorrentes e escritas atômicas seriais.
* **`PRAGMA busy_timeout = 5000;`** — Evita erros imediatos de `SQLITE_BUSY` sob concorrência transitória de I/O.
* **`PRAGMA synchronous = FULL;`** — Assegura que o commit transacional seja descarregado nos platôs magnéticos/memória flash do disco rígido antes de liberar a aplicação.
* **`PRAGMA foreign_keys = ON;`** — Bloqueia em tempo de execução qualquer tentativa de inserção ou deleção que viole chaves estrangeiras.

## 2. Startup Health Check
* **Verificação Pré-Operação:** No setup do Rust (`init_sqlite_pool`), antes de liberar a inicialização do app, são executados:
  - `PRAGMA quick_check;` (validação rápida de ponteiros de páginas B-tree sem lentidão perceptível);
  - `PRAGMA foreign_key_check;` (validação de integridade referencial de tabelas).
* **Bloqueio em Caso de Corrupção:** Se o retorno for diferente de `ok` ou houver violações de integridade, o FinPDV entra em modo de segurança e bloqueia a abertura normal de vendas para proteger as contas do cliente.

## 3. Backups com Identidade Empresarial (Formato 2.0)
* **Metadados Obrigatórios:** Todo dump exportado contém:
  - `backupFormatVersion: "2.0"`
  - `origin: { installationId, businessId, businessCnpj, businessTradeName }`
  - `createdAt: ISO-8601`
  - `data: { ... }`
* **Sem Secrets:** Senhas planas e tokens de suporte nunca são incluídos no backup. Apenas hashes irreversíveis Argon2id são exportados.

## 4. Restore Atômico com Rollback Seguro
* **Anti-Restore de Empresa Divergente:** O restore valida se o CNPJ de origem confere com o da instalação atual. Bloqueia tentativas de importar bases de outros clientes (`WRONG_BUSINESS_CNPJ`).
* **Suporte a Disaster Recovery:** Em um computador limpo recém-instalado (sem dados da empresa ainda), a importação é autorizada.
* **Validação Pré-Commit:** A aplicação do backup ocorre dentro de transação atômica. Antes de efetivar o commit, são rodados `foreign_key_check` e `quick_check`. Havendo qualquer falha, o rollback é acionado e a base anterior permanece íntegra.
