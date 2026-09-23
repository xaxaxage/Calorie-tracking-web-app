import type { MealId } from '../lib/types';
import { MEAL_DISPLAY_ORDER } from '../lib/types';
import { useData } from '../lib/store';
import { addDays, longDate, relativeDayTitle, todayKey } from '../lib/dates';
import { entriesFor, fmtKcal, percent, sum } from '../lib/nutrition';
import { MEAL_LABEL } from '../lib/meals';
import { href, navigate } from '../lib/router';
import { BottomNav, MacroLabel } from '../components/Common';
import { ChevronLeft, ChevronRight, Gear, Plus } from '../components/Icons';

const RING_R = 64;
const RING_C = 2 * Math.PI * RING_R;

export function Today({ date }: { date: string }) {
  const data = useData();
  const today = todayKey();
  const isToday = date === today;
  const dayEntries = entriesFor(data.entries, date);
  const totals = sum(dayEntries);
  const goals = data.settings.goals;
  const left = goals.kcal - totals.kcal;
  const over = left < 0;
  const progress = goals.kcal > 0 ? Math.min(1, totals.kcal / goals.kcal) : 0;

  const goToDay = (key: string) => navigate(key === today ? '/' : href('/', { date: key }), { replace: true });

  const startAdd = (meal: MealId) => navigate(href('/add', { meal, date }), { startFlow: true });

  const macros = [
    { key: 'p' as const, label: 'Protein', value: totals.p, goal: goals.p },
    { key: 'c' as const, label: 'Carbs', value: totals.c, goal: goals.c },
    { key: 'f' as const, label: 'Fat', value: totals.f, goal: goals.f },
  ];

  return (
    <>
      <main class="screen with-nav">
        <header class="today-header">
          <div class="today-heading">
            <span class="eyebrow">{longDate(date)}</span>
            <h1 class="page-title">{relativeDayTitle(date, today)}</h1>
          </div>
          <div class="today-actions">
            <a href="#/settings" class="icon-btn" aria-label="Settings and goals">
              <Gear />
            </a>
            <button type="button" class="icon-btn" aria-label="Previous day" onClick={() => goToDay(addDays(date, -1))}>
              <ChevronLeft />
            </button>
            <button
              type="button"
              class="icon-btn"
              aria-label="Next day"
              disabled={isToday}
              onClick={() => goToDay(addDays(date, 1))}
            >
              <ChevronRight />
            </button>
          </div>
        </header>

        <section aria-label="Daily summary" class="card summary">
          <div class="summary-top">
            <div class="ring">
              <svg viewBox="0 0 150 150" aria-hidden="true">
                <circle cx="75" cy="75" r={RING_R} fill="none" stroke="var(--ring-track)" stroke-width="14" />
                {progress > 0 && (
                  <circle
                    cx="75"
                    cy="75"
                    r={RING_R}
                    fill="none"
                    stroke={over ? 'var(--protein)' : 'var(--orange-deep)'}
                    stroke-width="14"
                    stroke-linecap="round"
                    stroke-dasharray={`${(RING_C * progress).toFixed(1)} ${RING_C.toFixed(1)}`}
                    transform="rotate(-90 75 75)"
                    class="ring-progress"
                  />
                )}
              </svg>
              <div class="ring-center">
                <span class="ring-value num">{fmtKcal(Math.abs(left))}</span>
                <span class="ring-caption">{over ? 'kcal over' : 'kcal left'}</span>
              </div>
            </div>
            <div class="summary-figures">
              <div>
                <span class="stat-label">Eaten</span>
                <span class="stat-value num eaten">
                  {fmtKcal(totals.kcal)} <span class="unit">kcal</span>
                </span>
              </div>
              <a href="#/settings" class="goal-link">
                <span class="stat-label">Goal</span>
                <span class="stat-value num">
                  {fmtKcal(goals.kcal)} <span class="unit">kcal</span>
                </span>
              </a>
            </div>
          </div>

          <div class="grid-3">
            {macros.map((m) => (
              <div class="macro-col">
                <MacroLabel kind={m.key}>{m.label}</MacroLabel>
                <div class="num">
                  <span class="macro-value">{Math.round(m.value)}</span>
                  <span class="macro-goal"> / {m.goal} g</span>
                </div>
                <div class="bar">
                  <span class={`bg-${m.key}`} style={{ width: `${percent(m.value, m.goal)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {data.entries.length === 0 && (
          <div class="notice plain">
            <span>
              Welcome! Tap <strong>+</strong> next to a meal to log food. Your daily goal is {fmtKcal(goals.kcal)} kcal — you
              can <a href="#/settings">change it in Settings</a>.
            </span>
          </div>
        )}

        <section aria-label="Meals" class="stack-10">
          <div class="section-head">
            <h2 class="section-title">Meals</h2>
            <span class="eyebrow small">
              {dayEntries.length} {dayEntries.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div class="list">
            {MEAL_DISPLAY_ORDER.map((meal) => {
              const items = dayEntries.filter((e) => e.meal === meal);
              const kcal = sum(items).kcal;
              const empty = items.length === 0;
              return (
                <div class="row">
                  <button
                    type="button"
                    class="row-main"
                    onClick={() => (empty ? startAdd(meal) : navigate(href(`/meal/${meal}`, { date })))}
                  >
                    <span class="row-title">{MEAL_LABEL[meal]}</span>
                    <span class="row-sub">{empty ? 'Nothing logged yet' : items.map((e) => e.name).join(', ')}</span>
                  </button>
                  {!empty && <span class="row-kcal">{fmtKcal(kcal)} kcal</span>}
                  <button
                    type="button"
                    class={`round-add${empty ? ' loud' : ''}`}
                    aria-label={`Add food to ${MEAL_LABEL[meal]}`}
                    onClick={() => startAdd(meal)}
                  >
                    <Plus />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </main>
      <BottomNav current="today" date={isToday ? undefined : date} />
    </>
  );
}
