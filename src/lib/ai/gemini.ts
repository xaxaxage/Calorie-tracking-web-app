import { ApiError, GoogleGenAI } from '@google/genai';
import type { GeminiModelInfo } from '../types';
import {
  AiError,
  normalizeItems,
  parseJsonReply,
  PHOTO_PROMPT,
  PHOTO_SCHEMA,
  TEXT_SCHEMA,
  textPrompt,
  type EstimatedItem,
  type EstimateInput,
} from './shared';

/**
 * Estimates with Google Gemini. Gemini API keys from Google AI Studio come
 * with a free daily allowance per model, which makes this the no-cost AI
 * option. Requests go straight from the phone to Google. Loaded on demand.
 */

type Failure = 'busy' | 'quota' | 'unsupported' | 'key' | 'location' | 'network' | 'other';

function classify(err: unknown): Failure {
  if (err instanceof ApiError) {
    const msg = err.message ?? '';
    if (/api key not valid|API_KEY_INVALID|api key expired/i.test(msg)) return 'key';
    if (/location is not supported/i.test(msg)) return 'location';
    if (err.status === 429) return 'quota';
    if (err.status >= 500) return 'busy';
    if (err.status === 403) return 'key';
    if (err.status === 404) return 'unsupported';
    if (/not (supported|enabled|found)|unsupported|does not support|json mode/i.test(msg)) return 'unsupported';
    return 'other';
  }
  // A malformed or empty reply from one model: another model may do better.
  if (err instanceof AiError) return 'unsupported';
  return 'network';
}

const FATAL: Failure[] = ['key', 'location', 'network'];

function errorFor(kind: Failure, err: unknown, model: string, tried: number): AiError {
  switch (kind) {
    case 'key':
      return new AiError('Your Gemini API key was not accepted. Check it in Settings, or create a new one in Google AI Studio.');
    case 'location':
      return new AiError("Google's Gemini API isn't available in your country, so this key can't be used here.");
    case 'network':
      return new AiError('No connection to Google. Check your internet and try again.');
    case 'busy':
      return new AiError(
        `Gemini is overloaded right now${tried > 1 ? ` (tried ${tried} models)` : ''}. Try again in a minute, or use Match from food list.`,
      );
    case 'quota':
      return new AiError(
        `The free Gemini allowance is used up for ${tried > 1 ? `all ${tried} models tried` : model}. Pick another model in Settings or try later — free allowances reset daily.`,
      );
    case 'unsupported':
      return new AiError(
        err instanceof AiError && tried === 1
          ? err.message
          : `${tried > 1 ? 'None of the models tried' : model} can do this right now. Pick a different model in Settings.`,
      );
    default:
      return new AiError(`Gemini could not process this (${(err as ApiError)?.status ?? 'error'}). Try again.`);
  }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/** Gemma models on the Gemini API don't take a JSON schema, so ask for JSON in the prompt instead. */
const isGemma = (model: string) => /^gemma-/i.test(model);

function jsonShape(photo: boolean): string {
  const pos = photo ? ', "x": 0.5, "y": 0.5' : '';
  return `\n\nReply with JSON only — no other text — in exactly this shape:\n{"items": [{"name": "…", "grams": 0, "kcal_per_100g": 0, "protein_per_100g": 0, "carbs_per_100g": 0, "fat_per_100g": 0${pos}}]}`;
}

async function callModel(ai: GoogleGenAI, model: string, input: EstimateInput, signal?: AbortSignal) {
  const photo = input.kind === 'photo';
  const prompt = (photo ? PHOTO_PROMPT : textPrompt(input.text)) + (isGemma(model) ? jsonShape(photo) : '');
  const parts = photo
    ? [{ inlineData: { mimeType: 'image/jpeg', data: input.image.base64 } }, { text: prompt }]
    : [{ text: prompt }];

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: {
      ...(isGemma(model)
        ? {}
        : { responseMimeType: 'application/json', responseJsonSchema: photo ? PHOTO_SCHEMA : TEXT_SCHEMA }),
      abortSignal: signal,
      httpOptions: { timeout: 90_000 },
    },
  });
  if (response.promptFeedback?.blockReason) {
    throw new AiError('Gemini declined to analyse this. Try a different photo or wording.');
  }
  return normalizeItems(parseJsonReply(response.text), photo);
}

export interface GeminiResult {
  items: EstimatedItem[];
  model: string;
}

/**
 * Try each model in turn. A busy model gets one retry; a model that is busy,
 * out of free uses or can't handle the request hands over to the next one.
 */
export async function estimateWithGemini(
  apiKey: string,
  models: string[],
  input: EstimateInput,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
  labelFor: (model: string) => string = (m) => m,
): Promise<GeminiResult> {
  const ai = new GoogleGenAI({ apiKey });
  let last: { kind: Failure; err: unknown; model: string } | undefined;

  for (const [index, model] of models.entries()) {
    if (last) {
      const why = last.kind === 'quota' ? 'out of free uses' : last.kind === 'busy' ? 'busy' : 'unavailable';
      onProgress?.(`${labelFor(last.model)} is ${why} — trying ${labelFor(model)}…`);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { items: await callModel(ai, model, input, signal), model };
      } catch (err) {
        if (signal?.aborted) throw err;
        const kind = classify(err);
        console.warn(`Gemini ${model} failed (${kind})`, err);
        if (FATAL.includes(kind)) throw errorFor(kind, err, model, index + 1);
        last = { kind, err, model };
        if (kind === 'busy' && attempt === 0) {
          onProgress?.(`${labelFor(model)} is busy — trying again…`);
          await wait(1500, signal);
          continue;
        }
        break;
      }
    }
  }
  throw errorFor(last!.kind, last!.err, labelFor(last!.model), models.length);
}

const EXCLUDE = /(embedding|tts|image|live|audio|robotics|computer-use|aqa|veo|imagen|lyria|learnlm)/i;

function version(id: string): number {
  const m = /^(?:gemini|gemma)-(\d+(?:\.\d+)?)/i.exec(id);
  return m ? Number(m[1]) : 0;
}

/** Models this key can use to generate text, newest first (Gemini before Gemma). */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const ai = new GoogleGenAI({ apiKey });
  const found: GeminiModelInfo[] = [];
  try {
    const pager = await ai.models.list({ config: { pageSize: 200 } });
    for await (const m of pager) {
      const id = (m.name ?? '').replace(/^models\//, '');
      const actions = m.supportedActions ?? [];
      if (!/^(gemini|gemma)-/i.test(id) || EXCLUDE.test(id)) continue;
      if (actions.length > 0 && !actions.includes('generateContent')) continue;
      found.push({ id, label: m.displayName?.trim() || id });
      if (found.length >= 100) break;
    }
  } catch (err) {
    const kind = classify(err);
    if (kind === 'unsupported' || kind === 'other' || kind === 'busy' || kind === 'quota') {
      throw new AiError('Google did not return the model list. Try again in a moment.');
    }
    throw errorFor(kind, err, '', 1);
  }
  return found.sort((a, b) => {
    const fam = Number(/^gemma/i.test(a.id)) - Number(/^gemma/i.test(b.id));
    return fam || version(b.id) - version(a.id) || a.id.localeCompare(b.id);
  });
}
