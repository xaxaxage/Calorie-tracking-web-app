import { useState } from 'preact/hooks';
import type { Entry, Food, MealId } from '../lib/types';
import {
  addEntry,
  deleteEntry,
  isFavorite,
  lastAmount,
  toggleFavorite,
  updateEntry,
  useData,
} from '../lib/store';
import {
  cleanAmount,
  entriesFor,
  fmtKcal,
  macroSplit,
  macrosFor,
  oneDecimal,
  parseNumber,
  sum,
} from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { todayKey } from '../lib/dates';
import { finishFlow, goBack, href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { toastNote } from '../lib/humor';
import { MacroLabel, MealPicker, SplitBar } from '../components/Common';
import { ChevronLeft, Minus, Plus, Star } from '../components/Icons';

interface Preset {
  label: string;
  amount: number;
}

function presetsFor(food: Food, extra: (number | undefined)[]): Preset[] {
  const unit = food.unit;
  const plain = [100, food.defaultAmount, ...extra]
    .filter((n): n is number => typeof n === 'number' && n > 0)
    .map((n) => Math.round(n));
  const out: Preset[] = [];
  const seen = new Set<number>();
  for (const n of [...new Set(plain)].sort((a, b) => a - b)) {
    seen.add(n);
    out.push({ label: `${n} ${unit}`, amount: n });
  }
  for (const s of food.servings ?? []) {
    if (out.length >= 6) break;
    const n = Math.round(s.amount);
    const label = `${s.label} · ${n} ${unit}`;
    if (seen.has(n)) {
      // Name the plain preset after the serving instead of listing it twice.
      const i = out.findIndex((p) => p.amount === n);
      out[i] = { label, amount: n };
    } else {
      seen.add(n);
      out.push({ label, amount: n });
    }
  }
  return out;
}

export function FoodDetail({
  food,
  meal: initialMeal,
  date,
  amount: initialAmount,
  entry,
}: {
  food: Food;
  meal: MealId;
  date: string;
  amount?: number;
  /** When set, the screen edits this entry instead of adding a new one. */
  entry?: Entry;
}) {
  const data = useData();
  const start = cleanAmount(initialAmount ?? entry?.amount ?? lastAmount(food.id) ?? food.defaultAmount ?? 100) || 100;
  const [text, setText] = useState(String(start));
  const [meal, setMeal] = useState<MealId>(entry?.meal ?? initialMeal);
  const amount = cleanAmount(parseNumber(text));
  const fav = isFavorite(food.id);
  const unit = food.unit;

  const m = macrosFor(food, amount);
  const split = macroSplit(m);
  const goals = data.settings.goals;
  const dayOthers = entriesFor(data.entries, date).filter((e) => e.id !== entry?.id);
  const left = goals.kcal - sum(dayOthers).kcal - m.kcal;

  const setAmount = (n: number) => setText(String(cleanAmount(n)));
  const step = unit === 'ml' || amount >= 100 ? 10 : 5;

  const presets = presetsFor(food, [start, lastAmount(food.id)]);

  const save = () => {
    if (amount <= 0) return;
    const fields = {
      date,
      meal,
      name: food.name,
      amount,
      unit,
      food,
      kcal: m.kcal,
      p: m.p,
      c: m.c,
      f: m.f,
    };
    if (entry) {
      updateEntry(entry.id, fields);
      showToast('Saved', undefined, { carry: true });
      goBack(href('/', { date }));
      return;
    }
    const created = addEntry({ ...fields, source: food.id.startsWith('off:') ? 'barcode' : 'food' });
    showToast(`Added to ${MEAL_LABEL[meal]}`, { label: 'Undo', run: () => deleteEntry(created.id) }, { carry: true, note: toastNote('added') });
    finishFlow(href('/', { date }));
  };

  const remove = () => {
    if (!entry) return;
    deleteEntry(entry.id);
    const { id: _id, createdAt: _c, ...rest } = entry;
    showToast(`Removed ${entry.name}`, { label: 'Undo', run: () => addEntry(rest) }, { carry: true, note: toastNote('removed') });
    goBack(href('/', { date }));
  };

  return (
    <>
      <main class="screen with-footer">
        <header class="topbar">
          <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/add', { meal, date }))}>
            <ChevronLeft />
          </button>
          <button
            type="button"
            class={`icon-btn ink${fav ? ' fav-on' : ''}`}
            aria-pressed={fav}
            aria-label="Save to favorites"
            onClick={() => {
              toggleFavorite(food);
              showToast(fav ? 'Removed from favorites' : 'Saved to favorites', undefined, { note: fav ? undefined : toastNote('favorite') });
            }}
          >
            <Star filled={fav} />
          </button>
        </header>

        <div class="stack-4">
          <h1 class="food-title">{food.name}</h1>
          <span class="food-sub">
            {food.brand ? `${food.brand} · ` : ''}Per 100 {unit}: {fmtKcal(food.per100.kcal)} kcal · P {oneDecimal(food.per100.p)} g · C{' '}
            {oneDecimal(food.per100.c)} g · F {oneDecimal(food.per100.f)} g
          </span>
        </div>

        <section aria-label="Nutrition for this amount" class="card stack-16">
          <div class="big-kcal">
            <span class="num">{fmtKcal(m.kcal)}</span>
            <span class="unit">kcal</span>
          </div>
          <SplitBar {...split} />
          <div class="grid-3 gap-12">
            <div class="stack-2">
              <MacroLabel kind="p">Protein</MacroLabel>
              <span class="macro-value num">{oneDecimal(m.p)} g</span>
            </div>
            <div class="stack-2">
              <MacroLabel kind="c">Carbs</MacroLabel>
              <span class="macro-value num">{oneDecimal(m.c)} g</span>
            </div>
            <div class="stack-2">
              <MacroLabel kind="f">Fat</MacroLabel>
              <span class="macro-value num">{oneDecimal(m.f)} g</span>
            </div>
          </div>
        </section>

        <section class="stack-10">
          <label for="amount" class="field-label">
            Amount
          </label>
          <div class="stepper">
            <button type="button" aria-label={`Decrease by ${step} ${unit}`} onClick={() => setAmount(amount - step)}>
              <Minus />
            </button>
            <div class="input-wrap grow">
              <input
                id="amount"
                class="input strong stepper-input"
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                value={text}
                onInput={(e) => setText((e.target as HTMLInputElement).value)}
                onBlur={() => setText(String(amount))}
                onFocus={(e) => (e.target as HTMLInputElement).select()}
              />
              <span class="input-suffix">{unit}</span>
            </div>
            <button type="button" aria-label={`Increase by ${step} ${unit}`} onClick={() => setAmount(amount + step)}>
              <Plus />
            </button>
          </div>
          <div class="chips">
            {presets.map((p) => (
              <button type="button" class="pill" aria-pressed={p.amount === amount} onClick={() => setAmount(p.amount)}>
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {entry && (
          <section class="stack-8">
            <span class="field-label">Meal</span>
            <MealPicker value={meal} onChange={setMeal} />
          </section>
        )}

        <button
          type="button"
          class="link-btn left"
          disabled={amount <= 0}
          onClick={() =>
            entry
              ? navigate(href(`/entry/${encodeURIComponent(entry.id)}`, { dish: '1' }), { replace: true })
              : navigate(href('/dish', { from: food.id, amount, meal, date }), { replace: true })
          }
        >
          Make it a dish — add ingredients
        </button>

        <div class="strip">
          <span class="strip-label">{date === todayKey() ? 'Left today after this' : 'Left that day after this'}</span>
          <span class={`strip-value num${left < 0 ? ' over' : ''}`}>
            {left < 0 ? `${fmtKcal(-left)} over` : `${fmtKcal(left)} kcal`}
          </span>
        </div>
      </main>

      <div class="footer">
        <div class="footer-inner">
          {entry && (
            <button type="button" class="btn-secondary btn-danger" onClick={remove}>
              Delete
            </button>
          )}
          <button type="button" class="btn-primary" disabled={amount <= 0} onClick={save}>
            {entry ? 'Save' : `Add to ${MEAL_LABEL[meal]}`} · {fmtKcal(m.kcal)} kcal
          </button>
        </div>
      </div>
    </>
  );
}
