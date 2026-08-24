---
name: tauri-review
description: >-
  Auditoria e diretrizes para alterações envolvendo Rust, Tauri 2, WebView, permissões, FFI Windows, impressão térmica ou comunicação frontend/backend.
---

# Tauri & Desktop Review Skill

Utilize esta skill sempre que modificar arquivos em `src-tauri/`, `tauri.conf.json`, capabilities, ou ao implementar chamadas nativas de hardware/impressão.

## Diretrizes de Auditoria Tauri

1. **Permissões Mínimas (Capabilities):**
   * Verifique `src-tauri/capabilities/default.json`.
   * Habilite estritamente os comandos e plugins necessários. Não utilize permissões genéricas inseguras.
2. **Segurança de Comunicação:**
   * Nunca exponha chaves secretas ou credenciais em binários ou comandos expostos via `invoke`.
3. **Propagação de Erros Rust ↔ TypeScript:**
   * Comandos Tauri devem retornar `Result<T, String>` com mensagens de erro claras e tratáveis na interface React.
4. **Comportamento Específico Windows:**
   * O spooler de impressão nativo (`winspool.drv` via FFI) deve gerenciar memória adequadamente e tratar impressoras desconectadas sem travar o processo principal.
5. **Independência de Recursos de Navegador Comum:**
   * O frontend roda em WebView2 (Windows). Certifique-se de que a aplicação não dependa de recursos exclusivos de navegadores convencionais que possam falhar no ambiente desktop embutido.
