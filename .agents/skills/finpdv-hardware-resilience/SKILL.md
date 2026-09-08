---
name: finpdv-hardware-resilience
description: >-
  Diretrizes de comunicação com hardware, impressoras térmicas ESC/POS, gavetas de dinheiro, leitor de código de barras e tolerância a falhas de periféricos no FinPDV.
---

# FinPDV Hardware Resilience & Peripherals Standards

Utilize esta skill sempre que alterar rotinas de impressão térmica (`printer.ts`, `printer_windows.rs`), acionamento de gaveta (`drawer.ts`), leitura de código de barras ou manipulação de periféricos locais.

---

## 1. Comunicação ESC/POS Via Spooler do Windows
* **Spooler Nativo Win32:** A comunicação com a impressora térmica de 80mm ou 58mm utiliza o spooler padrão do Windows (`OpenPrinterW`, `StartDocPrinterW`, `WritePrinter`, `EndDocPrinterW`, `ClosePrinter`) via Rust nativo.
* **Driver Raw/Generic:** Garante compatibilidade universal com impressoras Daruma, Bematech, Epson, Elgin, Sweda e marcas chinesas compatíveis sem necessidade de DLLs de terceiros.
* **Comandos ESC/POS Determinísticos:**
  - Inicialização: `ESC @` (`\x1B\x40`)
  - Alinhamento: `ESC a n` (`\x1B\x61\x00` para esquerda, `\x01` para centro)
  - Enfatizado: `ESC E n` (`\x1B\x45\x01` para negrito)
  - Corte de papel: `GS V 66 0` (`\x1D\x56\x42\x00`)
  - Abertura de gaveta de dinheiro: `ESC p 0 25 250` (`\x1B\x70\x00\x19\xFA`)

## 2. Isolamento de Storage de Periféricos
* **Chave Padronizada do FinPDV:** A impressora selecionada é gravada exclusivamente sob a chave `finpdv_selected_printer` no `localStorage`.
* **Zero Vestígios Legados em Runtime:** Chaves antigas (`mercado_selected_printer`, `mercado_*`, `mercearia_*`) foram eliminadas. Rotinas de migração de legado executam apenas uma única vez na leitura e removem a chave antiga imediatamente após transferir para `finpdv_selected_printer`.

## 3. Resiliência Operacional em Falha de Impressão
* **Hardware Offline Não Invalida Venda:** Se a impressora estiver sem papel, desconectada ou desligada no momento do encerramento da venda, a venda no SQLite já está commitada e garantida.
* **Alerta Limpo e Retentativa:** O sistema emite mensagem clara ao operador (`"Aviso: Não foi possível imprimir o comprovante neste momento."`) e disponibiliza o atalho `[F10]` para reimprimir o último cupom assim que a impressora for reestabelecida.
* **Confinamento de Foco com Leitor:** Os modais do PDV contam com `useFocusTrap` ativo para impedir que o leitor de código de barras (scanner USB) injete caracteres na tela de fundo durante a finalização do pagamento.
