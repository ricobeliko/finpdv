# Regras Permanentes de Desenvolvimento

> **Princípio Central:** Integridade > Conveniência.
> Nunca sacrifique a segurança dos dados fiscais, de estoque ou de vendas para simplificar uma implementação.

---

## 1. Regras de Conduta do Agente

1. **Investigar antes de alterar:** Sempre leia e compreenda os arquivos afetados antes de escrever qualquer código.
2. **Mudança mínima necessária:** Escreva apenas o código estritamente necessário para resolver o problema atual.
3. **Não refatorar fora do escopo:** Se encontrar código mal organizado fora da tarefa atual, documente como débito técnico, mas não refatore sem autorização explícita.
4. **Sem dependências desnecessárias:** Não adicione pacotes npm ou crates Rust sem real necessidade técnica comprovada.
5. **Preservar o funcionamento Offline-First:** Toda operação de PDV, cadastro e consulta deve funcionar perfeitamente sem conexão com a internet.
6. **Não ocultar falhas ou warnings:** Documente warnings de TypeScript, Clippy e compilador com transparência.
7. **Nunca afirmar que algo funciona sem evidência:** Valide no código, em execução ou em testes antes de declarar sucesso.

---

## 2. Regras de Integridade de Dados

1. **SQLite é a única fonte da verdade:** O estado em memória React/Zustand é efêmero. Apenas dados confirmados no banco são considerados gravados.
2. **Erros de persistência não podem ser engolidos:** Se uma query no SQLite falhar (ex: violação de constraint UNIQUE), a operação deve ser tratada e informada ao operador. Nunca mantenha estado otimista falso na UI após falha do banco.
3. **Valores monetários sempre em centavos:** Preços de venda, custo, descontos e sangrias devem ser manipulados e persistidos como números inteiros (`price_cents: integer`), evitando imprecisão de ponto flutuante.
4. **Sem duplicidade silenciosa:** Códigos de barras (EAN), códigos internos e identificadores únicos não podem ser ignorados silenciosamente com `INSERT OR IGNORE` sem validação prévia na aplicação.
5. **Transações em operações compostas:** Vendas (carrinho + baixa de estoque + movimentação de caixa) devem ser atômicas.

---

## 3. Restrições de Operações Git e Sistema

* **PROIBIDO** executar sem autorização expressa do usuário:
  * `git reset`, `git reset --hard`
  * `git restore`
  * `git clean`
  * `git checkout .`
  * `git stash`
  * `git pull`, `git merge`, `git rebase`
  * `git commit`, `git push`
* **O working tree local é a fonte da verdade:** Alterações locais existentes devem ser respeitadas e protegidas.
* **Segredos e chaves de API:** Nunca exponha, remova ou altere chaves de API e variáveis de ambiente confidenciais.
