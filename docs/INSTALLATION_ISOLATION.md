# FinPDV — Isolamento Total da Instalação (Gate de Coexistência)

## 1. Premissa Obrigatória
O **FinPDV** foi construído para conviver na mesma máquina com a aplicação legada (`Mercearia Uber` / `mercado-pos`) sem qualquer interferência, compartilhamento de diretórios, conflito de banco de dados ou colisão de processos.

---

## 2. Matriz Comparativa de Isolamento (OLD APP vs NEW APP)

| Dimensão | Aplicação Legada (`mercado-pos`) | Nova Linha Comercial (`FinPDV`) |
|---|---|---|
| **Nome do Produto** | `Mercearia Uber` | `FinPDV` |
| **Package Name (`package.json`)** | `mercearia-uber` | `finpdv` |
| **Tauri Identifier** | `com.merceariauber.pos` | `com.finpdv.app` |
| **Tauri Product Name** | `Mercearia Uber` | `FinPDV` |
| **Crate Rust (`Cargo.toml`)** | `mercado-pos` / `mercado_pos_lib` | `finpdv` / `finpdv_lib` |
| **Diretório AppData (Windows)** | `%APPDATA%\com.merceariauber.pos` | `%APPDATA%\com.finpdv.app` |
| **Arquivo de Banco SQLite** | `mercado.db` | `finpdv.db` |
| **Snapshot de Pré-Migração** | `mercado-pre-migration-vX.db` | `finpdv-pre-migration-vX.db` |
| **Chaves de Cache (`localStorage`)** | `mercado_pos_*` | `finpdv_*` |
| **Endpoint do Updater** | `ricobeliko/mercado-pos/releases/...` | **DESABILITADO** (Sem fallback legado) |
| **Título da Janela Nativa** | `Mercearia Uber` | `FinPDV` |
| **Executável Gerado** | `Mercearia Uber.exe` | `FinPDV.exe` |
| **Git Remote de Escrita** | `ricobeliko/mercado-pos.git` | `ricobeliko/finpdv.git` |

---

## 3. Garantias de Não Interferência
1. **Zero Colisão de Dados:** O plugin `@tauri-apps/plugin-sql` abre o banco de dados relativo ao identificador do aplicativo. Como o identificador do FinPDV é `com.finpdv.app`, o SQLite é gravado exclusivamente na pasta `%APPDATA%\com.finpdv.app\finpdv.db`. O aplicativo legado (`com.merceariauber.pos\mercado.db`) permanece intacto e inacessível pelo FinPDV.
2. **Zero Poluição de Registro do Windows:** As chaves de desinstalação e atalhos no menu Iniciar apontam para GUIDs e nomes distintos.
3. **Zero Atualizações Cruzadas:** O updater do FinPDV não aponta para o repositório antigo. Qualquer verificação de atualização do FinPDV procurará apenas releases do repositório `ricobeliko/finpdv` quando as chaves dedicadas forem provisionadas.
