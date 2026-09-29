import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LookupError, productToFood, resetSearchLimit, searchProducts } from '../src/lib/openfoodfacts';
import { isValidProductCode } from '../src/lib/scanner';
import { parseHash, href } from '../src/lib/router';
import { mealForTime, parseMeal } from '../src/lib/meals';

describe('Open Food Facts parsing', () => {
  it('reads nutrition per 100 g and the serving size', () => {
    const food = productToFood({
      code: '7394376616228',
      product_name: 'Oat drink, barista',
      brands: 'Oatly,Oatly AB',
      quantity: '1 l',
      serving_quantity: '250',
      serving_size: '250 ml',
      nutriments: { 'energy-kcal_100g': 59, proteins_100g: 1, carbohydrates_100g: 6.6, fat_100g: 3 },
    })!;
    expect(food).toMatchObject({
      id: 'off:7394376616228',
      name: 'Oat drink, barista',
      brand: 'Oatly',
      unit: 'ml',
      per100: { kcal: 59, p: 1, c: 6.6, f: 3 },
      defaultAmount: 250,
    });
    expect(food.servings?.[0].label).toBe('1 serving · 250 ml');
  });

  it('falls back to kJ and rejects products without energy', () => {
    const food = productToFood({ code: '1', product_name: 'Crackers', nutriments: { 'energy-kj_100g': 1674 } })!;
    expect(food.per100.kcal).toBe(400);
    expect(food.unit).toBe('g');
    expect(food.defaultAmount).toBe(100);
    expect(productToFood({ code: '2', product_name: 'Mystery', nutriments: {} })).toBeUndefined();
  });
});

describe('barcodes', () => {
  it('checks EAN/UPC check digits', () => {
    expect(isValidProductCode('4006381333931')).toBe(true); // EAN-13
    expect(isValidProductCode('4006381333932')).toBe(false);
    expect(isValidProductCode('96385074')).toBe(true); // EAN-8
    expect(isValidProductCode('036000291452')).toBe(true); // UPC-A
    expect(isValidProductCode('12345')).toBe(false);
  });
});

describe('routing helpers', () => {
  it('parses hash routes', () => {
    const r = parseHash('#/food/db%3Abanana?meal=lunch&date=2026-09-23');
    expect(r.segments).toEqual(['food', 'db:banana']);
    expect(r.query.get('meal')).toBe('lunch');
    expect(parseHash('').path).toBe('/');
    expect(href('/add', { meal: 'dinner', q: '', date: undefined })).toBe('/add?meal=dinner');
  });

  it('picks a meal for the time of day', () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m);
    expect(mealForTime(at(7))).toBe('breakfast');
    expect(mealForTime(at(12, 30))).toBe('lunch');
    expect(mealForTime(at(15, 30))).toBe('snack');
    expect(mealForTime(at(19))).toBe('dinner');
    expect(mealForTime(at(23))).toBe('snack');
    expect(parseMeal('dinner')).toBe('dinner');
    expect(parseMeal('brunch')).toBeUndefined();
  });
});

describe('Open Food Facts search', () => {
  const ok = (products: unknown[]) => new Response(JSON.stringify({ products }), { status: 200 });
  const oat = { code: '1', product_name: 'Oat drink', nutriments: { 'energy-kcal_100g': 59 } };

  beforeEach(() => {
    vi.useFakeTimers();
    resetSearchLimit();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('tries again when a busy reply fails like a dropped connection', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(ok([oat]));
    vi.stubGlobal('fetch', fetch);
    const found = searchProducts('oat');
    await vi.runAllTimersAsync();
    expect((await found).map((f) => f.name)).toEqual(['Oat drink']);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("says Open Food Facts isn't answering, not that you're offline", async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const found = searchProducts('oat').catch((e) => e);
    await vi.runAllTimersAsync();
    const err = await found;
    expect(err).toBeInstanceOf(LookupError);
    expect(err.kind).toBe('server');
    expect(err.message).toMatch(/isn't answering/);
  });

  it('says offline when the phone is offline, without retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const err = await searchProducts('oat').catch((e) => e);
    expect(err.kind).toBe('offline');
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it('stays under the search limit, waiting for a free minute slot', async () => {
    const fetch = vi.fn().mockImplementation(async () => ok([]));
    vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 8; i++) await searchProducts(`food ${i}`);
    expect(fetch).toHaveBeenCalledTimes(8);
    const ninth = searchProducts('food 9');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetch).toHaveBeenCalledTimes(8);
    await vi.advanceTimersByTimeAsync(30_000);
    await ninth;
    expect(fetch).toHaveBeenCalledTimes(9);
  });

  it('stops waiting when the search is cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ok([])));
    for (let i = 0; i < 8; i++) await searchProducts(`food ${i}`);
    const controller = new AbortController();
    const waiting = searchProducts('more', controller.signal).catch((e) => e);
    controller.abort();
    expect((await waiting).name).toBe('AbortError');
  });
});
