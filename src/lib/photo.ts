import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';

/**
 * Photo estimates with Claude. The request goes straight from the phone to the
 * Anthropic API using the user's own API key — there is no server in between.
 * This module is loaded on demand so the SDK stays out of the main bundle.
 */

export const PHOTO_MODEL = 'claude-opus-5';

export interface PhotoItem {
  name: string;
  grams: number;
  per100: { kcal: number; p: number; c: number; f: number };
  /** Position of the item in the photo, 0–1 from the top-left. */
  x: number;
  y: number;
}

export class PhotoError extends Error {}

const SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short food name with preparation, e.g. "White rice, cooked".' },
          grams: { type: 'number', description: 'Estimated weight of this item on the plate, in grams.' },
          kcal_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
          x: { type: 'number', description: 'Horizontal centre of the item in the photo, 0 = left edge, 1 = right edge.' },
          y: { type: 'number', description: 'Vertical centre of the item in the photo, 0 = top edge, 1 = bottom edge.' },
        },
        required: [
          'name',
          'grams',
          'kcal_per_100g',
          'protein_per_100g',
          'carbs_per_100g',
          'fat_per_100g',
          'x',
          'y',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

const PROMPT = `This photo was taken by someone logging a meal in their calorie tracker. Identify each distinct food or drink in it and estimate how much is there, so they can log it.

For every item give a short, plain name including how it's prepared (like "Chicken thigh, roasted" or "Broccoli, steamed"), its estimated weight in grams, typical nutrition per 100 g for that food as prepared, and where its centre sits in the photo. Use visual cues such as plate size, cutlery and hands to judge portions. Combine mixed dishes into one item when their parts can't be told apart (for example "Lasagna"). Include visible sauces, dressings, oils and drinks when they add meaningful calories.

If there is no food or drink in the photo, return an empty list.`;

const MAX_EDGE = 1568;

export interface PreparedImage {
  /** Downscaled JPEG as a data URL, for display. */
  dataUrl: string;
  /** Base64 part only, for the API. */
  base64: string;
}

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
      reject(new PhotoError('That photo could not be opened. Try a JPEG or PNG image.'));
    };
    img.src = url;
  });
}

/** Shrink a camera photo so it uploads quickly and fits the API's image limits. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoError('Your browser could not process the photo.');
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0.5));
const nonNeg = (n: number) => Math.max(0, Number.isFinite(n) ? n : 0);

export async function estimateFromPhoto(apiKey: string, image: PreparedImage, signal?: AbortSignal): Promise<PhotoItem[]> {
  const client = new Anthropic({
    apiKey,
    // The key belongs to the person using this app and never leaves their device except to call the API.
    dangerouslyAllowBrowser: true,
    timeout: 120_000,
    maxRetries: 1,
  });

  let message;
  try {
    message = await client.beta.messages.parse(
      {
        model: PHOTO_MODEL,
        max_tokens: 16000,
        // If the model declines, the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image.base64 } },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      },
      { signal },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new PhotoError('Your Anthropic API key was not accepted. Check it in Settings.');
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      throw new PhotoError('Your API key does not have access to this model. Check your Anthropic account.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new PhotoError('Too many requests right now. Wait a minute and try again.');
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new PhotoError(`The photo could not be analysed: ${err.message}`);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new PhotoError('No connection to Anthropic. Check your internet and try again.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new PhotoError(`Anthropic returned an error (${err.status ?? 'unknown'}). Try again in a moment.`);
    }
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    throw new PhotoError('This photo could not be analysed. Try another photo or add the food manually.');
  }
  const parsed = message.parsed_output;
  if (!parsed) {
    throw new PhotoError('The estimate came back incomplete. Try again.');
  }

  return parsed.items
    .filter((it) => it.name.trim())
    .map((it) => ({
      name: it.name.trim(),
      grams: Math.round(nonNeg(it.grams)),
      per100: {
        kcal: nonNeg(it.kcal_per_100g),
        p: nonNeg(it.protein_per_100g),
        c: nonNeg(it.carbs_per_100g),
        f: nonNeg(it.fat_per_100g),
      },
      x: clamp01(it.x),
      y: clamp01(it.y),
    }));
}
