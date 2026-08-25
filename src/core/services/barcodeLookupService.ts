import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '../../modules/settings/settingsStore';

export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
  categorySuggestion?: string;
  source?: 'COSMOS' | 'OPEN_FOOD_FACTS';
  ncm?: string;
}

export interface BarcodeLookupOptions {
  cosmosEnabled?: boolean;
  cosmosToken?: string;
  cosmosUserAgent?: string;
}

/**
 * Normaliza e classifica as categorias retornadas pelas bases de códigos de barras.
 * Dá prioridade a categorias específicas e ignora meta-tags genéricas (ex: 'plant-based-foods-and-beverages').
 */
export function classifyCategoryFromTags(rawTags: string[] = [], rawCategoriesString: string = ''): string {
  const tags: string[] = [];

  for (const tag of rawTags) {
    if (!tag) continue;
    const cleanTag = tag.toLowerCase().replace(/^[a-z]{2}:/, '').trim();
    if (cleanTag) tags.push(cleanTag);
  }

  if (rawCategoriesString) {
    const parts = rawCategoriesString.split(/[,;/]+/);
    for (const part of parts) {
      const cleanPart = part.toLowerCase().replace(/^[a-z]{2}:/, '').trim();
      if (cleanPart) tags.push(cleanPart);
    }
  }

  // Tags genéricas que NÃO devem determinar departamento
  const genericTagsToIgnore = new Set([
    'plant-based-foods-and-beverages',
    'foods-and-beverages',
    'plant-based-foods',
    'food',
    'foods',
    'groceries',
    'cereals-and-potatoes',
    'cereals-and-their-products',
    'farming-products',
    'meals',
    'snacks',
    'sweet-snacks',
    'salty-snacks'
  ]);

  const filteredTags = tags.filter(t => !genericTagsToIgnore.has(t));

  const hasTag = (terms: string[]) => {
    return filteredTags.some(tag => 
      terms.some(term => tag === term || tag.includes(term))
    );
  };

  // PRIORIDADE 1: Padaria & Panificação
  if (hasTag([
    'bread', 'breads', 'sliced-bread', 'sliced-breads', 'bakery', 'bakery-products', 'bakeries',
    'pao', 'paos', 'pães', 'paes', 'pao-de-forma', 'bolo', 'bolos', 'cake', 'cakes',
    'biscuit', 'biscuits', 'biscoito', 'biscoitos', 'bolacha', 'bolachas', 'cookie', 'cookies',
    'toast', 'toasts', 'torrada', 'torradas', 'croissant', 'croissants', 'pastry', 'pastries',
    'viennoiseries', 'panificacao', 'confeitaria'
  ])) {
    return 'Padaria';
  }

  // PRIORIDADE 2: Laticínios & Frios
  if (hasTag([
    'dairies', 'dairy', 'cheese', 'cheeses', 'milk', 'milks', 'yogurt', 'yogurts', 'butter', 'butters',
    'queijo', 'queijos', 'leite', 'leites', 'iogurte', 'iogurtes', 'manteiga', 'manteigas',
    'requeijao', 'requeijão', 'laticinio', 'laticinios', 'laticínios', 'frios', 'presunto',
    'mortadela', 'embutidos', 'cold-cuts', 'fermented-milk-products'
  ])) {
    return 'Frios & Laticínios';
  }

  // PRIORIDADE 3: Bebidas (somente tags específicas de bebidas)
  if (hasTag([
    'beverages', 'beverage', 'bebidas', 'bebida', 'soft-drinks', 'sodas', 'soda', 'carbonated-drinks',
    'waters', 'water', 'mineral-waters', 'spring-waters', 'juices', 'juice', 'fruit-juices',
    'beers', 'beer', 'lagers', 'ales', 'wines', 'wine', 'energy-drinks', 'iced-teas',
    'alcoholic-beverages', 'distilled-beverages', 'liquors', 'refrigerante', 'refrigerantes',
    'suco', 'sucos', 'agua', 'aguas', 'água', 'águas', 'cerveja', 'cervejas', 'vinho', 'vinhos',
    'energetico', 'energeticos', 'energético', 'energéticos', 'cha-gelado', 'chas-gelados',
    'chá-gelado', 'chás-gelados', 'isotonicos', 'isotônicos', 'vodka', 'whisky', 'cachaca',
    'cachaça', 'aguardente', 'boisson', 'boissons', 'drink', 'drinks'
  ])) {
    return 'Bebidas';
  }

  // PRIORIDADE 4: Limpeza & Higiene
  if (hasTag([
    'cleaning', 'cleaning-products', 'hygiene', 'personal-care', 'household-supplies',
    'detergent', 'detergents', 'dishwashing', 'bleach', 'soap', 'soaps', 'toilet-paper',
    'shampoo', 'shampoos', 'conditioner', 'toothpaste', 'mouthwash', 'limpeza', 'higiene',
    'sabonete', 'sabonetes', 'detergente', 'detergentes', 'desinfetante', 'desinfetantes',
    'amaciante', 'amaciantes', 'agua-sanitaria', 'água-sanitária', 'esponja', 'papel-higienico',
    'papel-higiênico', 'creme-dental', 'escova-dental', 'desodorante', 'absorvente', 'fraldas'
  ])) {
    return 'Limpeza & Higiene';
  }

  // PRIORIDADE 5: Hortifrúti
  if (hasTag([
    'fruits', 'fruit', 'fresh-fruits', 'vegetables', 'vegetable', 'fresh-vegetables',
    'leafy-vegetables', 'root-vegetables', 'legumes', 'legume', 'verduras', 'verdura',
    'frutas', 'fruta', 'hortalicas', 'hortaliças', 'hortifruti', 'hortifrúti',
    'tomatoes', 'tomato', 'bananas', 'banana', 'apples', 'apple', 'oranges', 'orange',
    'potatoes', 'potato', 'onions', 'onion', 'alface', 'tomate', 'batata', 'cebola',
    'maca', 'maçã', 'laranja'
  ])) {
    return 'Hortifrúti';
  }

  // PRIORIDADE 6 / Fallback: Mercearia & Grãos
  return 'Mercearia & Grãos';
}

/**
 * Consulta a API da Bluesoft Cosmos por GTIN/EAN.
 * Utiliza o comando nativo Rust no ambiente Tauri para contornar restrições de CORS e User-Agent do WebView.
 */
export async function lookupCosmos(
  cleanBarcode: string,
  token: string,
  userAgent?: string
): Promise<BarcodeLookupResult> {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    return { found: false };
  }

  const ua = userAgent?.trim() || 'MercadoPOS';

  // Se executando no Tauri nativo, usa invoke Rust
  const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window);
  if (isTauri) {
    try {
      const rawRes = await invoke<any>('lookup_cosmos_gtin', {
        gtin: cleanBarcode,
        token: trimmedToken,
        userAgent: ua
      });

      if (rawRes && rawRes.found && rawRes.name) {
        const rawDescription = rawRes.name || '';
        let brandName = rawRes.brand || '';

        let formattedName = rawDescription.replace(/\s+/g, ' ').trim();
        if (brandName && !formattedName.toLowerCase().includes(brandName.toLowerCase())) {
          formattedName = `${formattedName} ${brandName}`.trim();
        }

        if (!formattedName) return { found: false };

        const tags: string[] = [];
        if (rawRes.gpc_description) tags.push(rawRes.gpc_description);
        if (rawRes.ncm_description) tags.push(rawRes.ncm_description);
        if (Array.isArray(rawRes.categories)) {
          for (const c of rawRes.categories) {
            if (c) tags.push(String(c));
          }
        }
        tags.push(formattedName);

        const categorySuggestion = classifyCategoryFromTags(tags);

        return {
          found: true,
          name: formattedName,
          brand: brandName,
          categorySuggestion,
          source: 'COSMOS',
          ncm: rawRes.ncm_code ? String(rawRes.ncm_code) : undefined
        };
      }

      return { found: false };
    } catch (_) {
      return { found: false };
    }
  }

  // Fallback web / mock fetch para ambiente de testes e navegador
  const endpoint = `https://api.cosmos.bluesoft.com.br/gtins/${cleanBarcode}.json`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'X-Cosmos-Token': trimmedToken,
        'User-Agent': ua
      }
    });
    clearTimeout(timeoutId);

    if (res.status === 200) {
      const data = await res.json();
      if (!data) return { found: false };

      const rawDescription = data.description || '';
      let brandName = '';
      if (typeof data.brand === 'object' && data.brand?.name) {
        brandName = String(data.brand.name).trim();
      } else if (typeof data.brand === 'string') {
        brandName = data.brand.trim();
      }

      let formattedName = rawDescription.replace(/\s+/g, ' ').trim();
      if (brandName && !formattedName.toLowerCase().includes(brandName.toLowerCase())) {
        formattedName = `${formattedName} ${brandName}`.trim();
      }

      if (!formattedName) return { found: false };

      const tags: string[] = [];
      if (data.gpc?.description) tags.push(data.gpc.description);
      if (data.ncm?.description) tags.push(data.ncm.description);
      if (data.ncm?.full_description) tags.push(data.ncm.full_description);
      if (Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (typeof cat === 'string') tags.push(cat);
          else if (cat && typeof cat === 'object' && cat.name) tags.push(cat.name);
        }
      }
      tags.push(formattedName);

      const categorySuggestion = classifyCategoryFromTags(tags);
      const ncmCode = data.ncm?.code ? String(data.ncm.code) : undefined;

      return {
        found: true,
        name: formattedName,
        brand: brandName,
        categorySuggestion,
        source: 'COSMOS',
        ncm: ncmCode
      };
    }

    return { found: false };
  } catch (_) {
    return { found: false };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Consulta bases públicas do Open Food Facts com fallback (v2 + v0 Brasil)
 */
export async function lookupOpenFoodFacts(cleanBarcode: string): Promise<BarcodeLookupResult> {
  const endpoints = [
    `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json?fields=product_name,product_name_pt,brands,categories,categories_tags`,
    `https://br.openfoodfacts.org/api/v0/product/${cleanBarcode}.json`
  ];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'MercadoPOS - DesktopApp - Version 1.0'
        }
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        continue;
      }

      const data = await res.json();
      const product = data.product;
      if ((data.status === 1 || data.status_verbose === 'product found') && product) {
        const rawName = product.product_name_pt || product.product_name || '';
        const brand = product.brands || '';

        let formattedName = rawName.replace(/\s+/g, ' ').trim();
        if (brand && !formattedName.toLowerCase().includes(brand.toLowerCase())) {
          formattedName = `${formattedName} ${brand}`.trim();
        }

        if (!formattedName) continue;

        // Sugestão de categoria com base nas tags normalizadas e prioritárias
        const categorySuggestion = classifyCategoryFromTags(
          product.categories_tags || [],
          product.categories || ''
        );

        return {
          found: true,
          name: formattedName,
          brand: brand.trim(),
          categorySuggestion,
          source: 'OPEN_FOOD_FACTS'
        };
      }
    } catch (_) {
      // Ignora erro de rede/timeout e tenta o próximo endpoint
    }
  }

  return { found: false };
}

/**
 * Consulta produto por código de barras seguindo a prioridade:
 * 1. Bluesoft Cosmos (se habilitado e configurado com token)
 * 2. Open Food Facts (fallback automático)
 * 3. Não encontrado (cadastro manual)
 */
export async function lookupBarcodeInfo(
  barcode: string,
  options?: BarcodeLookupOptions
): Promise<BarcodeLookupResult> {
  const cleanBarcode = barcode.replace(/\D/g, '').trim();
  if (cleanBarcode.length < 8 || cleanBarcode.length > 14) {
    return { found: false };
  }

  // 1. Tenta Bluesoft Cosmos se habilitado e com token configurado
  const settings = useSettingsStore.getState().settings;
  const isCosmosEnabled = options?.cosmosEnabled ?? settings.cosmosEnabled;
  const cosmosToken = options?.cosmosToken ?? settings.cosmosToken;
  const cosmosUserAgent = options?.cosmosUserAgent ?? settings.cosmosUserAgent;

  if (isCosmosEnabled && cosmosToken && cosmosToken.trim()) {
    try {
      const cosmosResult = await lookupCosmos(cleanBarcode, cosmosToken, cosmosUserAgent);
      if (cosmosResult.found) {
        return cosmosResult;
      }
    } catch (_) {
      // Fallback silencioso para Open Food Facts
    }
  }

  // 2. Fallback: Open Food Facts
  try {
    const offResult = await lookupOpenFoodFacts(cleanBarcode);
    if (offResult.found) {
      return offResult;
    }
  } catch (_) {
    // Falha em ambas as bases públicas
  }

  return { found: false };
}
