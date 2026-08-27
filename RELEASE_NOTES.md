# Notas de Lançamento — Mercearia Uber

## v0.2.3
- Correção no atalho ESC do PDV: ao cancelar a adição de um item avulso ou quantidade, apenas o modal é fechado, mantendo a venda e os itens já registrados intactos
- Bloqueio de propagação de eventos de teclado (Escape) em todos os modais de operação do caixa
- Proteção temporal antirruído no listener global do PDV para evitar falso cancelamento de venda

## v0.2.2
- Consulta automática de produtos por código de barras via Bluesoft Cosmos
- Classificação inteligente de categorias (Padaria, Frios/Laticínios, Bebidas, Limpeza) sem falsos positivos
- Suporte à tecla ESC no modal de cadastro e edição de produtos
- Assistente de atualização com relatório dinâmico das novidades instaladas
- Fallback transparente para base Open Food Facts e cadastro manual

## v0.2.1
- Integração da API Bluesoft Cosmos para identificação rápida de EAN/GTIN
- Chamada nativa Rust no Tauri para contorno de limitações de rede do WebView
- Proteção de fechamento por ESC durante a gravação de produtos

## v0.2.0
- Novo motor transacional SQLite nativo em Rust com rollback atômico global
- Cancelamento e estorno atômico de vendas com preservação do histórico para auditoria
- Suporte oficial a item Open Price / Varejo Diversos no PDV (código 1)
- Sistema automático e idempotente de backup pré-migração do banco de dados
