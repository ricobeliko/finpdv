# Notas de Lançamento — FinPDV

## v1.0.0 — Primeira Versão Comercial Estável

Esta é a primeira versão comercial estável do **FinPDV**, marcando o lançamento oficial do novo produto como uma solução de Ponto de Venda (PDV) desktop moderna, robusta e de alta performance.

### Principais Destaques e Funcionalidades

- **Nova Identidade FinPDV:** Sistema visual renovado, moderno e responsivo, projetado para agilidade e facilidade de operação no caixa.
- **Instalação Independente e Isolada:** Instalação limpa com diretórios de dados dedicados e sem interferência em outros sistemas locais.
- **Assistente de Onboarding Inicial:** Configuração guiada no primeiro acesso para inicialização de Empresa, Loja e Terminal de atendimento.
- **Controle de Usuários e RBAC Granular:** Gestão completa de operadores com perfis de acesso bem definidos (Administrador do Cliente, Gerente e Operador de Caixa).
- **Autenticação Segura:** Proteção avançada de credenciais e PINs numéricos de acesso com criptografia moderna.
- **Trilha de Auditoria do Sistema:** Registro cronológico de eventos operacionais críticos, incluindo autenticações, alterações de permissões e operações sensíveis de caixa.
- **Banco de Dados SQLite Nativo e Isolado:** Arquitetura 100% offline-first garantindo operação contínua mesmo sem conexão de rede.
- **Motor Transacional Rust com Integridade Financeira:** Gravação atômica de vendas com garantia de consistência em caixa, estoque e histórico do cliente.
- **Cancelamento Seguro e Estorno Atômico:** Soft Cancel completo que preserva o histórico fiscal e auditoria, revertendo valores de caixa e estoque com precisão.
- **Operações Completas de Caixa:** Suporte integral à abertura de turno, sangria, suprimento e fechamento com conferência cega e relatório detalhado.
- **Gestão de Produtos e Estoque:** Cadastro completo, consulta ágil por código de barras ou nome, controle de categorias e rastreabilidade de movimentações.
- **Impressão Térmica ESC/POS:** Integração nativa para impressão direta de cupons de venda e comprovantes em impressoras térmicas padrão de mercado.
- **Backups Automáticos e Recuperação:** Mecanismo integrado de exportação e restauração segura de dados com proteção de integridade.

---

## Histórico de Versões Prévias

### v0.2.3
- Aperfeiçoamento da navegação por teclado no PDV: tecla ESC fecha modais auxiliares sem comprometer os itens já registrados na venda em andamento.
- Tratamento aprimorado de eventos de teclado em janelas de diálogo operacionais.

### v0.2.2
- Consulta ágil de produtos por código de barras em bases de dados de produtos.
- Classificação automática de categorias de mercadorias.
- Otimização do fluxo de cadastro e edição de produtos com suporte à navegação rápida.

### v0.2.1
- Integração de consulta rápida de identificação de itens por EAN/GTIN.
- Chamada nativa otimizada para contorno de latências no ambiente desktop.

### v0.2.0
- Implementação inicial do motor transacional nativo em SQLite com rollback atômico.
- Cancelamento e estorno atômico de vendas com preservação do histórico de operações.
- Suporte a item avulso / varejo diversos no PDV.
- Rotina preventiva de backup na inicialização do sistema.
