/**
 * Pieces shared by the AI providers: what we ask for, the JSON shape we expect
 * back, and a validator that keeps odd model output out of the log.
 */

export interface EstimatedItem {
  name: string;
  grams: number;
  per100: { kcal: number; p: number; c: number; f: number };
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

export type EstimateInput = { kind: 'photo'; image: PreparedImage } | { kind: 'text'; text: string };

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

const itemProperties = {
  name: { type: 'string', description: 'Short food name with preparation, e.g. "White rice, cooked".' },
  grams: { type: 'number', description: 'Amount of this item in grams (for drinks, 1 ml counts as 1 g).' },
  kcal_per_100g: { type: 'number' },
  protein_per_100g: { type: 'number' },
  carbs_per_100g: { type: 'number' },
  fat_per_100g: { type: 'number' },
} as const;

const baseRequired = ['name', 'grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'] as const;

export const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...itemProperties,
          x: { type: 'number', description: 'Horizontal centre of the item in the photo, 0 = left edge, 1 = right edge.' },
          y: { type: 'number', description: 'Vertical centre of the item in the photo, 0 = top edge, 1 = bottom edge.' },
        },
        required: [...baseRequired, 'x', 'y'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export const TEXT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: itemProperties,
        required: [...baseRequired],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

export const PHOTO_PROMPT = `This photo was taken by someone logging a meal in their calorie tracker. Identify each distinct food or drink in it and estimate how much is there, so they can log it.

For every item give a short, plain name including how it's prepared (like "Chicken thigh, roasted" or "Broccoli, steamed"), its estimated weight in grams, typical nutrition per 100 g for that food as prepared, and where its centre sits in the photo. Use visual cues such as plate size, cutlery and hands to judge portions. Combine mixed dishes into one item when their parts can't be told apart (for example "Lasagna"). Include visible sauces, dressings, oils and drinks when they add meaningful calories.

If there is no food or drink in the photo, return an empty list.`;

export function textPrompt(description: string): string {
  return `Someone logging food in their calorie tracker described what they ate. Turn the description into separate items they can log.

For every food or drink give a short, plain name including how it's prepared (like "Scrambled eggs" or "Latte, whole milk"), the amount in grams, and typical nutrition per 100 g for that food as prepared. Use the amounts they give, converting cups, slices, spoons and pieces to grams; where no amount is given, assume one typical portion. For drinks, count 1 ml as 1 g. Keep a named dish or product as one item unless its parts are listed separately.

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

/** Validate model output ({ items: [...] }) into items the app can log. */
export function normalizeItems(raw: unknown, withPosition: boolean): EstimatedItem[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new AiError('The estimate came back in an unexpected format. Try again.');
  return list
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => {
      const item: EstimatedItem = {
        name: String(it.name ?? '').trim().slice(0, 80),
        grams: Math.round(clamp(it.grams, 0, 5000, 0)),
        per100: {
          // Pure fat is ~900 kcal per 100 g, so anything above that is a misread.
          kcal: clamp(it.kcal_per_100g, 0, 900, 0),
          p: clamp(it.protein_per_100g, 0, 100, 0),
          c: clamp(it.carbs_per_100g, 0, 100, 0),
          f: clamp(it.fat_per_100g, 0, 100, 0),
        },
      };
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
