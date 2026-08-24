# Padrão de Validação e Testes

## 1. Comandos de Validação Obrigatórios

Antes de considerar qualquer implementação ou correção concluída no workspace, execute as etapas cabíveis:

### 1.1 Verificação de Tipos TypeScript (Frontend)
```bash
npx tsc --noEmit
```

### 1.2 Build de Produção do Frontend (Vite)
```bash
npm run build
```

### 1.3 Verificação de Compilação do Backend (Rust / Tauri)
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

### 1.4 Análise Estática de Código Rust (Clippy)
```bash
cargo clippy --manifest-path src-tauri/Cargo.toml
```

### 1.5 Execução do App Desktop em Modo Desenvolvimento (Quando Relevante)
```bash
npm run tauri dev
```

---

## 2. Padrão de Registro de Resultados

Relatórios de validação devem sempre utilizar a tabela padronizada com as classificações:
* `PASS`: Teste executado com sucesso e evidência demonstrada.
* `FAIL`: Ocorreu falha ou quebra com mensagem de erro explícita.
* `WARNING`: Comando passou com avisos que merecem atenção.
* `NOT RUN`: Não executado (justificar obrigatoriamente o motivo).

### Exemplo de Formatação Obrigatória:

| Validação | Resultado | Evidência / Observação |
|---|---|---|
| TypeScript (`tsc --noEmit`) | `PASS` | 0 erros encontrados nos módulos alterados. |
| Vite Build (`npm run build`) | `PASS` | Build concluído com sucesso em 11s (`dist/`). |
| Rust Check (`cargo check`) | `PASS` | Binário compilou com sucesso sem erros. |
| Rust Clippy (`cargo clippy`) | `WARNING` | 8 avisos de strings C em FFI de impressão Windows. |
| Tauri Dev (`npm run tauri dev`) | `NOT RUN` | Validação estática executada em ambiente de console. |

> **Regra:** Nunca registre apenas *"Tudo funcionando"*. Apresente evidências concretas dos comandos e cenários verificados.
