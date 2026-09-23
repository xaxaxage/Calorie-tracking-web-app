import { describe, expect, it } from 'vitest';
import { productToFood } from '../src/lib/openfoodfacts';
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
