---
name: finpdv-security-gate
description: >-
  Auditoria e diretrizes obrigatórias de segurança para alterações envolvendo CSP, Capabilities, fronteira SQL, IPC, autorização RBAC no backend, confiança de sessão, segredos e concorrência single-instance no FinPDV.
---

# FinPDV Security Gate & Concurrency Standards

Utilize esta skill sempre que alterar arquivos de configuração (`tauri.conf.json`, `capabilities/*.json`), rotas IPC, persistência SQL, autenticação, permissões RBAC ou inicialização de instâncias.

---

## 1. Content Security Policy (CSP)
* **Política Explícita e Restritiva:** O FinPDV não aceita `"csp": null` em `tauri.conf.json`.
* **Sem Curingas Genéricos:** É estritamente proibido o uso de `*`, `https:` ou `http:` genéricos.
* **Origens Estritas:** Libere exclusivamente `default-src 'self'`, fontes/estilos locais ou inline necessários, e origens IPC/asset mínimas (`ipc:`, `asset:`, `data:`, `blob:`). Chamadas a APIs externas (ex: Cosmos) devem ocorrer exclusivamente pelo backend Rust via `reqwest`, mantendo o WebView isolado.

## 2. Capabilities & Menor Privilégio
* **Zero `sql:allow-execute`:** A capability exposta ao WebView (`capabilities/default.json`) JAMAIS deve incluir `sql:allow-execute`.
* **Leituras Restritas:** Apenas leitura (`sql:default`, `sql:allow-load`, `sql:allow-select`) é permitida no frontend para dados operacionais de consulta.
* **Capabilities Mínimas:** Novas permissões no `default.json` exigem justificativa formal de segurança.

## 3. Eliminação de Escritas SQL no Frontend
* **Proibição de Escrita Arbitrária:** O frontend não deve executar comandos DDL/DML (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `PRAGMA`) diretamente via `db.execute()`.
* **Comandos Dedicados:** Todas as mutações de dados (vendas, cancelamentos, suprimentos, sangrias, estoque, usuários, categorias, configurações, backups) devem ocorrer através de Tauri commands dedicados no Rust.
* **Comandos Genéricos Proibidos:** É terminantemente proibido criar comandos utilitários como `execute_sql(query: String)`.

## 4. Autorização RBAC Enforced no Backend (Rust)
* **Fronteira Confiável:** A verificação de permissões em TypeScript (`checkPermissionOrThrow`) serve apenas para ergonomia da UI. A barreira real de segurança deve ser executada no backend Rust via `require_permission(...)`.
* **Invalidação em Tempo Real:** Todo comando sensível revalida no SQLite o status do usuário (`is_active == 1`) e sua `role`. Se um usuário for desativado no banco, sua sessão é invalidada imediatamente.
* **Dados Autoritativos:** Campos sensíveis como `user_id` e `user_name` em vendas e movimentações devem ser extraídos da sessão Rust autenticada, nunca aceitos cegamente do payload JavaScript.

## 5. Sessão e Autenticação Confiável
* **Argon2id Nativo:** Credenciais (senha e PIN) são validadas nativamente em Rust com salting individual de 16 bytes.
* **Estado em Memória do Processo:** O contexto da sessão ativa reside no `SessionState` gerenciado pelo runtime Rust (`RwLock<Option<ActiveUserSession>>`).
* **Ciclo de Vida Limpo:** `auth_logout` limpa imediatamente a sessão. Reinicializações do aplicativo iniciam sem nenhuma sessão privilegiada em memória.

## 6. Single Instance & Concorrência
* **Plugin Oficial Ativo:** `tauri-plugin-single-instance` deve estar ativo e registrado no setup do Rust.
* **Proteção contra Concorrência:** O sistema deve impedir a execução paralela de dois executáveis `FinPDV.exe` no mesmo computador, prevenindo conflitos de lock no SQLite, duplicação de aberturas de caixa, concorrência de migrations e corrupção do WAL.

## 7. Segredos e Credenciais
* **Zero Secrets em Código:** Proibido armazenar GitHub PAT, tokens de API, senhas mestras ou chaves privadas do updater no código-fonte, capabilities ou bundle do instalador.
* **Isolamento de Ambiente:** Todas as operações devem respeitar o isolamento estrito de `%APPDATA%\com.finpdv.app` e `finpdv.db`.
