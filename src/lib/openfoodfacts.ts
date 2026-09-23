import type { Food, Serving } from './types';

/**
 * Open Food Facts: free, open product database with barcode lookups.
 * https://openfoodfacts.github.io/openfoodfacts-server/api/
 */

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'nutriments',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'quantity',
  'product_quantity_unit',
].join(',');

export class LookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'server',
  ) {
    super(message);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function numberOr(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function looksLiquid(p: any): boolean {
  const units = [p.serving_quantity_unit, p.product_quantity_unit].map((u) => String(u ?? '').toLowerCase());
  if (units.includes('ml') || units.includes('l') || units.includes('cl')) return true;
  return /\d\s*(ml|cl|l)\b/i.test(String(p.quantity ?? ''));
}

/** Convert an Open Food Facts product into a Food, or undefined if it lacks calories. */
export function productToFood(p: any): Food | undefined {
  if (!p || typeof p !== 'object') return undefined;
  const n = p.nutriments ?? {};
  let kcal = numberOr(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = numberOr(n['energy-kj_100g']) ?? numberOr(n['energy_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (kcal === undefined) return undefined;

  const name = String(p.product_name_en || p.product_name || p.generic_name || '').trim();
  const brand = String(p.brands ?? '').split(',')[0].trim() || undefined;
  const code = String(p.code ?? '').trim();
  const unit = looksLiquid(p) ? 'ml' : 'g';

  const servings: Serving[] = [];
  const servingQty = numberOr(p.serving_quantity);
  if (servingQty && servingQty > 0 && servingQty <= 5000) {
    const label = String(p.serving_size ?? '').trim();
    servings.push({ label: label ? `1 serving · ${label}` : `1 serving`, amount: Math.round(servingQty) });
  }

  return {
    id: code ? `off:${code}` : `off:${name.toLowerCase().replace(/\W+/g, '-')}`,
    name: name || (brand ? `${brand} product` : `Product ${code}`),
    brand,
    unit,
    barcode: code || undefined,
    per100: {
      kcal: Math.round(kcal),
      p: round1(numberOr(n['proteins_100g']) ?? 0),
      c: round1(numberOr(n['carbohydrates_100g']) ?? 0),
      f: round1(numberOr(n['fat_100g']) ?? 0),
    },
    servings,
    defaultAmount: servings[0]?.amount ?? 100,
  };
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new LookupError('No connection. Check your internet and try again.', 'offline');
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new LookupError('Open Food Facts is not responding. Try again in a moment.', 'server');
  return res.json();
}

/** Look up a barcode. Resolves to undefined when the product isn't known or has no calories. */
export async function lookupBarcode(code: string, signal?: AbortSignal): Promise<Food | undefined> {
  const clean = code.replace(/\D/g, '');
  if (!clean) return undefined;
  const json = await getJson(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`, signal);
  if (!json || json.status !== 1 || !json.product) return undefined;
  return productToFood({ code: clean, ...json.product });
}

/** Search products by name or brand. */
export async function searchProducts(query: string, signal?: AbortSignal): Promise<Food[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: '20',
    fields: FIELDS,
  });
  const json = await getJson(`${BASE}/cgi/search.pl?${params}`, signal);
  const products: any[] = Array.isArray(json?.products) ? json.products : [];
  const foods = products.map(productToFood).filter((f): f is Food => !!f && f.name.length > 0);
  const seen = new Set<string>();
  return foods.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}
