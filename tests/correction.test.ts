import { afterEach, describe, expect, it, vi } from 'vitest';
import { correctionPrompt, PHOTO_PROMPT, photoPrompt, promptFor, textPrompt, type Correction } from '../src/lib/ai/shared';
import { estimateWithClaude } from '../src/lib/ai/claude';

const rice = { name: 'White rice, cooked', grams: 180, per100: { kcal: 130, p: 2.7, c: 28.04, f: 0.3 }, x: 0.712, y: 0.35 };
const toast = {
  name: 'Toast with butter',
  grams: 60,
  per100: { kcal: 247, p: 13, c: 41, f: 3.4 },
  components: [{ name: 'Wholemeal bread', grams: 60, per100: { kcal: 247, p: 13, c: 41, f: 3.4 } }],
};
const image = { dataUrl: 'data:image/jpeg;base64,AAAA', base64: 'AAAA' };

const between = (text: string, tag: string) => new RegExp(`<${tag}>\\n(.*)\\n</${tag}>`, 's').exec(text)?.[1];

describe('photo with a note', () => {
  it('adds what the person wrote, trusting it over the photo', () => {
    expect(photoPrompt()).toBe(PHOTO_PROMPT);
    expect(photoPrompt('   ')).toBe(PHOTO_PROMPT);
    const p = photoPrompt('  fried in butter, I ate half  ');
    expect(p.startsWith(PHOTO_PROMPT)).toBe(true);
    expect(between(p, 'note')).toBe('fried in butter, I ate half');
    expect(p).toMatch(/go with what they wrote/);
    expect(between(photoPrompt('x'.repeat(5000)), 'note')).toHaveLength(1000);
  });
});

describe('correcting an estimate', () => {
  const c: Correction = { current: [rice, toast], removed: ['Butter in Toast with butter', 'Broccoli'], requests: ['brown rice', '150 g of it'] };

  it('sends the current estimate in the reply shape, with what was removed and every correction', () => {
    const p = correctionPrompt(c, true);
    const current = JSON.parse(between(p, 'current_estimate')!);
    expect(current.items[0]).toEqual({
      name: 'White rice, cooked',
      components: [],
      grams: 180,
      kcal_per_100g: 130,
      protein_per_100g: 2.7,
      carbs_per_100g: 28,
      fat_per_100g: 0.3,
      x: 0.7,
      y: 0.4,
    });
    expect(current.items[1].components).toEqual([
      { name: 'Wholemeal bread', grams: 60, kcal_per_100g: 247, protein_per_100g: 13, carbs_per_100g: 41, fat_per_100g: 3.4 },
    ]);
    expect(p).toMatch(/They removed these.*: Butter in Toast with butter, Broccoli\./);
    expect(p).toMatch(/Earlier corrections, which still apply:\n- brown rice\n/);
    expect(between(p, 'correction')).toBe('150 g of it');
    expect(p).toMatch(/complete updated list/);
  });

  it('leaves out photo positions for text, and empty sections', () => {
    const p = correctionPrompt({ current: [rice], removed: [], requests: ['only half'] }, false);
    expect(JSON.parse(between(p, 'current_estimate')!).items[0].x).toBeUndefined();
    expect(p).not.toMatch(/removed these|Earlier corrections/);
  });

  it('keeps only the last five corrections, each within the length limit', () => {
    const many = Array.from({ length: 8 }, (_, i) => `fix ${i} ${'!'.repeat(i === 7 ? 900 : 0)}`);
    const p = correctionPrompt({ current: [rice], removed: [], requests: many }, false);
    expect(p).not.toMatch(/- fix 2\n/);
    expect(p).toMatch(/- fix 3\n/);
    expect(p).toMatch(/- fix 6\n/);
    expect(between(p, 'correction')).toHaveLength(500);
  });

  it('builds on the original request', () => {
    const text = promptFor({ kind: 'text', text: '2 eggs', correction: c });
    expect(text.startsWith(textPrompt('2 eggs'))).toBe(true);
    const photo = promptFor({ kind: 'photo', image, note: 'no oil', correction: c });
    expect(photo.startsWith(photoPrompt('no oil'))).toBe(true);
    expect(photo).toMatch(/<correction>/);
    expect(promptFor({ kind: 'photo', image })).toBe(PHOTO_PROMPT);
  });
});

describe('Claude request', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the photo with the note and the correction in one message', async () => {
    let body: any;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        body = JSON.parse(init.body as string);
        return new Response(
          JSON.stringify({
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            model: 'claude-opus-5',
            content: [{ type: 'text', text: JSON.stringify({ items: [] }) }],
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: { input_tokens: 1, output_tokens: 1 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    await estimateWithClaude('sk-ant-test', { kind: 'photo', image, note: 'no oil', correction: { current: [rice], removed: [], requests: ['brown'] } });
    expect(body.messages).toHaveLength(1);
    const [img, text] = body.messages[0].content;
    expect(img).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
    expect(between(text.text, 'note')).toBe('no oil');
    expect(between(text.text, 'correction')).toBe('brown');
  });
});
