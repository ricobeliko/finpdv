export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  brand?: string;
  categorySuggestion?: string;
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

        // Sugestão de categoria com base nas tags normalizadas e prioritárias
        const categorySuggestion = classifyCategoryFromTags(
          product.categories_tags || [],
          product.categories || ''
        );

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
