# FinPDV — Modo Suporte Técnico (FinPDV Support)

## 1. Contexto e Filosofia
O acesso técnico ao FinPDV (`FINPDV_SUPPORT`) foi desenhado para resolver incidentes operacionais, inspeção de integridade de banco de dados e diagnósticos em campo sem comprometer a segurança da empresa cliente.

### Regra de Ouro: Zero Backdoor
- É terminantemente proibido qualquer usuário fixo com senha padrão (como `admin / admin` ou `suporte / 123456`).
- Não existem senhas universais, chaves privadas embutidas no binário nem flags secretas de bypass.

---

## 2. Fluxo de Ativação do Modo Suporte
O suporte do FinPDV funciona sob **demanda explícita do cliente**:

1. **Geração do Desafio (Challenge):**
   - O administrador da loja acessa a aba **Manutenção** e clica em `Gerar Acesso Temporário de Suporte`.
   - O sistema gera um código de desafio efêmero associado à instalação (ex: `FP-SUP-X9K2L1A0`), com validade máxima de 4 horas (`expires_at`).
2. **Registro de Auditoria:**
   - O evento de geração é gravado imediatamente em `audit_logs` e persistido na tabela `support_sessions`.
3. **Escopo Restrito:**
   - O modo suporte concede permissões exclusivamente para diagnóstico (`maintenance.view`, `maintenance.execute`), execução de `PRAGMA integrity_check`, visualização de tamanho do banco, contadores de registros e configurações de spooler de impressão.
   - Nenhuma operação de caixa ou movimentação financeira oculta é permitida.

---

## 3. Próximo Passo Criptográfico (Roadmap Ed25519)
Para auditoria avançada e suporte remoto de nível 3:
- O FinPDV conterá em seu código apenas a **chave pública** da equipe de engenharia do FinPDV.
- A chave privada permanecerá em cofre seguro fora da aplicação.
- Um token assinado contendo `installationId`, `challenge` e `expiresAt` será gerado pelo time de suporte e validado localmente pelo aplicativo antes de liberar funções de reparo profundo.
