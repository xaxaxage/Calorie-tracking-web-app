import { useState } from 'preact/hooks';
import type { Entry, MealId } from '../lib/types';
import { addEntry, deleteEntry, updateEntry } from '../lib/store';
import { fmtKcal, kcalFromMacros, oneDecimal, parseNumber } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, goBack, href } from '../lib/router';
import { showToast } from '../lib/toast';
import { MealPicker } from '../components/Common';
import { ChevronLeft } from '../components/Icons';

const MACROS = [
  { key: 'p', label: 'Protein', dot: 'p' },
  { key: 'c', label: 'Carbs', dot: 'c' },
  { key: 'f', label: 'Fat', dot: 'f' },
] as const;

const str = (n: number | undefined) => (n ? oneDecimal(n) : '');

export function QuickAdd({ meal: initialMeal, date, entry }: { meal: MealId; date: string; entry?: Entry }) {
  const [name, setName] = useState(entry?.name ?? '');
  const [kcal, setKcal] = useState(entry ? String(Math.round(entry.kcal)) : '');
  const [macros, setMacros] = useState({ p: str(entry?.p), c: str(entry?.c), f: str(entry?.f) });
  const [meal, setMeal] = useState<MealId>(entry?.meal ?? initialMeal);

  const values = { p: parseNumber(macros.p), c: parseNumber(macros.c), f: parseNumber(macros.f) };
  const macroKcal = Math.round(kcalFromMacros(values));
  const hasMacros = values.p + values.c + values.f > 0;
  const kcalValue = Math.max(0, Math.round(parseNumber(kcal)));
  const mismatch = hasMacros && Math.abs(macroKcal - kcalValue) > 5;
  const valid = kcalValue > 0 && kcalValue <= 20000;

  const submit = (e: Event) => {
    e.preventDefault();
    if (!valid) return;
    const fields = {
      date,
      meal,
      name: name.trim() || 'Quick add',
      kcal: kcalValue,
      p: Math.max(0, values.p),
      c: Math.max(0, values.c),
      f: Math.max(0, values.f),
    };
    if (entry) {
      updateEntry(entry.id, fields);
      showToast('Saved', undefined, { carry: true });
      goBack(href('/', { date }));
      return;
    }
    const created = addEntry({ ...fields, source: 'quick' });
    showToast(`Added to ${MEAL_LABEL[meal]}`, { label: 'Undo', run: () => deleteEntry(created.id) }, { carry: true });
    finishFlow(href('/', { date }));
  };

  const remove = () => {
    if (!entry) return;
    deleteEntry(entry.id);
    const { id: _id, createdAt: _c, ...rest } = entry;
    showToast(`Removed ${entry.name}`, { label: 'Undo', run: () => addEntry(rest) }, { carry: true });
    goBack(href('/', { date }));
  };

  return (
    <form onSubmit={submit}>
      <main class="screen with-footer">
        <header class="topbar">
          <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/add', { meal, date }))}>
            <ChevronLeft />
          </button>
          <h1>{entry ? 'Edit entry' : 'Quick add'}</h1>
          <span class="spacer-44" />
        </header>

        {!entry && <p class="lede">For restaurant meals or a label you've already read.</p>}

        <div class="field">
          <label for="qa-name" class="field-label">
            Name <span class="optional">(optional)</span>
          </label>
          <input
            id="qa-name"
            class="input"
            type="text"
            autoComplete="off"
            enterKeyHint="next"
            placeholder="e.g. Ramen, restaurant"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
        </div>

        <div class="field">
          <label for="qa-kcal" class="field-label">
            Calories
          </label>
          <div class="input-wrap">
            <input
              id="qa-kcal"
              class="input strong big"
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              placeholder="0"
              value={kcal}
              onInput={(e) => setKcal((e.target as HTMLInputElement).value.replace(/[^\d]/g, ''))}
            />
            <span class="input-suffix">kcal</span>
          </div>
        </div>

        <div class="grid-3 gap-10">
          {MACROS.map((m) => (
            <div class="field">
              <label for={`qa-${m.key}`} class="field-label">
                <span class={`dot ${m.dot}`} />
                {m.label}
              </label>
              <div class="input-wrap">
                <input
                  id={`qa-${m.key}`}
                  class="input macro"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={macros[m.key]}
                  onInput={(e) => setMacros({ ...macros, [m.key]: (e.target as HTMLInputElement).value })}
                />
                <span class="input-suffix">g</span>
              </div>
            </div>
          ))}
        </div>

        {mismatch && (
          <div class="notice">
            <span>
              Your macros add up to <strong class="num">{fmtKcal(macroKcal)} kcal</strong>
            </span>
            <button type="button" class="btn-text" onClick={() => setKcal(String(macroKcal))}>
              Use {fmtKcal(macroKcal)}
            </button>
          </div>
        )}

        <MealPicker value={meal} onChange={setMeal} />
      </main>

      <div class="footer">
        <div class="footer-inner">
          {entry && (
            <button type="button" class="btn-secondary btn-danger" onClick={remove}>
              Delete
            </button>
          )}
          <button type="submit" class="btn-primary" disabled={!valid}>
            {entry ? 'Save' : `Add to ${MEAL_LABEL[meal]}`}
          </button>
        </div>
      </div>
    </form>
  );
}
