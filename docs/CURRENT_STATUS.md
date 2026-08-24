# Estado Atual do Projeto (`CURRENT_STATUS.md`)

> **Arquivo de Retomada:** Este documento deve ser lido no início de cada nova conversa para que o agente conheça o estado real do working tree e as prioridades imediatas.

---

## 1. Dados do Repositório
* **Versão do Projeto:** `0.1.16`
* **Último Commit:** `6123e1d — feat(release): v0.1.16 - Chave embutida no binario nativo sem exposicao de api no codigo`
* **Working Tree:** `MODIFICADO E VALIDADO` (Pronto para commit)

---

## 2. Ciclo Concluído: Cadastro Rápido de Produtos

**Status:** `GATE FUNCIONAL APROVADO (100% PASS)`  
Todos os fluxos foram testados e validados em **Tauri Runtime real**:

* [x] **Abertura Rápida (`Insert` e `F2`):** Abertura instantânea com foco automático no Código de Barras.
* [x] **Debounce do Scanner (250ms):** Transmissão rápida de EAN-13, EAN-8, UPC-A e GTIN-14 sem buscas intermediárias.
* [x] **EAN + Enter:** Tecla `Enter` não salva prematuramente; executa exatamente 1 consulta à API.
* [x] **Open Food Facts ao Vivo:** Preenchimento automático de Nome, sugestão de Categoria e avanço automático de foco para o Preço.
* [x] **Cadastro e Persistência:** Preenchimento de preço e confirmação salvam o produto no SQLite e atualizam a listagem.
* [x] **Código Interno Sequencial:** Produtos salvos sem código manual recebem sequência automática e crescente (`COD-00001`, `COD-00002`...).
* [x] **Bloqueio de EAN Duplicado:** Cadastro e edição validam unicidade e impedem duplicidade no catálogo e no SQLite.
* [x] **Trava contra Duplo Submit:** Mutex síncrono e estado visual bloqueiam reentradas em múltiplos cliques ou múltiplos `Enter` rápidos.
* [x] **Preservação de Categoria e Nome Manuais:** Escolhas do operador são protegidas contra respostas tardias da API.
* [x] **Fallback Offline:** Timeout de 2s sem travar formulário; permite cadastro 100% manual.
* [x] **Edição Inteligente:** Foco direto no Preço de Venda; permite salvar alterações sem falso erro de EAN duplicado contra si mesmo.
* [x] **Persistência após Reinício:** Fechamento e reabertura do executável Tauri recarrega os dados diretamente do SQLite.
* [x] **Localização no PDV:** Bipagem e busca do produto cadastrado na tela de checkout com preço correto.

---

## 3. Limpeza do Banco Local de Desenvolvimento

* Os 3 produtos criados exclusivamente para a bateria de validação (`Leite Condensado Teste`, `Refrigerante Coca-Cola Teste`, `Teste Duplo Clique`) foram **removidos pontualmente por ID** junto com suas relações de códigos de barras.
* Nenhum dado real foi afetado.

---

## 4. Dívida Técnica Conhecida (Preexistente - Fora de Escopo)

O comando `npx tsc --noEmit` apresenta **4 erros preexistentes** restritos a:
* `src/modules/settings/SettingsPage.tsx` (propriedades `resendApiKey` e `UpdateStatus.progress`).

---

## 5. Próxima Etapa Planejada (Próximo Ciclo)

**Remoção Completa do Backup por E-mail / Resend:**
1. Remover completamente a funcionalidade de envio de backup por e-mail.
2. Remover `RESEND_API_KEY` e referências da biblioteca Resend no frontend e configurações.
3. Limpar a interface de configurações em `SettingsPage.tsx`, eliminando os 4 erros de compilação TypeScript existentes.
4. Preservar exclusivamente os mecanismos de backup locais e manuais necessários para o produto.
