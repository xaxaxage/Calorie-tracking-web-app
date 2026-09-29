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

/** Open Food Facts allows 10 searches a minute; stay under that, retries included. */
const SEARCHES_PER_MINUTE = 8;
const searchTimes: number[] = [];
/** Pauses before trying again when Open Food Facts doesn't answer. */
const RETRY_DELAYS = [1500, 4000];

const stopped = (signal: AbortSignal) => signal.reason ?? new DOMException('Aborted', 'AbortError');

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(stopped(signal));
    const stop = () => {
      clearTimeout(timer);
      reject(stopped(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', stop);
      resolve();
    }, ms);
    signal?.addEventListener('abort', stop, { once: true });
  });
}

/** Wait for a free search under the per-minute limit, then take it. */
async function searchSlot(signal?: AbortSignal): Promise<void> {
  for (;;) {
    const t = Date.now();
    while (searchTimes.length && t - searchTimes[0] >= 60_000) searchTimes.shift();
    if (searchTimes.length < SEARCHES_PER_MINUTE) {
      searchTimes.push(t);
      return;
    }
    await wait(searchTimes[0] + 60_000 - t, signal);
  }
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/**
 * Fetch JSON from Open Food Facts, trying again when it doesn't answer. Its
 * busy replies (503) carry no CORS header, so in a browser they fail like a
 * dropped connection; only the browser's own online flag tells them apart.
 */
async function getJson(url: string, signal?: AbortSignal, search = false): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    if (search) await searchSlot(signal);
    let res: Response | undefined;
    try {
      res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    } catch (err) {
      if (signal?.aborted) throw err;
    }
    if (res?.status === 404) return null;
    if (res?.ok) return res.json();
    if (offline()) throw new LookupError('No connection. Check your internet and try again.', 'offline');
    const busy = !res || res.status === 429 || res.status >= 500;
    if (!busy || attempt >= RETRY_DELAYS.length) {
      throw new LookupError("Open Food Facts isn't answering right now — it's often overloaded lately. Try again in a minute.", 'server');
    }
    await wait(RETRY_DELAYS[attempt], signal);
  }
}

/** For tests: forget the searches made so far. */
export function resetSearchLimit() {
  searchTimes.length = 0;
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
  const json = await getJson(`${BASE}/cgi/search.pl?${params}`, signal, true);
  const products: any[] = Array.isArray(json?.products) ? json.products : [];
  const foods = products.map(productToFood).filter((f): f is Food => !!f && f.name.length > 0);
  const seen = new Set<string>();
  return foods.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}
