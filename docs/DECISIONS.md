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
