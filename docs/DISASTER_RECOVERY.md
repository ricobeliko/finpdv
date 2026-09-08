# GUIA OPERACIONAL DE RECUPERAÇÃO DE DESASTRE (DISASTER RECOVERY) — FINPDV

**Versão do Documento:** 1.0.0  
**Escopo:** FinPDV 1.0.0 (Windows / Desktop Local Offline-First)  
**Classificação:** Operacional / Suporte Técnico

---

## 1. Introdução: "Caiu ou queimou o computador do cliente. O que eu faço?"

Este documento orienta o suporte técnico e os operadores autorizados sobre como restabelecer o FinPDV em caso de sinistro físico no equipamento do cliente (placa-mãe queimada, disco rígido danificado, furto ou pane irrecuperável do hardware).

### Princípios Fundamentais
1. **NÃO INICIE OPERAÇÃO COMERCIAL ANTES DE CONCLUIR A RECUPERAÇÃO:** Nenhuma venda avulsa deve ser feita no novo equipamento antes do restore integral para evitar colisões de numeração de cupom, descompasso contábil de caixa ou perda de estoque.
2. **ISOLAMENTO ABSOLUTO:** O FinPDV opera 100% isolado de qualquer versão legada (`mercado-pos`). O caminho exclusivo de runtime no Windows é `%APPDATA%\com.finpdv.app\finpdv.db`.
3. **IDENTIDADE EMPRESARIAL vs. IDENTIDADE DA INSTALAÇÃO:**
   - **Business Identity (`cnpj`, `business_id`):** Deve ser estritamente preservada entre backups e restores. O FinPDV bloqueia restaurações de backups que pertençam a outra empresa (`WRONG_BUSINESS_CNPJ`).
   - **Installation Identity (`installation_id`):** Pertence à máquina física. Em um novo computador limpo, um novo `installation_id` é gerado automaticamente e o restore autoriza a importação da base da empresa no novo hardware (Disaster Recovery).

---

## 2. Diferença Entre Restauração no Mesmo PC vs. Disaster Recovery em Novo PC

| Cenário | Máquina | Instalação / Configuração Prévia | Comportamento do Restore |
| :--- | :--- | :--- | :--- |
| **Restauração Local (Mesmo PC)** | Mesmo hardware | FinPDV já configurado com dados da empresa | Valida que o backup pertence à mesma empresa (`cnpj` e `business_id` idênticos). Rejeita backups de terceiros. |
| **Disaster Recovery (Novo PC)** | Novo computador | Instalação limpa, sem empresa cadastrada ainda | O motor detecta banco recém-instalado (tabela `business_profile` vazia), valida o schema, a integridade física (`quick_check`) e referencial (`foreign_key_check`), e importa a identidade da empresa para o novo PC. |

---

## 3. Roteiro Prático de Recuperação em 15 Passos

### Passo 1: Instalação do FinPDV no Novo Computador
- Baixe o instalador oficial `FinPDV_1.0.0_x64-setup.exe`.
- Execute a instalação padrão no Windows (executável de 64 bits).
- Abra o FinPDV pela primeira vez.

### Passo 2: NÃO Iniciar Operação Comercial Imediatamente
- O sistema abrirá na tela inicial / onboarding de configuração.
- **Não cadastre uma empresa fictícia nem tente abrir caixa para vender.** A máquina deve permanecer em modo de preparação até que os dados sejam restabelecidos.

### Passo 3: Localizar o Backup Válido
- Localize o arquivo de backup mais recente em mídia externa (pendrive de segurança, disco externo ou armazenamento de rede da empresa).
- O arquivo possui o formato: `finpdv_backup_YYYY-MM-DD_HH-mm-ss.json`.

### Passo 4: Verificar Cliente e Identidade do Backup
- Abra o cabeçalho do arquivo `.json` em um editor de texto simples para conferir o metadado `origin`:
  - `backupFormatVersion`: `"2.0"`
  - `businessCnpj`: Conferir com o CNPJ do cliente.
  - `businessTradeName`: Conferir com a razão/nome fantasia do cliente.
- Certifique-se de que o arquivo não está truncado.

### Passo 5: Executar o Restore no FinPDV
- No assistente inicial ou em **Configurações & Backup > Aba Backup**:
- Clique em **"Restaurar Banco de Dados"** e selecione o arquivo `.json`.
- O FinPDV exibirá o modal com os metadados do backup (data de criação, CNPJ de origem e quantidade de registros).
- Confirme a restauração digitando `RESTAURAR`.

### Passo 6: Validação Física e Referencial Automática
- O backend em Rust executa internamente:
  1. Criação de ponto de restauração temporário (`safety rollback`);
  2. Inserção atômica em transação isolada;
  3. `PRAGMA foreign_key_check;` (garante que não há órfãos em vendas, itens e pagamentos);
  4. `PRAGMA quick_check;` (garante integridade das árvores B-tree do SQLite).
- Se houver qualquer inconsistência, o banco sofre rollback automático e a operação é abortada sem corromper a máquina.

### Passo 7: Validação da Empresa
- Acesse as Configurações do FinPDV.
- Verifique se a Razão Social, Nome Fantasia, CNPJ, Endereço e Mensagem de Rodapé correspondem exatamente ao cadastro do cliente.

### Passo 8: Validação dos Usuários e Acessos
- Acesse **Usuários**.
- Verifique se todos os operadores, supervisores e o administrador original estão presentes com seus respectivos papéis.
- Realize login com a senha ou PIN cadastrado originalmente (o hash Argon2id é preservado de forma segura).

### Passo 9: Validação do Catálogo de Produtos
- Acesse **Produtos**.
- Verifique a contagem de produtos cadastrados.
- Confira se os códigos internos, códigos de barras (EAN), unidades de medida e preços de venda foram restaurados.

### Passo 10: Validação de Estoque
- Verifique o saldo em estoque dos 5 produtos de maior giro da loja.
- Confira se as quantidades coincidem com a última contagem anterior ao incidente.

### Passo 11: Validação do Histórico de Vendas
- Acesse **Relatórios & Vendas**.
- Verifique se as vendas anteriores ao sinistro constam na tabela com totais, formas de pagamento e cupons auxiliares legíveis.

### Passo 12: Validação de Caixa
- Acesse **Controle de Caixa**.
- Se havia uma sessão de caixa aberta no momento do incidente, confira se ela foi restaurada. Se necessário, feche-a com a contagem física real da gaveta que foi resgatada do balcão antigo.

### Passo 13: Configuração de Terminal e Impressora Térmica
- Acesse **Configurações & Backup > Periféricos**.
- Conecte a impressora térmica via USB/Spooler do Windows (ESC/POS 80mm ou 58mm).
- Selecione a impressora na lista e clique em **"Salvar Preferência de Impressora"**.
- Clique em **"Teste de Impressão"** e confira a impressão física do comprovante.

### Passo 14: Executar Venda de Teste
- No módulo de Vendas (PDV):
  1. Bipar 1 produto de teste;
  2. Concluir a venda no valor exato com forma de pagamento Dinheiro;
  3. Verificar a impressão do cupom térmico;
  4. Pressionar `F9` para testar a **Reimpressão do Comprovante**;
  5. Cancelar / estornar a venda de teste pelo módulo de Relatórios para manter o estoque e caixa calibrados.

### Passo 15: Liberação Oficial para Operação
- Somente após os 14 passos acima terem sido concluídos com status `PASS`, libere o terminal para os operadores de caixa realizarem o atendimento comercial aos clientes.

---

## 4. Matriz de Resolução de Problemas Durante o Restore

| Erro Apresentado | Causa Provável | Ação Corretiva |
| :--- | :--- | :--- |
| `WRONG_BUSINESS_CNPJ` | O backup selecionado pertence a outra loja ou outro cliente. | Localizar o arquivo correto pertencente ao CNPJ da loja atual. |
| `CORRUPTED_BACKUP` | Arquivo JSON incompleto ou corrompido durante cópia de pendrive. | Obter a cópia íntegra original do backup; verificar o tamanho em bytes. |
| `FOREIGN_KEY_VIOLATION` | O backup possui referências inconsistentes criadas por adulteração externa. | O FinPDV desfaz o restore automaticamente. Utilize um backup anterior não violado. |
| `PRINTER_OFFLINE` | Impressora térmica não reconhecida no Windows. | Instalar os drivers da impressora no Windows e reiniciar o FinPDV. |

---

## 5. Auditoria da Recuperação
Toda operação de restauração gera registros invioláveis na tabela `audit_logs`:
- `backup.restore_started`
- `backup.restore_completed` (com registro de operador, terminal e timestamp)
- `backup.restore_failed` (com motivo sanitizado em caso de rejeição por segurança)
