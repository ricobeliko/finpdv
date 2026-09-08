# Estratégia de Distribuição de Atualizações — FinPDV (`UPDATE_DISTRIBUTION.md`)

## 1. Contexto e Desafio Atual (v1.0.0)

O repositório oficial do FinPDV (`ricobeliko/finpdv`) é **privado**. No modelo de hospedagem de releases do GitHub:
* O download de artefatos (`FinPDV_x.x.x_x64-setup.exe`) e manifestos (`latest.json`) anexados a Releases de repositórios privados **exige autenticação** (HTTP Header `Authorization: Bearer <PAT>`).
* É **terminantemente proibido** distribuir Personal Access Tokens (PAT), tokens de automação (`GITHUB_TOKEN`) ou credenciais privadas do proprietário embutidas nos binários dos clientes. O cliente jamais deve possuir acesso à infraestrutura privada do desenvolvedor.
* Para o lançamento comercial estável **FinPDV v1.0.0**, o auto-updater automático foi **desabilitado** de forma explícita e controlada (`AUTO_UPDATER_ENABLED = false`, `endpoints: []`). A infraestrutura criptográfica (chave pública Minisign) foi 100% preservada em `tauri.conf.json`.
* A distribuição da versão 1.0.0 segue o modelo **manual homologado**, onde o instalador oficial assinado é disponibilizado diretamente ao cliente final pelo suporte/proprietário.

---

## 2. Avaliação de Alternativas para Fases Futuras

Para permitir atualizações transparentes e automáticas nos PDVs em campo sem violar o isolamento do repositório de código-fonte, três alternativas arquiteturais foram mapeadas para deliberação:

---

### Opção A — Servidor Próprio de Update (API FinPDV)

Neste modelo, o FinPDV consulta uma API de backend dedicada, mantida pelo provedor do software.

```text
FinPDV (Desktop no Cliente)
       │
       ▼ (1) GET /api/v1/updates/check?installId=...&version=1.0.0
   API FinPDV (Backend Nuvem / SaaS)
       │
       ├─► (2) Validação de instalação, licença ativa e canal comercial
       │
       ▼ (3) Retorna manifesto latest.json assinado com URL assinada (presigned URL)
FinPDV (Desktop)
       │
       ▼ (4) Download do binário assinado + validação Minisign nativa
Instalação Automática
```

#### Vantagens:
* **Controle Total de Licenciamento:** Permite controle granular por cliente/terminal, rollout gradual (canary releases), retenção de versões incompatíveis e bloqueio de terminais suspensos.
* **Segurança Reforçada:** O repositório de código-fonte permanece 100% isolado da internet pública.
* **Telemetria e Gestão:** A API registra versão em execução de cada PDV ativo, auxiliando no planejamento de suporte.

#### Desvantagens / Custos:
* Requer desenvolvimento, hospedagem, monitoramento e manutenção de um serviço de backend (API + banco de licenças).

---

### Opção B — Storage / CDN Controlado

Neste modelo, o processo de CI/CD (GitHub Actions) faz o upload dos artefatos compilados e do manifesto `latest.json` para um bucket de objetos com CDN (ex: AWS S3 + CloudFront, Cloudflare R2 ou similar).

```text
CI/CD (GitHub Actions) ──► Upload binários assinados ──► Bucket R2 / S3 / CDN
                                                                │
FinPDV (Desktop) ────────► Consulta pública à CDN ──────────────┘
                         (ex: https://updates.finpdv.com/latest.json)
```

#### Vantagens:
* **Infraestrutura Serverless:** Custo operacional muito baixo, alta escalabilidade e distribuição global rápida via CDN.
* **Repositório de Código Preservado:** Código-fonte permanece estritamente privado em `ricobeliko/finpdv`.
* **Sem Credenciais no Cliente:** O cliente faz download anônimo de um endpoint HTTPS estático público/CDN sem requerer tokens.
* **Integridade Garantida:** Mesmo público, o artefato é verificado contra a chave pública Minisign pelo Tauri.

#### Desvantagens / Custos:
* Não realiza validação individual de licença antes de servir o manifesto (qualquer cliente pode baixar se conhecer o endpoint, a menos que tokens temporários ou assinatura de URL sejam acoplados).

---

### Opção C — Repositório de Releases Público Separado

Neste modelo, o código-fonte permanece no repositório privado (`ricobeliko/finpdv`), mas um repositório secundário aberto (ex: `ricobeliko/finpdv-releases`) é criado exclusivamente para armazenar as tags e anexos binários públicos do GitHub Releases.

```text
ricobeliko/finpdv (PRIVATE — Código-fonte e segredos)
       │ (CI publica binários compilados em)
       ▼
ricobeliko/finpdv-releases (PUBLIC — Apenas tags, binários e latest.json)
       │
       ▼
Clientes PDV consultam https://github.com/.../finpdv-releases/.../latest.json
```

#### Vantagens:
* **Custo Zero de Infraestrutura:** Aproveita toda a infraestrutura gratuita do GitHub Releases sem necessitar de servidores ou buckets externos.
* **Fácil Integração:** Compatível diretamente com a sintaxe nativa de endpoints do `@tauri-apps/plugin-updater`.

#### Desvantagens / Considerações Críticas:
* **Binários Publicamente Acessíveis:** Qualquer pessoa na internet poderá baixar os instaladores do FinPDV. Se o modelo comercial do produto exigir cobrança por licença/download, isso expõe o instalador (exigindo que o aplicativo tenha bloqueio de licenciamento em tempo de execução).
* **Gestão de Dois Repositórios:** Complexidade adicional no fluxo de automação e release no GitHub Actions.

---

## 3. Diretriz para a Fase Atual (v1.0.0)

* **Status Implementado:** Nenhuma das opções acima está ativa no runtime da v1.0.0.
* **Configuração:**
  - `AUTO_UPDATER_ENABLED = false`
  - `UPDATER_PROVIDER = 'DISABLED'`
  - `endpoints = []` em `tauri.conf.json`
* **Próximos Passos (v1.1.0+):** A definição do modelo final de update será deliberada juntamente com a estratégia de licenciamento e monetização comercial do produto.
