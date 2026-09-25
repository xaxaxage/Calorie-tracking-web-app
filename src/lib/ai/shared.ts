/**
 * Pieces shared by the AI providers: what we ask for, the JSON shape we expect
 * back, and a validator that keeps odd model output out of the log.
 */

export interface EstimatedPart {
  name: string;
  grams: number;
  per100: { kcal: number; p: number; c: number; f: number };
}

export interface EstimatedItem extends EstimatedPart {
  /** The main components of a composed dish; the item's grams and nutrition are their sum. */
  components?: EstimatedPart[];
  /** Position in the photo, 0–1 from the top-left (photo estimates only). */
  x?: number;
  y?: number;
}

export interface PreparedImage {
  /** Downscaled JPEG as a data URL, for display. */
  dataUrl: string;
  /** Base64 part only, for the API. */
  base64: string;
}

/** A request to fix an estimate: what it is now and what the person said is wrong. */
export interface Correction {
  /** The estimate as it stands, with the person's own changes (amounts, removed parts). */
  current: EstimatedItem[];
  /** What the person took out ("Rice", "Butter in Toast"), so it isn't put back. */
  removed: string[];
  /** What they asked to change, oldest first; the last one is new. */
  requests: string[];
}

export type EstimateInput =
  | { kind: 'photo'; image: PreparedImage; note?: string; correction?: Correction }
  | { kind: 'text'; text: string; correction?: Correction };

export const MAX_NOTE = 1000;
export const MAX_CORRECTION = 500;

/** An error whose message can be shown to the user as is. */
export class AiError extends Error {
  constructor(
    message: string,
    /** A one-tap fix the screen can offer, e.g. switching to the free provider. */
    readonly fix?: 'use-gemini',
  ) {
    super(message);
  }
}

const nutrition = {
  grams: { type: 'number', description: 'Amount in grams (for drinks, 1 ml counts as 1 g).' },
  kcal_per_100g: { type: 'number' },
  protein_per_100g: { type: 'number' },
  carbs_per_100g: { type: 'number' },
  fat_per_100g: { type: 'number' },
} as const;

const nutritionKeys = ['grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'] as const;

const name = { type: 'string', description: 'Short food name with preparation, e.g. "White rice, cooked".' } as const;

const components = {
  type: 'array',
  description: 'For a composed dish, its main components, each with its own grams and nutrition per 100 g. Empty for a single food.',
  items: {
    type: 'object',
    properties: { name, ...nutrition },
    required: ['name', ...nutritionKeys],
    additionalProperties: false,
  },
} as const;

/*
 * Models write JSON front to back, so the order of fields is the order of
 * thought: name the food, then (for a dish) its components, and only then
 * the item's total amount and nutrition — rather than committing to a total
 * first and bending the components to fit it.
 */
function itemSchema(photo: boolean) {
  const position = {
    x: { type: 'number', description: 'Horizontal centre of the item in the photo, 0 = left edge, 1 = right edge.' },
    y: { type: 'number', description: 'Vertical centre of the item in the photo, 0 = top edge, 1 = bottom edge.' },
  } as const;
  return {
    type: 'object',
    properties: { name, components, ...nutrition, ...(photo ? position : {}) },
    required: ['name', 'components', ...nutritionKeys, ...(photo ? ['x', 'y'] : [])],
    additionalProperties: false,
  } as const;
}

const listSchema = (photo: boolean) =>
  ({
    type: 'object',
    properties: { items: { type: 'array', items: itemSchema(photo) } },
    required: ['items'],
    additionalProperties: false,
  }) as const;

export const PHOTO_SCHEMA = listSchema(true);
export const TEXT_SCHEMA = listSchema(false);

/**
 * Gemini also takes an explicit field order; it's added only for Gemini, as
 * `propertyOrdering` isn't standard JSON Schema.
 */
export function withPropertyOrdering(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(withPropertyOrdering);
  if (!schema || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) out[k] = k === 'properties' ? mapValues(v, withPropertyOrdering) : withPropertyOrdering(v);
  const props = (schema as { properties?: Record<string, unknown> }).properties;
  if (props) out.propertyOrdering = Object.keys(props);
  return out;
}

const mapValues = (o: unknown, f: (v: unknown) => unknown) =>
  Object.fromEntries(Object.entries(o as Record<string, unknown>).map(([k, v]) => [k, f(v)]));

export const COMPONENTS_HINT = `When an item is a composed dish — a burger, sandwich, wrap, salad, bowl, pasta with sauce, pizza, curry, stir-fry, soup and the like — keep it as one item and list its main components in "components" (bread, patty, cheese, sauce, oil, rice, vegetables…), each with its own grams and nutrition per 100 g; the item's grams are then their total. People adjust these components afterwards, so include hidden calories such as cooking oil, butter, dressing and sauce as their own components. For a single food or a packaged product, leave "components" empty.`;

export const PHOTO_PROMPT = `This photo was taken by someone logging a meal in their calorie tracker. Identify each distinct food or drink in it and estimate how much is there, so they can log it.

For every item give a short, plain name including how it's prepared (like "Chicken thigh, roasted" or "Broccoli, steamed"), its estimated weight in grams, typical nutrition per 100 g for that food as prepared, and where its centre sits in the photo. Include visible sauces, dressings, oils and drinks when they add meaningful calories.

Judge portions against things of known size: a standard dinner plate is about 26–27 cm across, a side plate about 20 cm, a fork about 19 cm, a teaspoon about 14 cm. For drinks, estimate the volume in ml and count 1 ml as 1 g (a typical glass holds 250 ml, a mug 300 ml).

If a nutrition label is readable on a package in the photo, use its values per 100 g instead of typical ones.

Only count what belongs to this meal: ignore packaging, other people's plates and food in the background. If part of it has already been eaten, estimate what is actually there.

${COMPONENTS_HINT}

If there is no food or drink in the photo, return an empty list.`;

/** The photo prompt, with what the person wrote about it. */
export function photoPrompt(note?: string): string {
  const clean = note?.trim().slice(0, MAX_NOTE);
  if (!clean) return PHOTO_PROMPT;
  return `${PHOTO_PROMPT}

The person also wrote about this meal. Use it for what a photo can't show — how it was cooked, hidden ingredients, brands, exact amounts, what they didn't eat — and where it disagrees with what you see, go with what they wrote:
<note>
${clean}
</note>`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function partJson(p: EstimatedPart) {
  return {
    grams: r1(p.grams),
    kcal_per_100g: r1(p.per100.kcal),
    protein_per_100g: r1(p.per100.p),
    carbs_per_100g: r1(p.per100.c),
    fat_per_100g: r1(p.per100.f),
  };
}

/** The current estimate in the reply's own shape, so the model can return it with only the fixes applied. */
function estimateJson(items: EstimatedItem[], photo: boolean): string {
  const list = items.map((it) => ({
    name: it.name,
    components: (it.components ?? []).map((c) => ({ name: c.name, ...partJson(c) })),
    ...partJson(it),
    ...(photo ? { x: r1(it.x ?? 0.5), y: r1(it.y ?? 0.5) } : {}),
  }));
  return JSON.stringify({ items: list });
}

/** Asks for the estimate again with the person's correction applied. */
export function correctionPrompt(c: Correction, photo: boolean): string {
  const requests = c.requests.map((r) => r.trim().slice(0, MAX_CORRECTION)).filter(Boolean).slice(-5);
  const latest = requests[requests.length - 1] ?? '';
  const earlier = requests.slice(0, -1);
  return `

You already made an estimate for this, and the person wants something corrected. This is the estimate as it stands now, including amounts they changed themselves — keep their changes unless the correction says otherwise:
<current_estimate>
${estimateJson(c.current, photo)}
</current_estimate>${
    c.removed.length
      ? `\n\nThey removed these, so leave them out unless the correction brings them back: ${c.removed.slice(0, 30).join(', ')}.`
      : ''
  }${earlier.length ? `\n\nEarlier corrections, which still apply:\n${earlier.map((r) => `- ${r}`).join('\n')}` : ''}

Their correction:
<correction>
${latest}
</correction>

Apply the correction and return the complete updated list — every item, not only the ones that changed. Change only what the correction affects and keep everything else as it is. When they name a different food, way of cooking or amount, update that item's name, grams, nutrition per 100 g and components to match; when they mention something that isn't in the list, add it; when they say something isn't there, remove it.`;
}

/** The full prompt for a request. */
export function promptFor(input: EstimateInput): string {
  const base = input.kind === 'photo' ? photoPrompt(input.note) : textPrompt(input.text);
  return input.correction ? base + correctionPrompt(input.correction, input.kind === 'photo') : base;
}

export function textPrompt(description: string): string {
  return `Someone logging food in their calorie tracker described what they ate. Turn the description into separate items they can log.

For every food or drink give a short, plain name including how it's prepared (like "Scrambled eggs" or "Latte, whole milk"), the amount in grams, and nutrition per 100 g for that food as prepared — typical values, or the product's own values when they name a brand or product you know. Use the amounts they give, converting cups, slices, spoons and pieces to grams; where no amount is given, assume one typical portion. For drinks, count 1 ml as 1 g.

If they give a raw or dry weight ("80 g dry pasta", "200 g raw chicken"), keep that weight, use raw or dry nutrition values, and put "raw" or "dry" in the name. Otherwise take the food as eaten, and say how it's prepared in the name when it matters (like "Rice, cooked").

Something described with what's in it or on it ("pasta with pesto and chicken", "toast with butter", "salad with feta and olive oil") is one dish with those as components. Things eaten alongside each other ("soup and a bread roll", "a burger and a cola") are separate items.

${COMPONENTS_HINT}

If the text doesn't describe anything to eat or drink, return an empty list.

<description>
${description}
</description>`;
}

const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));
const clamp = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = finite(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
};

/** Drinks with alcohol have calories the macros don't show (7 kcal per gram of alcohol). */
const ALCOHOL =
  /\b(beer|ale|lager|stout|wine|prosecco|champagne|cava|cider|sake|vodka|gin|rum|whiske?y|bourbon|tequila|brandy|cognac|liqueur|cocktail|spritz|mojito|margarita|martini|negroni|sangria|mead)\b|пив|вино|вина|водк|виски|коньяк|сидр|шампанск|ликер|ликёр|коктейл/i;
/** Sweeteners and sugar alcohols count as carbs but have few calories. */
const FEW_CALORIE_CARBS = /sweetener|erythritol|xylitol|stevia|sucralose|allulose|sugar[- ]free|сахарозаменит|эритрит|стеви/i;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Make the numbers add up. Protein, carbs and fat are parts of the 100 g, so
 * together they can't be more than 100 g. Calories should match the macros
 * (4 kcal per gram of protein or carbs, 9 per gram of fat); small gaps are
 * normal (fibre, rounding), but a big one means one of the numbers is wrong,
 * and the macros are the better-grounded of the two.
 */
export function checkNutrition(name: string, per100: EstimatedPart['per100']): EstimatedPart['per100'] {
  let { kcal, p, c, f } = per100;
  const macros = p + c + f;
  if (macros > 100) {
    const k = 100 / macros;
    [p, c, f] = [round1(p * k), round1(c * k), round1(f * k)];
  }
  const fromMacros = 4 * p + 4 * c + 9 * f;
  if (fromMacros > 0) {
    const gap = kcal - fromMacros;
    const tooHigh = gap > 25 && kcal > fromMacros * 1.3 && !ALCOHOL.test(name);
    const tooLow = -gap > 25 && kcal < fromMacros * 0.7 && !FEW_CALORIE_CARBS.test(name);
    if (kcal <= 0 || tooHigh || tooLow) kcal = Math.min(900, Math.round(fromMacros));
  }
  return { kcal, p, c, f };
}

function normalizePart(it: Record<string, unknown>): EstimatedPart {
  const name = String(it.name ?? '').trim().slice(0, 80);
  return {
    name,
    grams: Math.round(clamp(it.grams, 0, 5000, 0)),
    per100: checkNutrition(name, {
      // Pure fat is ~900 kcal per 100 g, so anything above that is a misread.
      kcal: clamp(it.kcal_per_100g, 0, 900, 0),
      p: clamp(it.protein_per_100g, 0, 100, 0),
      c: clamp(it.carbs_per_100g, 0, 100, 0),
      f: clamp(it.fat_per_100g, 0, 100, 0),
    }),
  };
}

const isRecord = (it: unknown): it is Record<string, unknown> => !!it && typeof it === 'object';

/** Validate model output ({ items: [...] }) into items the app can log. */
export function normalizeItems(raw: unknown, withPosition: boolean): EstimatedItem[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new AiError('The estimate came back in an unexpected format. Try again.');
  return list
    .filter(isRecord)
    .map((it) => {
      const item: EstimatedItem = normalizePart(it);
      const parts = (Array.isArray(it.components) ? it.components : [])
        .filter(isRecord)
        .map(normalizePart)
        .filter((c) => c.name && c.grams > 0)
        .slice(0, 15);
      // A dish is the sum of its parts; one part alone is just the food.
      const grams = parts.reduce((t, c) => t + c.grams, 0);
      if (parts.length >= 2 && grams > 0) {
        const per = (k: keyof EstimatedPart['per100']) =>
          Math.round((parts.reduce((t, c) => t + (c.per100[k] * c.grams) / 100, 0) * 1000) / grams) / 10;
        item.components = parts;
        item.grams = grams;
        item.per100 = { kcal: per('kcal'), p: per('p'), c: per('c'), f: per('f') };
      }
      if (withPosition) {
        item.x = clamp(it.x, 0, 1, 0.5);
        item.y = clamp(it.y, 0, 1, 0.5);
      }
      return item;
    })
    .filter((it) => it.name.length > 0)
    .slice(0, 20);
}

/** Parse a JSON reply, tolerating a code fence or a sentence around the JSON object. */
export function parseJsonReply(text: string | undefined): unknown {
  if (!text) throw new AiError('The estimate came back empty. Try again.');
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new AiError('The estimate came back incomplete. Try again.');
  }
}

const MAX_EDGE = 1568;

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AiError('That photo could not be opened. Try a JPEG or PNG image.'));
    };
    img.src = url;
  });
}

/** Shrink a camera photo so it uploads quickly and fits the APIs' image limits. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AiError('Your browser could not process the photo.');
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}
