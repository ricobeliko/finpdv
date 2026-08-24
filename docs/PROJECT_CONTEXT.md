# Contexto do Projeto: Mercado POS (Mercearia Uber)

## 1. Visão Geral
* **Nome da Aplicação:** Mercearia Uber (`mercado-pos`)
* **Finalidade:** Sistema de Ponto de Venda (PDV), controle de estoque, frente de caixa e retaguarda para mercados, mercearias e comércios de bairro.
* **Paradigma:** Desktop **Offline-First**. O comércio opera continuamente mesmo sem acesso à internet.
* **Stack Tecnológica:**
  * **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Zustand
  * **Backend Desktop:** Tauri 2 (Rust)
  * **Banco de Dados Local:** SQLite 3 (WAL Mode via `@tauri-apps/plugin-sql`)
  * **OS Alvo Principal:** Windows 10 / 11 Desktop

---

## 2. Prioridades do Sistema (Ordem Rígida)
1. **Integridade dos Dados:** Dinheiro, estoque e movimentações fiscais/caixa nunca podem ser corrompidos ou perdidos.
2. **Confiabilidade:** O sistema não pode travar, fechar inesperadamente ou congelar o checkout.
3. **Funcionamento Offline:** A internet é opcional e auxiliar. Nenhuma rotina crítica de PDV/Cadastro depende de rede externa.
4. **Velocidade Operacional:** Checkout rápido por teclado e leitor de código de barras (mínimo de cliques).
5. **Facilidade de Uso:** Interface limpa, intuitiva e sem complexidade desnecessária.
6. **Novas Funcionalidades:** Recursos novos só entram se respeitarem as prioridades 1 a 5.

---

## 3. Premissas de Negócio e Escopo Atual
* **Perfil Único de Operação:** O cliente opera sob o usuário `Administrador`. Recursos de multiusuário, PIN, perfis avançados e RBAC estão **fora do escopo atual**.
* **Backup por E-mail:** A integração com Resend/e-mail será descontinuada e removida. O backup físico do SQLite é a prioridade.
* **Open Food Facts:** Serviço externo meramente **auxiliar** para sugestão de nomes/categorias no cadastro. Falhas de rede, DNS ou API nunca devem impedir ou bloquear o cadastro manual.
* **Monetário:** Valores monetários são sempre calculados e persistidos em centavos inteiros (`cents: integer`) no SQLite.

---

## 4. Referências Rápidas
* Estado atual e pendências: [CURRENT_STATUS.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/CURRENT_STATUS.md)
* Arquitetura e camadas: [ARCHITECTURE.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/ARCHITECTURE.md)
* Regras permanentes de desenvolvimento: [DEVELOPMENT_RULES.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/DEVELOPMENT_RULES.md)
* Registro de Decisões: [DECISIONS.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/DECISIONS.md)
* Validação e testes: [TESTING.md](file:///c:/Users/richa/OneDrive/Documentos/Projetos/mercado-pos/docs/TESTING.md)
