import { useData } from '../lib/store';
import { addDays, dayMonth, rangeLabel, shortWeekday, todayKey, weekday } from '../lib/dates';
import { entriesFor, fmtKcal, macroSplit, sum } from '../lib/nutrition';
import { href, navigate } from '../lib/router';
import { BottomNav, MacroLabel, SplitBar } from '../components/Common';
import { ChevronLeft, ChevronRight } from '../components/Icons';

const CHART_H = 140;

export function History({ end }: { end: string }) {
  const data = useData();
  const today = todayKey();
  const goal = data.settings.goals.kcal;
  const goals = data.settings.goals;

  const keys = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  const days = keys.map((key) => {
    const items = entriesFor(data.entries, key);
    return { key, logged: items.length > 0, totals: sum(items), isToday: key === today };
  });

  // Averages cover finished days with something logged; today is still in progress.
  const complete = days.filter((d) => d.logged && !d.isToday);
  const basis = complete.length > 0 ? complete : days.filter((d) => d.logged);
  const avg = basis.length > 0 ? sum(basis.map((d) => d.totals)) : null;
  const n = basis.length || 1;

  const maxKcal = Math.max(0, ...days.map((d) => d.totals.kcal));
  const scale = Math.max(goal * 1.22, maxKcal * 1.05, 1);
  const goalY = Math.min(CHART_H, (goal / scale) * CHART_H);

  const shiftWeek = (delta: number) => {
    const next = addDays(end, delta);
    navigate(next >= today ? '/history' : href('/history', { end: next }), { replace: true });
  };

  return (
    <>
      <main class="screen with-nav">
        <header class="history-header">
          <h1 class="page-title">History</h1>
          <div class="week-nav">
            <button type="button" class="icon-btn" aria-label="Previous week" onClick={() => shiftWeek(-7)}>
              <ChevronLeft size={18} />
            </button>
            <span class="week-label">{rangeLabel(keys[0], keys[6])}</span>
            <button
              type="button"
              class="icon-btn"
              aria-label="Next week"
              disabled={end >= today}
              onClick={() => shiftWeek(7)}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </header>

        <section aria-label="Calories this week" class="card stack-16">
          <div class="chart-head">
            <div class="stack-2">
              <span class="stat-label">Daily average</span>
              <span class="stat-value big num">
                {avg ? fmtKcal(avg.kcal / n) : '—'} <span class="unit">kcal</span>
              </span>
            </div>
            <div class="legend">
              <span>
                <i style={{ background: 'var(--teal)' }} />
                Under goal
              </span>
              <span>
                <i style={{ background: 'var(--orange-deep)' }} />
                Over goal
              </span>
            </div>
          </div>
          <div class="chart" style={{ height: `${CHART_H}px` }}>
            <div class="goal-line" style={{ bottom: `${goalY}px` }} />
            <span class="goal-tag" style={{ bottom: `${goalY + 4}px` }}>
              Goal {fmtKcal(goal)}
            </span>
            <div class="bars">
              {days.map((d) => {
                const h = d.logged ? Math.max(4, (d.totals.kcal / scale) * CHART_H) : 4;
                const color = !d.logged
                  ? 'var(--divider)'
                  : d.isToday
                    ? 'var(--teal-pale)'
                    : d.totals.kcal > goal
                      ? 'var(--orange-deep)'
                      : 'var(--teal)';
                return (
                  <div
                    class="bar-col"
                    title={`${shortWeekday(d.key)}: ${d.logged ? `${fmtKcal(d.totals.kcal)} kcal` : 'nothing logged'}`}
                    style={{ height: `${h}px`, background: color }}
                  />
                );
              })}
            </div>
          </div>
          <div class="bar-labels" aria-hidden="true">
            {days.map((d) => (
              <span class={d.isToday ? 'is-today' : undefined}>{shortWeekday(d.key)}</span>
            ))}
          </div>
        </section>

        <section aria-label="Average macros" class="grid-3 gap-10">
          {(
            [
              ['p', 'Protein', goals.p],
              ['c', 'Carbs', goals.c],
              ['f', 'Fat', goals.f],
            ] as const
          ).map(([k, label, g]) => (
            <div class="mini-card">
              <MacroLabel kind={k}>{label}</MacroLabel>
              <span class="mini-value num">{avg ? `${Math.round(avg[k] / n)} g` : '—'}</span>
              <span class="mini-sub">avg · goal {g}</span>
            </div>
          ))}
        </section>

        <section aria-label="Days" class="stack-10">
          <h2 class="section-title pad-4">Days</h2>
          <div class="list">
            {[...days].reverse().map((d) => {
              const split = macroSplit(d.totals);
              const diff = d.totals.kcal - goal;
              let status = 'Nothing logged';
              let statusClass = 'muted';
              if (d.logged && d.isToday) status = 'In progress';
              else if (d.logged && Math.round(diff) > 0) {
                status = `${fmtKcal(diff)} over`;
                statusClass = 'over';
              } else if (d.logged) {
                status = `${fmtKcal(-diff)} under`;
                statusClass = 'under';
              }
              return (
                <a
                  href={`#${d.isToday ? '/' : href('/', { date: d.key })}`}
                  class="day-row"
                >
                  <div class="day-main">
                    <span class="day-title">{d.isToday ? 'Today' : `${weekday(d.key)}, ${dayMonth(d.key)}`}</span>
                    {d.logged ? (
                      <>
                        <SplitBar thin {...split} />
                        <span class="day-macros num">
                          P {Math.round(d.totals.p)} · C {Math.round(d.totals.c)} · F {Math.round(d.totals.f)} g
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div class="day-side">
                    <span class="day-kcal num">{d.logged ? fmtKcal(d.totals.kcal) : '—'}</span>
                    <span class={`day-status ${statusClass}`}>{status}</span>
                  </div>
                  <span class="chev">
                    <ChevronRight size={18} />
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      </main>
      <BottomNav current="history" />
    </>
  );
}
