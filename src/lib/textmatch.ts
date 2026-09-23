import type { Food } from './types';
import { matchScore } from './foods';

/**
 * Free, offline "describe what you ate": splits a sentence like
 * "2 eggs, a slice of toast with butter and a latte" into parts and matches
 * each part against the food list. No AI involved, so it only knows foods
 * that are in the list, but it costs nothing and works without a connection.
 */

export interface TextMatch {
  /** The words this item came from, e.g. "a slice of toast". */
  text: string;
  food: Food;
  amount: number;
}

export interface TextMatchResult {
  matches: TextMatch[];
  unmatched: string[];
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
  couple: 2,
};

const UNICODE_FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** Units that are a weight or volume: grams (or ml) per unit. */
const MEASURES: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  ml: 1,
  cl: 10,
  l: 1000,
  oz: 28.35,
};

/** Household units, with a fallback size when the food has no matching serving. */
const HOUSEHOLD: Record<string, { key: string; grams?: number }> = {};
for (const [forms, key, grams] of [
  [['slice', 'slices'], 'slice', 30],
  [['piece', 'pieces', 'pc', 'pcs'], 'piece', undefined],
  [['cup', 'cups'], 'cup', 240],
  [['tbsp', 'tablespoon', 'tablespoons'], 'tbsp', 15],
  [['tsp', 'teaspoon', 'teaspoons'], 'tsp', 5],
  [['bowl', 'bowls'], 'bowl', 250],
  [['glass', 'glasses'], 'glass', 250],
  [['mug', 'mugs'], 'mug', 250],
  [['can', 'cans'], 'can', 330],
  [['bottle', 'bottles'], 'bottle', 330],
  [['pot', 'pots'], 'pot', 150],
  [['handful', 'handfuls'], 'handful', 30],
  [['scoop', 'scoops'], 'scoop', 30],
  [['bar', 'bars'], 'bar', 50],
  [['square', 'squares'], 'square', 10],
  [['serving', 'servings', 'portion', 'portions', 'plate', 'plates'], 'serving', undefined],
] as [string[], string, number | undefined][]) {
  for (const f of forms) HOUSEHOLD[f] = { key, grams };
}

const SIZES: Record<string, number> = { small: 0.75, medium: 1, regular: 1, large: 1.25, big: 1.25 };

const FILLER = new Set(['of', 'some', 'the', 'my', 'fresh', 'x']);

function parseQuantity(token: string): number | undefined {
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  if (token in UNICODE_FRACTIONS) return UNICODE_FRACTIONS[token];
  const frac = /^(\d+)\/(\d+)$/.exec(token);
  if (frac && Number(frac[2]) > 0) return Number(frac[1]) / Number(frac[2]);
  const n = Number(token.replace(',', '.'));
  return /^\d+([.,]\d+)?$/.test(token) && Number.isFinite(n) ? n : undefined;
}

/** Grams in one "unit" of a serving label, e.g. "2 slices" of 60 g → 30 g per slice. */
function perUnit(label: string, amount: number): number {
  const m = /^(\d+(?:[.,]\d+)?|½|¼|¾)\s/.exec(label.trim());
  const count = m ? parseQuantity(m[1]) ?? 1 : 1;
  return amount / (count || 1);
}

function servingFor(food: Food, unitKey: string | undefined): number | undefined {
  const servings = food.servings ?? [];
  if (unitKey) {
    const hit = servings.find((s) => s.label.toLowerCase().includes(unitKey));
    return hit ? perUnit(hit.label, hit.amount) : undefined;
  }
  // A plain count ("2 eggs") means individual pieces: prefer a "1 …" serving.
  const one = servings.find((s) => /^1\s/.test(s.label.trim()));
  if (one) return one.amount;
  const counted = servings.find((s) => /^\d/.test(s.label.trim()));
  return counted ? perUnit(counted.label, counted.amount) : undefined;
}

/** Singular/plural variants to try against the list ("tomatoes" → "tomato"). */
function variants(query: string): string[] {
  const words = query.split(' ');
  const forms = new Set<string>([query]);
  const strip = (w: string) => [w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ies$/, 'y')];
  for (let i = 0; i < 3; i++) {
    forms.add(words.map((w) => (w.length > 3 ? strip(w)[i] : w)).join(' '));
  }
  return [...forms].filter(Boolean);
}

function bestFood(foods: Food[], query: string): Food | undefined {
  let best: { food: Food; score: number } | undefined;
  for (const q of variants(query)) {
    for (const food of foods) {
      const score = matchScore(food, q);
      if (score > 0 && (!best || score > best.score)) best = { food, score };
    }
  }
  return best?.food;
}

/** Break a description into parts: commas, "and", "with", "plus", new lines. */
export function splitDescription(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[;+&\n]/g, ',')
    .replace(/\b(and|with|plus|then)\b/g, ',')
    .split(/[,.]\s|,/)
    .map((s) => s.replace(/[.!?]+$/, '').trim())
    .filter((s) => s.length > 0);
}

export function matchDescription(text: string, foods: Food[]): TextMatchResult {
  const matches: TextMatch[] = [];
  const unmatched: string[] = [];

  for (const part of splitDescription(text)) {
    // "200g" → "200 g", "1.5kg" → "1.5 kg"
    const tokens = part
      .replace(/(\d)([a-z]+)\b/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean);

    let qty: number | undefined;
    let measure: number | undefined;
    let household: { key: string; grams?: number } | undefined;
    let size = 1;
    let i = 0;

    // Leading quantity, possibly two parts: "half a banana", "1 1/2 cups".
    while (i < tokens.length) {
      const q = parseQuantity(tokens[i]);
      if (q === undefined) break;
      if (qty === undefined) qty = q;
      else if (q < 1 && qty >= 1) qty += q; // "1 1/2"
      else if (!(qty < 1 && q === 1)) qty *= q; // "a couple" = 2; "half a" stays ½
      i++;
    }
    for (; i < tokens.length; i++) {
      const t = tokens[i];
      if (t in SIZES) size = SIZES[t];
      else if (measure === undefined && household === undefined && t in MEASURES) measure = MEASURES[t];
      else if (measure === undefined && household === undefined && t in HOUSEHOLD) household = HOUSEHOLD[t];
      else if (!FILLER.has(t)) break;
    }
    const query = tokens
      .slice(i)
      .filter((t) => !FILLER.has(t))
      .join(' ')
      .trim();

    if (!query) {
      unmatched.push(part);
      continue;
    }
    const food = bestFood(foods, query);
    if (!food) {
      unmatched.push(part);
      continue;
    }

    const count = qty ?? 1;
    const usual = food.defaultAmount ?? 100;
    let amount: number;
    if (measure !== undefined) {
      amount = count * measure;
    } else if (household) {
      amount = count * (servingFor(food, household.key) ?? household.grams ?? usual);
    } else if (qty === undefined) {
      // No amount given ("butter"): the food's usual portion.
      amount = usual * size;
    } else {
      // A count ("2 eggs"): that many single pieces.
      amount = count * (servingFor(food, undefined) ?? usual) * size;
    }
    matches.push({ text: part, food, amount: Math.max(1, Math.round(amount)) });
  }

  return { matches, unmatched };
}
