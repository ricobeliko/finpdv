import { invoke } from '@tauri-apps/api/core';
import { CompletedSale } from '../../modules/pos/types';

const ESC = 0x1B;
const GS = 0x1D;

// Remove acentos para garantir compatibilidade universal ESC/POS sem caracteres corrompidos
const sanitizeText = (str: string) => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentuações (á -> a, ç -> c)
    .replace(/[^\x20-\x7E\n]/g, ''); // mantém apenas ASCII visível e quebras de linha
};

export class EscPosBuilder {
  private buffer: number[] = [];

  init(): this {
    this.buffer.push(ESC, 0x40); // Inicializa a impressora
    return this;
  }

  openDrawer(): this {
    this.buffer.push(ESC, 0x70, 0x00, 0x19, 0xFA); // Pulso elétrico RJ11 para abertura da gaveta
    return this;
  }

  alignCenter(): this {
    this.buffer.push(ESC, 0x61, 1);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(ESC, 0x61, 0);
    return this;
  }

  alignRight(): this {
    this.buffer.push(ESC, 0x61, 2);
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(ESC, 0x45, enable ? 1 : 0);
    return this;
  }

  text(str: string): this {
    const cleanStr = sanitizeText(str);
    for (let i = 0; i < cleanStr.length; i++) {
      this.buffer.push(cleanStr.charCodeAt(i));
    }
    return this;
  }

  newLine(count = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(0x0A);
    }
    return this;
  }

  line(left: string, right: string, maxCols = 42): this {
    const cleanLeft = sanitizeText(left);
    const cleanRight = sanitizeText(right);
    const spaces = Math.max(1, maxCols - cleanLeft.length - cleanRight.length);
    this.text(cleanLeft + ' '.repeat(spaces) + cleanRight).newLine();
    return this;
  }

  separator(maxCols = 42): this {
    this.text('-'.repeat(maxCols)).newLine();
    return this;
  }

  cut(): this {
    this.newLine(4);
    this.buffer.push(GS, 0x56, 66, 0); // Guilhotina / Corte automático
    return this;
  }

  build(): number[] {
    return this.buffer;
  }
}

// 1. LISTA IMPRESSORAS INSTALADAS NO WINDOWS
export async function getInstalledPrinters(): Promise<string[]> {
  try {
    return await invoke<string[]>('get_printers');
  } catch (err) {
    console.error('Erro ao listar impressoras:', err);
    return [];
  }
}

// 2. IMPRESSÃO DO COMPROVANTE TÉRMICO (RAW ESC/POS)
export async function printReceipt(sale: CompletedSale, printerName: string) {
  if (!printerName) {
    throw new Error('Nenhuma impressora térmica configurada.');
  }

  const formatBRL = (cents: number) =>
    ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const builder = new EscPosBuilder()
    .init()
    .alignCenter()
    .bold(true)
    .text('MERCADO POS').newLine()
    .bold(false)
    .text('DOCUMENTO AUXILIAR DE VENDA').newLine()
    .text('SEM VALOR FISCAL').newLine()
    .separator()
    .alignLeft()
    .text(`CUPOM: #${sale.id}`).newLine()
    .text(`DATA:  ${sale.date}`).newLine()
    .text(`CLIENTE: ${sale.customer ? sale.customer.name : 'CONSUMIDOR FINAL'}`).newLine()
    .separator();

  sale.items.forEach(i => {
    builder.line(`${i.quantity}x ${i.name.slice(0, 22)}`, formatBRL(i.totalCents));
  });

  builder
    .separator()
    .line('SUBTOTAL:', formatBRL(sale.subtotalCents));

  if (sale.discountCents > 0) {
    builder.line('DESCONTO:', `-${formatBRL(sale.discountCents)}`);
  }

  builder
    .bold(true)
    .line('TOTAL A PAGAR:', formatBRL(sale.totalCents))
    .bold(false);

  sale.payments.forEach(p => {
    builder.line(`PAGO (${p.method}):`, formatBRL(p.amountCents));
  });

  if (sale.changeCents > 0) {
    builder.line('TROCO:', formatBRL(sale.changeCents));
  }

  builder
    .separator()
    .alignCenter()
    .text('Obrigado pela preferencia!').newLine()
    .text('Volte sempre!').newLine()
    .cut();

  await invoke('print_raw_escpos', {
    printerName,
    data: builder.build()
  });
}

// 3. TESTE DE IMPRESSÃO TÉRMICA
export async function testPrinter(printerName: string) {
  if (!printerName) throw new Error('Selecione uma impressora primeiro.');

  const builder = new EscPosBuilder()
    .init()
    .alignCenter()
    .bold(true)
    .text('MERCADO POS - TESTE DE IMPRESSAO').newLine()
    .bold(false)
    .text('COMUNICACAO ESC/POS DIRETA').newLine()
    .separator()
    .alignLeft()
    .text('Status: Conexao OK!').newLine()
    .text(`Impressora: ${printerName}`).newLine()
    .text(`Data/Hora: ${new Date().toLocaleString('pt-BR')}`).newLine()
    .separator()
    .alignCenter()
    .text('Impressao e guilhotina operando 100%!').newLine()
    .cut();

  await invoke('print_raw_escpos', {
    printerName,
    data: builder.build()
  });
}

// 4. ABERTURA DA GAVETA (RJ11 PROTEGIDO)
export async function triggerDrawer(printerName: string) {
  if (!printerName) return;
  try {
    await invoke('open_cash_drawer', { printerName });
  } catch (err) {
    console.warn('Não foi possível acionar a gaveta de dinheiro:', err);
  }
}