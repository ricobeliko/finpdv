# FinPDV — Documento de Produto Comercial

## 1. Visão Geral
O **FinPDV** é um sistema de Ponto de Venda (PDV) desktop comercial de alta performance, resiliente e **estritamente offline-first**, projetado para operar com autonomia total em comércios de pequeno e médio porte (mercados, mercearias, padarias, açougues e varejo geral).

Diferente de sistemas legados ou mono-cliente (como a base histórica `mercado-pos`), o FinPDV foi concebido como um **produto reutilizável e configurável**:
- **Uma base de código única** atende a múltiplos clientes comerciais.
- Não existem forks por cliente.
- Cada estabelecimento possui sua instalação física ou virtual independente com seu próprio banco de dados SQLite local (`finpdv.db`).
- Toda a identidade visual (Razão Social, Nome Fantasia, CNPJ, Logotipo, Endereço e Rodapé de Cupom) é parametrizada via banco de dados e assistente de primeiro uso (*Onboarding Wizard*), dispensando recompilações.

---

## 2. Princípios Norteadores de Produto

### 2.1. Offline-First Inegociável
- Todas as operações vitais (abertura/fechamento de caixa, sangrias, suprimentos, vendas com múltiplos meios de pagamento, emissão/impressão de cupons térmicos ESC/POS, controle de estoque e auditoria) funcionam sem conexão com a internet.
- A única fonte da verdade operacional em cada terminal é o banco de dados **SQLite local**.

### 2.2. Isolamento Absoluto de Instalação
- O FinPDV coexiste pacificamente no mesmo computador com versões antigas ou outros sistemas legados.
- Identificador exclusivo Tauri: `com.finpdv.app`.
- Pasta de dados dedicada em `%APPDATA%\com.finpdv.app`.
- Banco de dados nomeado estritamente como `finpdv.db` e snapshots `finpdv-pre-migration-vX.db`.

### 2.3. Integridade Financeira e de Dados
- Todos os valores monetários são processados, manipulados e armazenados em **centavos inteiros (`cents`)**, eliminando imprecisões de ponto flutuante.
- Todas as operações de persistência crítica (venda e cancelamento) são executadas no backend nativo Rust (`finpdv_lib`) dentro de transações `BEGIN IMMEDIATE` ACID com verificação de constraints.
- Nenhuma migration descarta dados sem antes realizar snapshot integral de segurança.

### 2.4. Segurança Corporativa e Zero Backdoors
- Controle de acesso baseado em papéis e permissões granulares (**RBAC**).
- Credenciais e senhas criptografadas com **Argon2id** nativo em Rust com salt individual de 16 bytes.
- Proibição absoluta de senhas padrão de fábrica (como "1234", "admin" ou senhas mestras).
- Auditoria completa de eventos de segurança e alterações sensíveis (`audit_logs`).

---

## 3. Entidades Comerciais e Hierarquia
O FinPDV adota o modelo canônico de varejo:

```
[BusinessProfile] (Empresa / Razão Social / CNPJ)
       │
       └── [Store] (Loja / Filial física)
              │
              └── [Terminal] (PDV / Caixa físico ou ilha de atendimento)
```

1. **BusinessProfile (Empresa):**
   - Dados legais e fiscais da empresa cliente (`tradeName`, `corporateName`, `cnpj`, `phone`, `email`, `address`, `receiptFooterMsg`).
2. **Store (Loja):**
   - Identificação da unidade ou filial (`code`, `name`, `address`).
3. **Terminal (Caixa):**
   - Identificação física da estação (`code`, `name`, `printerName`).
4. **InstallationInfo:**
   - Registro exclusivo gerado no provisionamento da máquina com `installationId` persistente.

---

## 4. Jornada de Provisionamento (Assistente Inicial)
Na primeira abertura do FinPDV em um computador recém-instalado, o sistema detecta que a instalação ainda não foi inicializada e apresenta o **Assistente de Inicialização (Wizard)**:
1. **Identificação da Empresa:** Razão Social, Nome Fantasia, CNPJ, Contato.
2. **Configuração da Loja:** Nome da filial e código.
3. **Configuração do Terminal:** Número/código do caixa e impressora padrão conectada.
4. **Criação do Primeiro Administrador (`CLIENT_ADMIN`):** O usuário define obrigatoriamente usuário e senha mestra forte. Nenhuma senha prévia é admitida.

Após a finalização, a flag `is_configured` é ativada e o terminal entra imediatamente em regime operacional seguro.
