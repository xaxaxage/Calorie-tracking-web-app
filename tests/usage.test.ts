import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const RICE = { name: 'White rice, cooked', grams: 150, kcal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 };

const reply = (usage?: object) =>
  json(200, {
    candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ items: [RICE] }) }] }, finishReason: 'STOP' }],
    ...(usage ? { usageMetadata: usage } : {}),
  });

/** A 429 shaped like Google's, with the limit that was hit and how long to wait. */
const limited = (scope: 'Day' | 'Minute', value: string, retry: string) =>
  json(429, {
    error: {
      code: 429,
      message: `You exceeded your current quota. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: ${value}\nPlease retry in ${retry}.`,
      status: 'RESOURCE_EXHAUSTED',
      details: [
        {
          '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
          violations: [
            {
              quotaMetric: 'generativelanguage.googleapis.com/generate_content_free_tier_requests',
              quotaId: `GenerateRequestsPer${scope}PerProjectPerModel-FreeTier`,
              quotaDimensions: { location: 'global', model: 'gemini-3.8-flash' },
              quotaValue: value,
            },
          ],
        },
        { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry },
      ],
    },
  });

function stubFetch(handler: (model: string, n: number) => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      const model = /models\/([^:?]+)/.exec(u)?.[1] ?? '';
      calls.push(model);
      return handler(model, calls.filter((c) => c === model).length);
    }),
  );
  return calls;
}

// A fresh module (and log) per test.
async function load() {
  vi.resetModules();
  const usage = await import('../src/lib/ai/usage');
  const gemini = await import('../src/lib/ai/gemini');
  const claude = await import('../src/lib/ai/claude');
  return { usage, gemini, claude };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reading Google's limit errors", () => {
  it('tells a daily limit from a per-minute one, with the limit and the wait', async () => {
    const { usage } = await load();
    const day = await limited('Day', '20', '38.4s').text();
    expect(usage.parseGeminiQuota(`{"error":${JSON.stringify(JSON.parse(day).error)}}`)).toEqual({ scope: 'day', limit: 20, retryAfterMs: 38400 });
    const minute = await limited('Minute', '10', '7s').text();
    expect(usage.parseGeminiQuota(minute)).toEqual({ scope: 'minute', limit: 10, retryAfterMs: 7000 });
    // Details missing: fall back to the message text, or nothing.
    expect(usage.parseGeminiQuota('{"error":{"message":"Quota exceeded, limit: 5. Please retry in 2s."}}')).toEqual({ scope: 'unknown', limit: 5, retryAfterMs: 2000 });
    expect(usage.parseGeminiQuota('Resource has been exhausted.')).toEqual({ scope: 'unknown' });
  });
});

describe("Google's day", () => {
  it('starts and resets at midnight in California, also when the clocks change', async () => {
    const { usage } = await load();
    const iso = (ts: number) => new Date(ts).toISOString();
    // 26 Sep 2026, 15:00 in California (PDT, UTC-7).
    const now = Date.parse('2026-09-26T22:00:00Z');
    expect(iso(usage.pacificDayStart(now))).toBe('2026-09-26T07:00:00.000Z');
    expect(iso(usage.nextPacificMidnight(now))).toBe('2026-09-27T07:00:00.000Z');
    // Clocks go back on 1 Nov 2026: that day is 25 hours long.
    const fallBack = Date.parse('2026-11-01T20:00:00Z');
    expect(iso(usage.pacificDayStart(fallBack))).toBe('2026-11-01T07:00:00.000Z');
    expect(iso(usage.nextPacificMidnight(fallBack))).toBe('2026-11-02T08:00:00.000Z');
    // Clocks go forward on 8 Mar 2026: 23 hours.
    const springForward = Date.parse('2026-03-08T20:00:00Z');
    expect(iso(usage.pacificDayStart(springForward))).toBe('2026-03-08T08:00:00.000Z');
    expect(iso(usage.nextPacificMidnight(springForward))).toBe('2026-03-09T07:00:00.000Z');
  });
});

describe('usage log', () => {
  it('records every Gemini request with its tokens, grouped by estimate', async () => {
    const { usage, gemini } = await load();
    stubFetch(() => reply({ promptTokenCount: 1200, candidatesTokenCount: 150, thoughtsTokenCount: 400 }));
    await gemini.estimateWithGemini('AIza', ['gemini-3.8-flash'], { kind: 'text', text: 'rice' });
    const [r] = usage.usageRecords();
    expect(r).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash', kind: 'text', outcome: 'ok', tokensIn: 1200, tokensOut: 550 });
    expect(JSON.parse(localStorage.getItem(usage.USAGE_KEY)!).records).toHaveLength(1);
  });

  it('skips a model whose daily limit is used up, until Google resets it', async () => {
    const { usage, gemini } = await load();
    const calls = stubFetch((model) => (model === 'gemini-3.8-flash' ? limited('Day', '20', '50000s') : reply()));
    const chain = ['gemini-3.8-flash', 'gemini-flash-lite-latest'];
    const first = await gemini.estimateWithGemini('AIza', chain, { kind: 'photo', image: { dataUrl: '', base64: 'AA' } });
    expect(first.model).toBe('gemini-flash-lite-latest');
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-flash-lite-latest']);
    expect(usage.usageRecords().map((r) => r.outcome)).toEqual(['day-limit', 'ok']);
    expect(new Set(usage.usageRecords().map((r) => r.op)).size).toBe(1);
    expect(usage.modelLimits('gemini-3.8-flash')).toMatchObject({ perDay: 20 });
    expect(usage.dayUsedUp('gemini-3.8-flash')).toBe(true);

    // The next estimate goes straight to the model that still has free uses.
    const progress: string[] = [];
    await gemini.estimateWithGemini('AIza', chain, { kind: 'text', text: 'rice' }, undefined, (m) => progress.push(m));
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-flash-lite-latest']);
    expect(progress[0]).toMatch(/^gemini-3.8-flash is out of free uses until .* — using gemini-flash-lite-latest…$/);

    // With every model used up, one request to the chosen one, not one to each.
    usage.noteLimit('gemini-flash-lite-latest', 'day', 1000);
    await expect(gemini.estimateWithGemini('AIza', chain, { kind: 'text', text: 'rice' })).rejects.toThrow(/used up for gemini-3.8-flash until/);
    expect(calls.slice(3)).toEqual(['gemini-3.8-flash']);

    // "Try it again now" lets it be used before the reset.
    usage.forgetDayLimit('gemini-3.8-flash');
    expect(usage.dayUsedUp('gemini-3.8-flash')).toBe(false);
  });

  it('waits out a short per-minute limit on the same model instead of switching', async () => {
    const { usage, gemini } = await load();
    const calls = stubFetch((model, n) => (model === 'gemini-3.8-flash' && n === 1 ? limited('Minute', '10', '0.2s') : reply()));
    const progress: string[] = [];
    const result = await gemini.estimateWithGemini('AIza', ['gemini-3.8-flash', 'gemini-flash-lite-latest'], { kind: 'text', text: 'rice' }, undefined, (m) =>
      progress.push(m),
    );
    expect(result.model).toBe('gemini-3.8-flash');
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash']);
    expect(progress).toEqual(['gemini-3.8-flash is at its per-minute limit — trying again in 1 s…']);
    expect(usage.usageRecords().map((r) => r.outcome)).toEqual(['minute-limit', 'ok']);
    expect(usage.modelLimits('gemini-3.8-flash')).toEqual({ perMinute: 10 });
  });

  it('moves on when the per-minute wait is long', async () => {
    const { gemini } = await load();
    const calls = stubFetch((model) => (model === 'gemini-3.8-flash' ? limited('Minute', '10', '40s') : reply()));
    await gemini.estimateWithGemini('AIza', ['gemini-3.8-flash', 'gemini-flash-lite-latest'], { kind: 'text', text: 'rice' });
    expect(calls).toEqual(['gemini-3.8-flash', 'gemini-flash-lite-latest']);
  });

  it('logs the model list separately; it does not count toward limits', async () => {
    const { usage, gemini } = await load();
    stubFetch(() => json(200, { models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedActions: ['generateContent'] }] }));
    await gemini.listGeminiModels('AIza');
    expect(usage.usageRecords()[0]).toMatchObject({ kind: 'models', outcome: 'ok' });
    expect(usage.tally(usage.usageRecords()).requests).toBe(0);
  });

  it('records Claude requests, and each retry as its own request', async () => {
    const { usage, claude } = await load();
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++;
        if (n === 1) return json(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
        return json(200, {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5',
          content: [{ type: 'text', text: JSON.stringify({ items: [RICE] }) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 900, output_tokens: 120 },
        });
      }),
    );
    const items = await claude.estimateWithClaude('sk-ant', { kind: 'text', text: 'rice', correction: { current: [], removed: [], requests: ['x'] } });
    expect(items[0].name).toBe('White rice, cooked');
    expect(n).toBe(2);
    expect(usage.usageRecords().map((r) => [r.provider, r.kind, r.outcome, r.tokensIn, r.tokensOut])).toEqual([
      ['claude', 'correction', 'busy', undefined, undefined],
      ['claude', 'correction', 'ok', 900, 120],
    ]);
  }, 10_000);

  it('summarises by day, model and estimate, and keeps 30 days', async () => {
    const { usage } = await load();
    const now = Date.now();
    const rec = (over: Partial<import('../src/lib/ai/usage').UsageRecord>) =>
      usage.recordUsage({ at: now, op: 'a', provider: 'gemini', model: 'm1', kind: 'photo', outcome: 'ok', ms: 1000, ...over });
    rec({ at: now - 40 * 86_400_000, op: 'old' });
    rec({ op: 'a', outcome: 'day-limit' });
    rec({ op: 'a', model: 'm2', tokensIn: 10, tokensOut: 5 });
    rec({ op: 'b', at: now + 1, model: 'm2', kind: 'correction' });
    expect(usage.usageRecords()).toHaveLength(3);
    expect(usage.tally(usage.usageRecords())).toEqual({ requests: 3, failed: 1, tokensIn: 10, tokensOut: 5 });
    const ops = usage.operations(usage.usageRecords());
    expect(ops.map((o) => [o.op, o.kind, o.requests.length])).toEqual([
      ['b', 'correction', 1],
      ['a', 'photo', 2],
    ]);
    expect(usage.perModelToday(usage.usageRecords(), now + 2).map((m) => [m.model, m.tally.requests])).toEqual([
      ['m2', 2],
      ['m1', 1],
    ]);
    usage.clearUsage();
    expect(usage.usageRecords()).toEqual([]);
  });
});
