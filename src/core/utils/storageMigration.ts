/**
 * Utilitário de Migração Segura de Armazenamento Local (localStorage)
 * Garante a migração transparente e única de chaves legadas ('mercado_*')
 * para o padrão FinPDV ('finpdv_*'), removendo imediatamente os vestígios legados.
 */

const PRINTER_KEY = 'finpdv_selected_printer';
const LEGACY_PRINTER_KEY = 'mercado_selected_printer';

const LAST_CATEGORY_KEY = 'finpdv_last_category_id';
const LEGACY_LAST_CATEGORY_KEY = 'mercado_pos_last_category_id';

/**
 * Obtém a impressora selecionada no FinPDV.
 * Se houver configuração na chave legada, migra para finpdv_selected_printer e expurga a chave legada.
 */
export function getSelectedPrinter(): string {
  try {
    const current = localStorage.getItem(PRINTER_KEY);
    if (current && current.trim()) {
      // Se a chave legada ainda existir por qualquer razão, remove-a
      if (localStorage.getItem(LEGACY_PRINTER_KEY)) {
        localStorage.removeItem(LEGACY_PRINTER_KEY);
      }
      return current;
    }

    const legacy = localStorage.getItem(LEGACY_PRINTER_KEY);
    if (legacy && legacy.trim()) {
      localStorage.setItem(PRINTER_KEY, legacy);
      localStorage.removeItem(LEGACY_PRINTER_KEY);
      return legacy;
    }
  } catch (err) {
    console.warn('Aviso: falha ao acessar localStorage para impressora:', err);
  }
  return '';
}

/**
 * Salva a impressora configurada exclusivamente sob a chave FinPDV e limpa a chave legada.
 */
export function setSelectedPrinter(printerName: string): void {
  try {
    localStorage.setItem(PRINTER_KEY, printerName);
    localStorage.removeItem(LEGACY_PRINTER_KEY);
  } catch (err) {
    console.warn('Aviso: falha ao salvar impressora no localStorage:', err);
  }
}

/**
 * Obtém o ID da última categoria utilizada no cadastro de produtos.
 */
export function getLastCategoryId(): string {
  try {
    const current = localStorage.getItem(LAST_CATEGORY_KEY);
    if (current && current.trim()) {
      if (localStorage.getItem(LEGACY_LAST_CATEGORY_KEY)) {
        localStorage.removeItem(LEGACY_LAST_CATEGORY_KEY);
      }
      return current;
    }

    const legacy = localStorage.getItem(LEGACY_LAST_CATEGORY_KEY);
    if (legacy && legacy.trim()) {
      localStorage.setItem(LAST_CATEGORY_KEY, legacy);
      localStorage.removeItem(LEGACY_LAST_CATEGORY_KEY);
      return legacy;
    }
  } catch (err) {
    console.warn('Aviso: falha ao acessar localStorage para última categoria:', err);
  }
  return '';
}

/**
 * Salva o ID da última categoria utilizada sob a chave FinPDV e limpa a chave legada.
 */
export function setLastCategoryId(categoryId: string): void {
  try {
    localStorage.setItem(LAST_CATEGORY_KEY, categoryId);
    localStorage.removeItem(LEGACY_LAST_CATEGORY_KEY);
  } catch (err) {
    console.warn('Aviso: falha ao salvar última categoria no localStorage:', err);
  }
}
