# FinPDV — Modo Suporte Técnico (FinPDV Support)

## 1. Status de Homologação
```text
STATUS: NOT_PRODUCTION_READY
```

### Justificativa Técnica
O FinPDV adota uma política estrita de **Zero Backdoors e Zero Credenciais Mestras**. O mecanismo local de desafio temporário (`FP-SUP-XXXXXXXX`) implementado no painel de manutenção serve atualmente como diagnóstico informativo e base de auditoria (`audit_logs`). 

No entanto, como a infraestrutura de assinatura assimétrica externa via **Ed25519** (na qual o FinPDV possui apenas a chave pública embutida e a chave privada reside exclusivamente em cofre seguro fora da aplicação) ainda está em fase de desenho criptográfico, **o papel `FINPDV_SUPPORT` permanece intencionalmente DESABILITADO para autenticação na release comercial**.

---

## 2. Garantias Atuais de Segurança
1. **Sem Senha Mestra:** Não existe usuário, senha, PIN universal ou parâmetro oculto de acesso.
2. **Sem Bypass de Autenticação:** Nenhuma rota, modal ou comando Tauri permite transição para modo suporte sem autorização explícita do administrador do cliente (`CLIENT_ADMIN`).
3. **Proteção contra Replay:** A validação nativa em Rust (`SupportSessionValidator`) rejeita tokens reutilizados e valida `expires_at` estritamente contra o relógio do sistema.
4. **Revogação Imediata:** O administrador local pode revogar a sessão de suporte a qualquer momento, invalidando o token no SQLite.
5. **Auditoria Total:** Toda geração, tentativa de uso, sucesso ou revogação de sessão é persistida em `audit_logs` com timestamp e identificação da instalação.

---

## 3. Especificação Criptográfica do Roadmap (Ed25519)
Para a futura ativação do modo suporte em produção:

```text
FinPDV Desktop                      Equipe de Suporte FinPDV
      │                                       │
1. Gera Challenge + Nonce                     │
   (vinculado a installation_id) ───────────► │
                                         2. Assina carga útil
                                            com CHAVE PRIVADA (Ed25519):
                                            - installation_id
                                            - challenge
                                            - issued_at
                                            - expires_at (máx 4h)
                                            - permissions permitidas
                                              │
3. Recebe token assinado ◄────────────────────┘
   Valida com CHAVE PÚBLICA embutida
   Verifica expiração e unicidade (anti-replay)
   Ativa sessão temporária estrita
```
