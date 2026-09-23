import type { Entry, MealId } from '../lib/types';
import { MEAL_DISPLAY_ORDER } from '../lib/types';
import { addEntries, deleteEntry, useData } from '../lib/store';
import { addDays, relativeDayTitle, todayKey } from '../lib/dates';
import { fmtKcal, sum } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { finishFlow, goBack, href, navigate } from '../lib/router';
import { showToast } from '../lib/toast';
import { MealPicker } from '../components/Common';
import { ChevronLeft, Copy } from '../components/Icons';

const LOOKBACK_DAYS = 14;

interface Group {
  date: string;
  meal: MealId;
  entries: Entry[];
}

export function CopyMeal({ meal, date }: { meal: MealId; date: string }) {
  const data = useData();
  const today = todayKey();
  const from = addDays(date, -LOOKBACK_DAYS);

  const groups: Group[] = [];
  // Newest first, starting from today so a past day can be filled from a later one.
  for (let d = today; d >= from; d = addDays(d, -1)) {
    for (const m of [...MEAL_DISPLAY_ORDER].reverse()) {
      if (d === date && m === meal) continue;
      const entries = data.entries.filter((e) => e.date === d && e.meal === m);
      if (entries.length > 0) groups.push({ date: d, meal: m, entries });
    }
  }

  const copy = (g: Group) => {
    const created = addEntries(
      g.entries.map(({ id: _id, createdAt: _c, ...rest }) => ({ ...rest, date, meal, source: 'copy' as const })),
    );
    const n = created.length;
    showToast(`Copied ${n} ${n === 1 ? 'item' : 'items'} to ${MEAL_LABEL[meal]}`, {
      label: 'Undo',
      run: () => created.forEach((e) => deleteEntry(e.id)),
    });
    finishFlow(href('/', { date }));
  };

  return (
    <main class="screen gap-16">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack(href('/add', { meal, date }))}>
          <ChevronLeft />
        </button>
        <h1>Copy meal</h1>
        <span class="spacer-44" />
      </header>

      <p class="lede">
        Pick a meal from the last two weeks to copy into {MEAL_LABEL[meal]}, {relativeDayTitle(date, today).toLowerCase()}.
      </p>

      <MealPicker value={meal} onChange={(m) => navigate(href('/copy', { meal: m, date }), { replace: true })} />

      <div class="list">
        {groups.length === 0 ? (
          <div class="list-empty">Nothing logged in the last two weeks yet.</div>
        ) : (
          groups.map((g) => {
            const kcal = sum(g.entries).kcal;
            return (
              <button type="button" class="row copy-row" onClick={() => copy(g)}>
                <span class="row-main">
                  <span class="row-title">
                    {MEAL_LABEL[g.meal]} <span class="muted small">· {relativeDayTitle(g.date, today)}</span>
                  </span>
                  <span class="row-sub">{g.entries.map((e) => e.name).join(', ')}</span>
                </span>
                <span class="row-kcal">{fmtKcal(kcal)} kcal</span>
                <span class="round-add" aria-hidden="true">
                  <Copy size={20} />
                </span>
              </button>
            );
          })
        )}
      </div>
    </main>
  );
}
