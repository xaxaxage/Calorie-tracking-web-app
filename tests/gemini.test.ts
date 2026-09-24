import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateWithGemini, listGeminiModels } from '../src/lib/ai/gemini';
import { geminiChain, geminiLabel } from '../src/lib/ai';
import { emptyData } from '../src/lib/store';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const reply = (items: unknown[]) =>
  json(200, { candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ items }) }] }, finishReason: 'STOP' }] });

const failure = (code: number, message: string, status: string) => json(code, { error: { code, message, status } });

const RICE = { name: 'White rice, cooked', grams: 150, kcal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 };

function stubFetch(handler: (model: string, body: any) => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url instanceof Request ? url.url : url);
      const model = /models\/([^:?]+)/.exec(u)?.[1] ?? '';
      calls.push(model);
      return handler(model, init?.body ? JSON.parse(String(init.body)) : undefined);
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Gemini model switching', () => {
  it('retries a busy model once, then moves on past busy and out-of-quota models', async () => {
    const calls = stubFetch((model) => {
      if (model === 'gemini-flash-lite-latest') return failure(503, 'The model is overloaded.', 'UNAVAILABLE');
      if (model === 'gemini-flash-latest') return failure(429, 'Resource has been exhausted.', 'RESOURCE_EXHAUSTED');
      return reply([RICE]);
    });
    const progress: string[] = [];
    const result = await estimateWithGemini(
      'AIza-test',
      ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.5-flash'],
      { kind: 'text', text: 'rice' },
      undefined,
      (m) => progress.push(m),
    );
    expect(result.model).toBe('gemini-3.5-flash');
    expect(result.items[0].name).toBe('White rice, cooked');
    expect(calls).toEqual(['gemini-flash-lite-latest', 'gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-3.5-flash']);
    expect(progress).toEqual([
      'gemini-flash-lite-latest is busy — trying again…',
      'gemini-flash-lite-latest is busy — trying gemini-flash-latest…',
      'gemini-flash-latest is out of free uses — trying gemini-3.5-flash…',
    ]);
  }, 10_000);

  it('explains when every model is overloaded', async () => {
    stubFetch(() => failure(503, 'The model is overloaded.', 'UNAVAILABLE'));
    await expect(
      estimateWithGemini('AIza-test', ['gemini-flash-lite-latest'], { kind: 'text', text: 'rice' }),
    ).rejects.toThrow(/overloaded right now/);
  }, 10_000);

  it('stops straight away on a bad key instead of trying other models', async () => {
    const calls = stubFetch(() => failure(400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT'));
    await expect(
      estimateWithGemini('bad', ['gemini-flash-lite-latest', 'gemini-flash-latest'], { kind: 'text', text: 'rice' }),
    ).rejects.toThrow(/key was not accepted/);
    expect(calls).toHaveLength(1);
  });

  it('asks Gemma models for JSON in the prompt instead of JSON mode', async () => {
    let body: any;
    stubFetch((_m, b) => {
      body = b;
      return json(200, {
        candidates: [{ content: { parts: [{ text: `Sure! Here you go:\n${JSON.stringify({ items: [RICE] })}` }] } }],
      });
    });
    const result = await estimateWithGemini('AIza-test', ['gemma-3-27b-it'], { kind: 'text', text: 'rice' });
    expect(result.items).toHaveLength(1);
    expect(body.generationConfig?.responseMimeType).toBeUndefined();
    expect(body.contents[0].parts[0].text).toContain('Reply with JSON only');
    expect(body.contents[0].parts[0].text).toMatch(/\{"name": "…", "components": \[/);
  });

  it('sends the schema with an explicit field order', async () => {
    let body: any;
    stubFetch((_m, b) => {
      body = b;
      return reply([RICE]);
    });
    await estimateWithGemini('AIza-test', ['gemini-flash-lite-latest'], { kind: 'text', text: 'rice' });
    const schema = body.generationConfig.responseJsonSchema;
    expect(schema.properties.items.items.propertyOrdering).toEqual([
      'name', 'components', 'grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g',
    ]);
  });

  it('lists usable models, newest first, without non-text ones', async () => {
    stubFetch(() =>
      json(200, {
        models: [
          { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemma-3-27b-it', displayName: 'Gemma 3 27B', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-2.5-flash-preview-tts', displayName: 'TTS', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    );
    const models = await listGeminiModels('AIza-test');
    expect(models.map((m) => m.id)).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemma-3-27b-it']);
    expect(models[0].label).toBe('Gemini 3.8 Flash');
  });
});

describe('which models to try', () => {
  const base = {
    ...emptyData().settings,
    geminiKey: 'AIza',
    geminiModels: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
      { id: 'gemini-3.8-pro', label: 'Gemini 3.8 Pro' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
      { id: 'gemma-3-27b-it', label: 'Gemma 3 27B' },
    ],
  };

  it('tries the chosen model first, then free alternatives (never Pro), up to five', () => {
    expect(geminiChain({ ...base, geminiModel: 'gemini-3.8-flash' })).toEqual([
      'gemini-3.8-flash',
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
      'gemma-3-27b-it',
    ]);
  });

  it('keeps a chosen Pro model, and only it when switching is off', () => {
    expect(geminiChain({ ...base, geminiModel: 'gemini-3.8-pro' })[0]).toBe('gemini-3.8-pro');
    expect(geminiChain({ ...base, geminiModel: 'gemini-3.8-pro', geminiAutoSwitch: false })).toEqual(['gemini-3.8-pro']);
  });

  it('names models readably', () => {
    expect(geminiLabel(base, 'gemini-flash-lite-latest')).toBe('Flash-Lite (newest)');
    expect(geminiLabel(base, 'gemini-3.8-flash')).toBe('Gemini 3.8 Flash');
    expect(geminiLabel(base, 'my-custom-model')).toBe('my-custom-model');
  });
});
