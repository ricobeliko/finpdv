# Estado Atual do Projeto (`CURRENT_STATUS.md`)

> **Arquivo de Retomada:** Este documento deve ser lido no início de cada nova conversa para que o agente conheça o estado real do working tree e as prioridades imediatas.

---

## 1. Dados do Repositório
* **Versão do Projeto:** `0.1.16`
* **Último Commit:** `ff829ab — feat(products): adicionar cadastro rapido e robusto por codigo de barras`
* **Working Tree:** `MODIFICADO E VALIDADO` (Pronto para commit)

---

## 2. Ciclo Concluído: Remoção do Backup por E-mail (Resend) & Correção de Tipagem

**Status:** `CONCLUÍDO (100% APROVADO)`

* [x] **Remoção de Código Nativo Rust:** Removido o comando `send_resend_email` e a constante `EMBEDDED_RESEND_KEY` em `src-tauri/src/lib.rs`.
* [x] **Remoção do GitHub Actions:** Removida a injeção da secret `RESEND_API_KEY` em `.github/workflows/release.yml`.
* [x] **Remoção do Serviço Frontend:** Deletado `src/core/backup/emailBackupService.ts` e pasta vazia.
* [x] **Remoção de UI & Store:** Removidos o card visual de envio de e-mail, estado `isSendingEmail`, handler `handleSendBackupEmail`, ação `sendBackupEmail` e propriedade `backupEmail`.
* [x] **Preservação Integral do Backup Local:** Exportação de dump SQLite físico (`exportFullDatabaseDumpDb`), histórico de snapshots, download de `.json` e importação/restauração (`restoreBackup`) permanecem 100% funcionais.
* [x] **Correção do Updater:** Corrigida a renderização de progresso de download (`downloadProgressPercent`) baseada em `downloadedBytes` e `totalBytes` de `UpdateStatus`.
* [x] **Validação TypeScript:** `npx tsc --noEmit` passa com **0 erros** no projeto inteiro.

---

## 3. Validação Técnica Atual

| Validação | Resultado | Observação |
|---|---|---|
| **TypeScript (`npx tsc --noEmit`)** | `PASS` | **0 erros** no projeto inteiro. |
| **Vite Production Build (`npm run build`)** | `PASS` | Build concluído com sucesso em 6.39s (`dist/`). |
| **Rust Backend Check (`cargo check`)** | `PASS` | Compilação do binário Tauri 2 concluída com sucesso em 3.38s. |
| **Rust Clippy (`cargo clippy`)** | `PASS` | 0 erros (apenas warnings legados de C-strings no winspooler). |

---

## 4. Próxima Etapa Planejada

Reavaliar arquitetura e integridade dos fluxos de venda, caixa e estoque antes de adicionar novas funcionalidades.
