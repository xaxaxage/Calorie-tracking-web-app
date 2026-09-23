import { describe, expect, it } from 'vitest';
import { FOODS } from '../src/lib/foods';
import { matchDescription, splitDescription } from '../src/lib/textmatch';

const match = (text: string) => matchDescription(text, FOODS);
const summary = (text: string) => match(text).matches.map((m) => [m.food.name, m.amount]);

describe('describe food without AI', () => {
  it('splits a sentence into parts', () => {
    expect(splitDescription('2 eggs, a slice of toast with butter and a latte.')).toEqual([
      '2 eggs',
      'a slice of toast',
      'butter',
      'a latte',
    ]);
    expect(splitDescription('oatmeal\nbanana; coffee')).toEqual(['oatmeal', 'banana', 'coffee']);
    expect(splitDescription('1.5 cups rice')).toEqual(['1.5 cups rice']);
  });

  it('matches everyday breakfasts with sensible portions', () => {
    expect(summary('2 eggs, a slice of toast with butter and a latte')).toEqual([
      ['Egg, fried', 92],
      ['White bread', 30],
      ['Butter', 10],
      ['Caffè latte', 350],
    ]);
  });

  it('understands weights, volumes and household units', () => {
    expect(summary('200g chicken breast')).toEqual([['Chicken breast, grilled', 200]]);
    expect(summary('1.5 cups white rice')).toEqual([['White rice, cooked', 237]]);
    expect(summary('a glass of orange juice')).toEqual([['Orange juice', 250]]);
    expect(summary('2 tbsp peanut butter')).toEqual([['Peanut butter', 32]]);
    expect(summary('0.5 kg strawberries')).toEqual([['Strawberries', 500]]);
    expect(summary('330 ml cola')).toEqual([['Cola', 330]]);
  });

  it('handles counts, fractions, sizes and plurals', () => {
    expect(summary('3 bananas')).toEqual([['Banana', 354]]);
    expect(summary('half a banana')).toEqual([['Banana', 59]]);
    expect(summary('1 1/2 bagels')).toEqual([['Bagel, plain', 150]]);
    expect(summary('a large apple')).toEqual([['Apple', 228]]);
    expect(summary('two tomatoes')).toEqual([['Tomato', 246]]);
    expect(summary('a couple of cookies')).toEqual([['Chocolate chip cookie', 32]]);
    expect(summary('3 slices of wholemeal bread')).toEqual([['Wholemeal bread', 105]]);
  });

  it('uses the default portion when no amount is given', () => {
    expect(summary('greek yogurt')).toEqual([['Greek yogurt 0%', 200]]);
    expect(summary('a beer')).toEqual([['Beer', 330]]);
  });

  it('reports parts it could not match', () => {
    const r = match('banana and grandma’s mystery stew');
    expect(r.matches.map((m) => m.food.name)).toEqual(['Banana']);
    expect(r.unmatched).toEqual(['grandma’s mystery stew']);
    expect(match('   ').matches).toEqual([]);
  });
});
