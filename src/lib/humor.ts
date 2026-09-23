import { useEffect, useState } from 'preact/hooks';
import type { MealId } from './types';
import { getData } from './store';

/**
 * Humor mode: small, kind remarks in places people glance at anyway, in the
 * spirit of playful loading screens. Never about weight or "bad" food, and
 * never in the way: when humor is off (Settings → Appearance) every function
 * here returns the plain text or nothing.
 *
 * Remarks are picked from a seed (the day, the screen) rather than at random
 * on each render, so a line stays put instead of flickering as the app updates.
 */

export function humorOn(): boolean {
  return getData().settings.humor;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(pool: readonly T[], seed: string): T {
  return pool[hash(seed) % pool.length];
}

const fill = (line: string, values: Record<string, string | number>) =>
  line.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''));

export const QUIPS = {
  emptyMorning: [
    'Breakfast is loading… please insert food.',
    'Fresh day, empty plate, infinite potential.',
    "Black coffee doesn't count. A latte, however…",
    'Good morning! The ring is hungry for data.',
  ],
  emptyMidday: [
    "Nothing logged yet. Photosynthesis doesn't count.",
    "It's quiet. Too quiet.",
    'Lunch plans? The + button is listening.',
  ],
  emptyEvening: [
    "Nothing logged. Either you forgot, or you're running on pure vibes.",
    'The ring is feeling a little empty. Relatable.',
    'Empty log, full potential. Dinner awaits.',
  ],
  emptyNight: [
    'Late-night check-in. The fridge light is watching.',
    'Burning the midnight oil? Oil is 884 kcal per 100 g, just saying.',
    'Tomorrow-you will appreciate today-you logging stuff.',
  ],
  progress: [
    'Fuel level: {pct}%. Engines warming up.',
    "{left} kcal to go. Pace yourself, it's not a speedrun.",
    'So far so good. The spreadsheet gods are pleased.',
    'Progress bar go brrr.',
  ],
  onTarget: [
    "Right on target. Chef's kiss.",
    'Goal reached. The ring is complete, and Sauron is taking notes.',
    'Bullseye. Robin Hood would like a word.',
    'Nailed it. Nutritionists love this one simple trick: logging.',
  ],
  over: [
    "Over by {over} kcal. Calories don't read calendars — tomorrow's a fresh ring.",
    'Over the goal, under zero judgment.',
    'The ring overflowed. Happens to the best of us.',
    'A feast was had. No notes.',
  ],
  proteinHit: [
    'Protein goal smashed. Your muscles sent a thank-you note.',
    'Protein: done. Somewhere, a gym bro sheds a single proud tear.',
  ],
  pastDay: [
    'Time travel mode. Try not to step on any butterflies.',
    'Editing the past? Bold. Historians will be confused.',
    'Revisiting the past. The ring remembers everything.',
  ],
  added: [
    'Nom recorded.',
    'Future you says thanks.',
    'Logged faster than you can say “quinoa”.',
    'Into the log it goes.',
    'Data: delicious.',
  ],
  lateNight: ["Midnight snack? Your secret's safe here.", 'Night owl snack, logged. Hoot hoot.'],
  removed: ['Poof. Like it never happened.', 'Un-eaten. If only it were that easy.', 'Gone. The ring forgets.'],
  favorite: ['A classic in the making.', 'Hall of fame material.', 'Certified comfort food.'],
  loadingPhoto: [
    'Counting sesame seeds…',
    'Squinting at pixels…',
    'Estimating portions with advanced eyeballing…',
    'Asking the sandwich politely…',
    'Consulting the snack oracle…',
    'Reticulating spaghetti…',
    'Converting deliciousness to numbers…',
  ],
  loadingText: [
    'Translating “a handful” into grams…',
    'Decoding “a bit of”…',
    'Consulting the snack oracle…',
    'Reticulating spaghetti…',
    'Converting deliciousness to numbers…',
    'Weighing it on our imaginary scale…',
  ],
  noResults: ["Nothing matches. Either it's very exotic or a typo — both are valid."],
  noOnline: ["Even the internet hasn't heard of that one. Try a simpler name?"],
  noFoodInPhoto: ['We looked hard. No food, just vibes.', "Lovely photo. Sadly, we can't count calories in vibes."],
  scanHint: ["Barcodes are shy. Hold steady and they'll come around."],
  footer: ['No calories were harmed in the making of this app.', 'Made with 0 kcal of love.'],
  meal: {
    breakfast: ['The most important meal, allegedly', 'Rise and dine', 'Toast is on standby'],
    lunch: ['Lunch break pending', 'Sandwich slot available', 'The midday munch awaits'],
    dinner: ['Dinner TBD', 'The main event, coming soon', "Chef's table: reserved"],
    snack: ['Snack slot is open for business', 'Snack attack pending', 'Crunch time, whenever you are'],
  } as Record<MealId, string[]>,
};

export interface DayState {
  date: string;
  today: string;
  count: number;
  kcal: number;
  goal: number;
  proteinHit: boolean;
  now?: Date;
}

/** The Today screen's remark, or null when humor is off. */
export function dayQuip(s: DayState): string | null {
  if (!humorOn()) return null;
  const hour = (s.now ?? new Date()).getHours();
  const seed = (kind: string) => `${s.date}:${kind}`;
  if (s.date !== s.today) return pick(QUIPS.pastDay, seed('past'));
  if (s.count === 0) {
    const part = hour < 5 || hour >= 22 ? 'Night' : hour < 11 ? 'Morning' : hour < 17 ? 'Midday' : 'Evening';
    return pick(QUIPS[`empty${part}`], seed(`empty${part}`));
  }
  const ratio = s.goal > 0 ? s.kcal / s.goal : 0;
  const values = {
    pct: Math.round(ratio * 100),
    left: Math.max(0, Math.round(s.goal - s.kcal)),
    over: Math.max(0, Math.round(s.kcal - s.goal)),
  };
  if (ratio > 1.05) return fill(pick(QUIPS.over, seed('over')), values);
  if (ratio >= 0.9) return pick(QUIPS.onTarget, seed('target'));
  if (s.proteinHit) return pick(QUIPS.proteinHit, seed('protein'));
  return fill(pick(QUIPS.progress, seed('progress')), values);
}

/** Subtitle for a meal with nothing in it. */
export function emptyMealText(meal: MealId, date: string): string {
  return humorOn() ? pick(QUIPS.meal[meal], `${date}:${meal}`) : 'Nothing logged yet';
}

let toastCount = 0;

/**
 * A remark to show under a toast: on the first toast and every third one
 * after, so it stays a surprise rather than a habit.
 */
export function toastNote(kind: 'added' | 'removed' | 'favorite', now = new Date()): string | undefined {
  if (!humorOn()) return undefined;
  const n = toastCount++;
  if (n % 3 !== 0) return undefined;
  const hour = now.getHours();
  const pool = kind === 'added' && (hour >= 23 || hour < 4) ? QUIPS.lateNight : QUIPS[kind];
  return pick(pool, `${now.toDateString()}:${kind}:${n}`);
}

type OneLiner = 'noResults' | 'noOnline' | 'noFoodInPhoto' | 'scanHint' | 'footer';

export function quip(kind: OneLiner, seed = new Date().toDateString()): string | null {
  return humorOn() ? pick(QUIPS[kind], `${kind}:${seed}`) : null;
}

/** A rotating line to show while the AI works, or null when humor is off. */
export function useLoadingQuip(active: boolean, kind: 'photo' | 'text'): string | null {
  const [i, setI] = useState(() => Math.floor(Math.random() * 100));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setI((n) => n + 1), 2600);
    return () => clearInterval(t);
  }, [active]);
  if (!active || !humorOn()) return null;
  const pool = kind === 'photo' ? QUIPS.loadingPhoto : QUIPS.loadingText;
  return pool[i % pool.length];
}
