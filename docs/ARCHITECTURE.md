# Arquitetura do Sistema

## 1. Princípio Fundamental: Arquitetura Simples e Leve

> **Regra de Ouro:** Não crie novas camadas, interfaces ou abstrações sem uma necessidade real e imediata. Priorize modularidade, clareza, baixo acoplamento e poucas camadas.

Evitamos Clean Architecture acadêmica, injeção excessiva de dependências e dezenas de interfaces sem uso prático.

---

## 2. Arquitetura Atual Observada

A estrutura atual é organizada por módulos funcionais (`src/modules/*`) e utilitários centrais (`src/core/*`):

```text
src/
├── core/
│   ├── database/        # Inicialização do SQLite (db.ts) e schemas Drizzle (schema.ts)
│   ├── services/        # Serviços globais/externos (ex: barcodeLookupService.ts)
│   ├── hardware/        # Integração de impressão térmica
│   ├── updater/         # Atualizações do app via Tauri
│   └── backup/          # Utilitários de backup do SQLite
├── modules/
│   ├── products/        # Gestão de produtos, categorias e movimentos de estoque
│   ├── pos/             # Frente de caixa (PDV), carrinho e finalização de vendas
│   ├── cash/            # Abertura, suprimento, sangria e fechamento de caixa
│   ├── customers/       # Cadastro de clientes e fiado/contas a receber
│   ├── purchases/       # Entrada de notas e compras de fornecedores
│   ├── reports/         # Relatórios e dashboards gerenciais
│   └── settings/        # Configurações da empresa e periféricos
└── shared/              # Componentes de UI genéricos, layout e tipos compartilhados
```

### Pontos de Atenção Observados no Código Atual
1. **Acesso direto a SQL no `db.ts`:** O arquivo `src/core/database/db.ts` centraliza muitas consultas SQL distintas. No futuro, queries podem ser agrupadas por repositórios modulares quando justificável.
2. **Stores com tratamento de erro engolido:** Algumas chamadas assíncronas no Zustand capturam exceções SQL apenas com `console.error`, mantendo estado otimista inconsistente na UI em caso de falha de persistência.
3. **Lógica de leitor/scanner misturada em componentes:** Lógicas de captura de scanner USB e atalhos de teclado residem diretamente dentro de componentes visuais React, podendo ser encapsuladas em hooks leves quando complexas.

---

## 3. Arquitetura Alvo Leve (Fluxo de Dados)

```text
UI / Componentes (Apresentação, inputs, foco, feedback)
      ↓
Hooks / Serviços Locais (Lógicas de UI reutilizáveis, debounce, scanner)
      ↓
Stores Zustand (Estado compartilhado, coordenação e fluxos de tela)
      ↓
Acesso ao SQLite / Repositórios (SQL parametrizado, transações, constraints)
      ↓
Banco SQLite Local (Fonte única da verdade persistente)
```

---

## 4. Responsabilidades de Cada Camada

### A. Componentes (`src/modules/*/components/` ou `*Page.tsx`)
* **Responsabilidade:** Renderização da interface, captura de eventos do usuário, foco de cursor, validações simples de formulário e feedback visual (loading/toast).
* **O que NÃO colocar:** Consultas SQL diretas, regras financeiras pesadas, lógica extensa de comunicação externa.

### B. Hooks (`src/modules/*/hooks/` ou `src/shared/hooks/`)
* **Responsabilidade:** Lógicas de UI complexas ou reutilizáveis (ex: leitor de código de barras com debounce, captura de atalhos globais, polling/timers controlados).
* **Regra:** Não criar hook para lógicas triviais ou de uso único simples.

### C. Serviços (`src/core/services/` ou `src/modules/*/services/`)
* **Responsabilidade:** Integrações externas e algoritmos isolados (ex: `barcodeLookupService.ts` consultando Open Food Facts, formatação fiscal, cálculos de atacado).
* **Regra:** Devem ser funções puras ou assíncronas isoladas, sem acoplamento com a UI ou React hooks.

### D. Stores Zustand (`src/modules/*/*Store.ts`)
* **Responsabilidade:** Gerenciar estado reativo em memória compartilhado entre componentes e disparar a persistência.
* **Regra Crítica:** **Nunca mascarar falhas de persistência.** Se a operação no SQLite falhar, o store deve propagar o erro ou reverter o estado otimista.

### E. Banco de Dados / SQLite (`src/core/database/`)
* **Responsabilidade:** Executar SQL parametrizado, gerenciar integridade referencial, `FOREIGN KEYS`, índices e transações atômicas.
* **Regra Crítica:** O SQLite é a **fonte da verdade**. Nenhum dado é considerado salvo até ser confirmado pelo banco.

### F. Camada Nativa Tauri / Rust (`src-tauri/`)
* **Responsabilidade:** Operações do sistema operacional que a WebView não realiza com segurança (ex: envio direto de bytes ESC/POS ao spooler de impressão do Windows via `winspool.drv`, controle de janelas nativas, auto-inicialização).

---

## 5. Guia: Onde Colocar Código Novo?

| Tipo de Código | Local Correto |
|---|---|
| Novo modal ou formulário de tela | `src/modules/<modulo>/components/NomeModal.tsx` |
| Atalhos de teclado ou manipulador de leitor USB complexo | `src/modules/<modulo>/hooks/useBarcodeScanner.ts` |
| Integração com API externa ou cálculo isolado | `src/core/services/` ou `src/modules/<modulo>/services/` |
| Estado global de um módulo (ex: carrinho do PDV) | `src/modules/<modulo>/<modulo>Store.ts` |
| Query SQL ou persistência de entidade | `src/core/database/` |
| Componente genérico reutilizável (botão, badge, modal base) | `src/shared/components/` |
| Comando nativo Windows / FFI | `src-tauri/src/` |
