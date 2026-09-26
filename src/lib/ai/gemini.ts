import { ApiError, GoogleGenAI } from '@google/genai';
import type { GeminiModelInfo } from '../types';
import {
  AiError,
  normalizeItems,
  parseJsonReply,
  PHOTO_SCHEMA,
  promptFor,
  TEXT_SCHEMA,
  withPropertyOrdering,
  type EstimatedItem,
  type EstimateInput,
} from './shared';
import {
  dayUsedUp,
  modelLimits,
  newOp,
  noteLimit,
  parseGeminiQuota,
  recordUsage,
  type QuotaInfo,
  type UsageKind,
  type UsageOutcome,
} from './usage';

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

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** When a model's used-up daily limit resets, for messages. */
function resetNote(model: string): string {
  const until = modelLimits(model).dayUsedUpUntil;
  return until && until > Date.now() ? ` until ${clock(until)}` : '';
}

function errorFor(kind: Failure, err: unknown, model: string, tried: number, quota?: QuotaInfo, modelId?: string): AiError {
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
      if (quota?.scope === 'minute') {
        return new AiError(`${model} is at its per-minute limit. Wait a minute and try again, or pick another model in Settings.`);
      }
      return new AiError(
        `The free Gemini allowance is used up for ${tried > 1 ? `all ${tried} models tried` : `${model}${modelId ? resetNote(modelId) : ''}`}. Pick another model in Settings or try later — free allowances reset daily (at midnight in California).`,
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

// The schemas with an explicit field order, which Gemini keeps.
const PHOTO_JSON_SCHEMA = withPropertyOrdering(PHOTO_SCHEMA);
const TEXT_JSON_SCHEMA = withPropertyOrdering(TEXT_SCHEMA);

/** Gemma models on the Gemini API don't take a JSON schema, so ask for JSON in the prompt instead. */
const isGemma = (model: string) => /^gemma-/i.test(model);

function jsonShape(photo: boolean): string {
  const pos = photo ? ', "x": 0.5, "y": 0.5' : '';
  const amounts = '"grams": 0, "kcal_per_100g": 0, "protein_per_100g": 0, "carbs_per_100g": 0, "fat_per_100g": 0';
  return `\n\nReply with JSON only — no other text — in exactly this shape ("components" may be empty):\n{"items": [{"name": "…", "components": [{"name": "…", ${amounts}}], ${amounts}${pos}}]}`;
}

export function usageKind(input: EstimateInput): UsageKind {
  return input.correction ? 'correction' : input.kind;
}

/** How a failed request shows up in the usage log; notes what Google said about its limits. */
function failure(err: unknown, model: string, signal?: AbortSignal): UsageOutcome {
  if (signal?.aborted) return 'cancelled';
  if (err instanceof ApiError && err.status === 429) {
    const quota = parseGeminiQuota(err.message ?? '');
    if (quota.scope !== 'unknown') noteLimit(model, quota.scope, quota.limit);
    return quota.scope === 'day' ? 'day-limit' : quota.scope === 'minute' ? 'minute-limit' : 'limit';
  }
  if (err instanceof ApiError && err.status >= 500) return 'busy';
  return 'failed';
}

async function callModel(ai: GoogleGenAI, model: string, input: EstimateInput, op: string, signal?: AbortSignal) {
  const photo = input.kind === 'photo';
  const prompt = promptFor(input) + (isGemma(model) ? jsonShape(photo) : '');
  const parts = photo
    ? [{ inlineData: { mimeType: 'image/jpeg', data: input.image.base64 } }, { text: prompt }]
    : [{ text: prompt }];

  const started = Date.now();
  const logged = { at: started, op, provider: 'gemini' as const, model, kind: usageKind(input) };
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        ...(isGemma(model)
          ? {}
          : { responseMimeType: 'application/json', responseJsonSchema: photo ? PHOTO_JSON_SCHEMA : TEXT_JSON_SCHEMA }),
        abortSignal: signal,
        httpOptions: { timeout: 90_000 },
      },
    });
  } catch (err) {
    recordUsage({ ...logged, ms: Date.now() - started, outcome: failure(err, model, signal) });
    throw err;
  }
  const meta = response.usageMetadata;
  const out = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
  const done = {
    ...logged,
    ms: Date.now() - started,
    ...(meta?.promptTokenCount ? { tokensIn: meta.promptTokenCount } : {}),
    ...(out ? { tokensOut: out } : {}),
  };
  try {
    if (response.promptFeedback?.blockReason) {
      throw new AiError('Gemini declined to analyse this. Try a different photo or wording.');
    }
    const items = normalizeItems(parseJsonReply(response.text), photo);
    recordUsage({ ...done, outcome: 'ok' });
    return items;
  } catch (err) {
    recordUsage({ ...done, outcome: 'failed' });
    throw err;
  }
}

export interface GeminiResult {
  items: EstimatedItem[];
  model: string;
}

/** Wait out a per-minute limit when Google asks for no longer than this; otherwise move on. */
const MAX_LIMIT_WAIT = 15_000;

/**
 * Try each model in turn. A busy model gets one retry, and so does one at its
 * per-minute limit, after the wait Google asks for. A model out of free uses
 * for the day is skipped until the limit resets, so it doesn't cost a failed
 * request every time; any other failure hands over to the next model.
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
  const op = newOp();
  let last: { kind: Failure; err: unknown; model: string; quota?: QuotaInfo } | undefined;

  // Models whose daily free uses are gone are left out until Google resets them. If that's
  // all of them, one request to the chosen model: the limit may have been lifted since.
  const usable = models.filter((m) => !dayUsedUp(m));
  const order = usable.length > 0 ? usable : models.slice(0, 1);
  if (usable.length > 0 && order[0] !== models[0]) {
    onProgress?.(`${labelFor(models[0])} is out of free uses${resetNote(models[0])} — using ${labelFor(order[0])}…`);
  }

  for (const [index, model] of order.entries()) {
    if (last) {
      const why = last.kind === 'quota' ? 'out of free uses' : last.kind === 'busy' ? 'busy' : 'unavailable';
      onProgress?.(`${labelFor(last.model)} is ${why} — trying ${labelFor(model)}…`);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return { items: await callModel(ai, model, input, op, signal), model };
      } catch (err) {
        if (signal?.aborted) throw err;
        const kind = classify(err);
        const quota = kind === 'quota' && err instanceof ApiError ? parseGeminiQuota(err.message ?? '') : undefined;
        console.warn(`Gemini ${model} failed (${kind}${quota ? `, ${quota.scope}` : ''})`, err);
        if (FATAL.includes(kind)) throw errorFor(kind, err, model, index + 1);
        last = { kind, err, model, quota };
        if (kind === 'busy' && attempt === 0) {
          onProgress?.(`${labelFor(model)} is busy — trying again…`);
          await wait(1500, signal);
          continue;
        }
        const pause = quota?.retryAfterMs;
        if (quota?.scope === 'minute' && attempt === 0 && pause !== undefined && pause <= MAX_LIMIT_WAIT) {
          onProgress?.(`${labelFor(model)} is at its per-minute limit — trying again in ${Math.max(1, Math.round(pause / 1000))} s…`);
          await wait(pause + 500, signal);
          continue;
        }
        break;
      }
    }
  }
  throw errorFor(last!.kind, last!.err, labelFor(last!.model), order.length, last!.quota, last!.model);
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
  const started = Date.now();
  const logged = { at: started, op: newOp(), provider: 'gemini' as const, model: 'model list', kind: 'models' as const };
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
    recordUsage({ ...logged, ms: Date.now() - started, outcome: 'ok' });
  } catch (err) {
    recordUsage({ ...logged, ms: Date.now() - started, outcome: 'failed' });
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
