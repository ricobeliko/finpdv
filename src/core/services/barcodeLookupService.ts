export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
  categorySuggestion?: string;
}

/**
 * Consulta bases públicas de códigos de barras (EAN-13 / GTIN)
 * com fallback múltiplo (Open Food Facts v2 + v0 Brasil)
 */
export async function lookupBarcodeInfo(barcode: string): Promise<BarcodeLookupResult> {
  const cleanBarcode = barcode.replace(/\D/g, '').trim();
  if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
    return { found: false };
  }

  // URLs de busca em ordem de prioridade
  const endpoints = [
    `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json?fields=product_name,product_name_pt,brands,categories,categories_tags`,
    `https://br.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MercadoPOS - DesktopApp - Version 1.0'
        }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        // 404 significa apenas que o produto não consta nesta base pública
        continue;
      }

      const data = await res.json();
      const product = data.product;
      if ((data.status === 1 || data.status_verbose === 'product found') && product) {
        const rawName = product.product_name_pt || product.product_name || '';
        const brand = product.brands || '';

        let formattedName = rawName.trim();
        if (brand && !formattedName.toLowerCase().includes(brand.toLowerCase())) {
          formattedName = `${formattedName} ${brand}`.trim();
        }

        if (!formattedName) continue;

        // Sugestão de categoria com base nas tags
        let categorySuggestion = 'Mercearia & Grãos';
        const catTags = (product.categories_tags || []).concat(product.categories ? [product.categories] : []).join(' ').toLowerCase();

        if (catTags.includes('beverage') || catTags.includes('boisson') || catTags.includes('drink') || catTags.includes('refrigerante') || catTags.includes('cerveja') || catTags.includes('suco') || catTags.includes('agua') || catTags.includes('soft-drinks')) {
          categorySuggestion = 'Bebidas';
        } else if (catTags.includes('hygiene') || catTags.includes('cleaning') || catTags.includes('limpeza') || catTags.includes('sabonete') || catTags.includes('detergent')) {
          categorySuggestion = 'Limpeza & Higiene';
        } else if (catTags.includes('fruit') || catTags.includes('vegetable') || catTags.includes('legume') || catTags.includes('verdura')) {
          categorySuggestion = 'Hortifrúti';
        }

        return {
          found: true,
          name: formattedName,
          brand: brand.trim(),
          categorySuggestion
        };
      }
    } catch (_) {
      // Ignora erro de rede/timeout e tenta o próximo fallback
    }
  }

  return { found: false };
}
