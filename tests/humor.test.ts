import { beforeEach, describe, expect, it } from 'vitest';
import { dayQuip, emptyMealText, QUIPS, quip, toastNote } from '../src/lib/humor';
import { reload, updateSettings } from '../src/lib/store';

const day = { date: '2026-09-23', today: '2026-09-23', count: 0, kcal: 0, goal: 2000, proteinHit: false };
const at = (hour: number) => new Date(2026, 8, 23, hour);

function allLines(): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(QUIPS);
  return out;
}

describe('humor mode', () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it('is on by default and silent when turned off', () => {
    expect(dayQuip({ ...day, now: at(9) })).toBeTruthy();
    updateSettings({ humor: false });
    expect(dayQuip({ ...day, now: at(9) })).toBeNull();
    expect(emptyMealText('lunch', day.date)).toBe('Nothing logged yet');
    expect(toastNote('added')).toBeUndefined();
    expect(quip('footer')).toBeNull();
  });

  it('fits the remark to the day', () => {
    expect(QUIPS.emptyMorning).toContain(dayQuip({ ...day, now: at(8) }));
    expect(QUIPS.emptyNight).toContain(dayQuip({ ...day, now: at(23) }));
    expect(dayQuip({ ...day, count: 3, kcal: 2500, now: at(20) })).toMatch(/over|feast|overflowed|judgment/i);
    expect(QUIPS.onTarget).toContain(dayQuip({ ...day, count: 3, kcal: 1950, now: at(20) }));
    expect(QUIPS.proteinHit).toContain(dayQuip({ ...day, count: 3, kcal: 900, proteinHit: true, now: at(14) }));
    expect(QUIPS.pastDay).toContain(dayQuip({ ...day, date: '2026-09-20', now: at(14) }));
  });

  it('fills in the numbers', () => {
    for (let d = 1; d <= 28; d++) {
      const date = `2026-02-${String(d).padStart(2, '0')}`;
      const line = dayQuip({ ...day, date, today: date, count: 2, kcal: 500, now: at(12) })!;
      expect(line).not.toMatch(/[{}]/);
      const over = dayQuip({ ...day, date, today: date, count: 2, kcal: 2600, now: at(12) })!;
      expect(over).not.toMatch(/[{}]/);
    }
  });

  it('keeps the same remark while the day does not change', () => {
    const a = dayQuip({ ...day, count: 1, kcal: 400, now: at(12) });
    const b = dayQuip({ ...day, count: 2, kcal: 600, now: at(12) });
    expect(a?.replace(/\d+/g, '#')).toBe(b?.replace(/\d+/g, '#'));
  });

  it('adds a note to the first toast and then every third', () => {
    const notes = Array.from({ length: 7 }, () => toastNote('added', at(12)));
    expect(notes.map(Boolean)).toEqual([true, false, false, true, false, false, true]);
  });

  it('has late-night lines for late-night logging', () => {
    // Line up the counter so the next toast gets a note.
    while (toastNote('removed', at(12)) === undefined);
    toastNote('removed', at(12));
    toastNote('removed', at(12));
    expect(QUIPS.lateNight).toContain(toastNote('added', at(23)));
  });

  it('stays kind: no jokes about weight, diets or guilt', () => {
    const banned = /\b(weight|diet|guilt|cheat|lazy|fat|skinny|calories? bomb|shame|bad food|junk)\b/i;
    for (const line of allLines()) expect(line).not.toMatch(banned);
  });
});
