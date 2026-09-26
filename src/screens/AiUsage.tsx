import { useData } from '../lib/store';
import { geminiLabel } from '../lib/ai';
import { addDays, shortWeekday, todayKey, toKey } from '../lib/dates';
import {
  allLimits,
  clearUsage,
  dayUsedUp,
  forgetDayLimit,
  nextPacificMidnight,
  operations,
  perModelToday,
  tally,
  useUsage,
  type UsageKind,
  type UsageOutcome,
  type UsageRecord,
} from '../lib/ai/usage';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { ChevronLeft } from '../components/Icons';

const KIND: Record<UsageKind, string> = {
  photo: 'Photo',
  text: 'Description',
  correction: 'Correction',
  models: 'Model list',
};

const OUTCOME: Record<UsageOutcome, string> = {
  ok: 'OK',
  'minute-limit': 'Per-minute limit',
  'day-limit': 'Daily limit reached',
  limit: 'Limit reached',
  busy: 'Busy',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const num = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

function tokens(inn: number, out: number): string {
  if (!inn && !out) return '';
  return `${num(inn)} in · ${num(out)} out tokens`;
}

/** Every request this device sent to Gemini or Claude, and what Google said about its limits. */
export function AiUsage() {
  const { settings } = useData();
  const usage = useUsage();
  const records = usage.records;
  const now = Date.now();
  const label = (r: Pick<UsageRecord, 'provider' | 'model'>) =>
    r.provider === 'claude' ? `Claude · ${r.model}` : r.model === 'model list' ? 'Gemini model list' : `Gemini · ${geminiLabel(settings, r.model)}`;

  const today = todayKey();
  const todays = records.filter((r) => toKey(new Date(r.at)) === today);
  const t = tally(todays);
  const estimates = new Set(todays.filter((r) => r.kind !== 'models').map((r) => r.op)).size;

  const models = perModelToday(records, now);
  // Models Google has reported a limit for, even if not used today.
  const limits = allLimits();
  for (const id of Object.keys(limits)) {
    if (!models.some((m) => m.model === id)) models.push({ model: id, provider: 'gemini', tally: tally([]) });
  }
  const reset = nextPacificMidnight(now);

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, -i)).map((day) => ({
    day,
    tally: tally(records.filter((r) => toKey(new Date(r.at)) === day)),
  }));
  const recent = operations(records, 25);

  return (
    <main class="screen gap-16">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack('/settings')}>
          <ChevronLeft />
        </button>
        <h1>AI usage</h1>
        <span class="spacer-44" />
      </header>

      <section class="card stack-8" aria-labelledby="usage-today">
        <h2 id="usage-today" class="section-title">
          Today
        </h2>
        <p class="usage-big num">{plural(t.requests, 'request')}</p>
        <p class="muted small-text">
          {estimates > 0 ? `for ${plural(estimates, 'estimate')}` : 'No estimates yet'}
          {t.failed > 0 ? ` · ${num(t.failed)} failed` : ''}
          {tokens(t.tokensIn, t.tokensOut) ? ` · ${tokens(t.tokensIn, t.tokensOut)}` : ''}
        </p>
      </section>

      <section class="card stack-12" aria-labelledby="usage-models">
        <div class="stack-2">
          <h2 id="usage-models" class="section-title">
            By model
          </h2>
          <span class="muted small-text">
            Since Google's daily reset — the next one is at {clock(reset)} your time (midnight in California).
          </span>
        </div>
        {models.length === 0 ? (
          <p class="muted small-text">No requests since then.</p>
        ) : (
          <ul class="list usage-models">
            {models.map((m) => {
              const known = limits[m.model] ?? {};
              const usedUp = dayUsedUp(m.model, now);
              return (
                <li class="row usage-row">
                  <div class="row-main">
                    <span class="row-title small">{label(m)}</span>
                    <span class="row-sub wrap">
                      {plural(m.tally.requests, 'request')}
                      {m.tally.failed > 0 ? ` · ${num(m.tally.failed)} failed` : ''}
                      {known.perDay ? ` · limit ${num(known.perDay)} a day` : ''}
                      {known.perMinute ? ` · ${num(known.perMinute)} a minute` : ''}
                    </span>
                    {usedUp && (
                      <span class="usage-warn">
                        Out of free uses until {clock(known.dayUsedUpUntil!)} — skipped until then.{' '}
                        <button
                          type="button"
                          class="link-btn"
                          onClick={() => {
                            forgetDayLimit(m.model);
                            showToast(`${label(m)} will be tried again`);
                          }}
                        >
                          Try it again now
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p class="field-hint">
          Google doesn't tell apps their free limits up front; a model's limit shows here once Google reports it. See{' '}
          <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noopener noreferrer">
            Google's rate limits
          </a>
          .
        </p>
      </section>

      <section class="card stack-12" aria-labelledby="usage-days">
        <h2 id="usage-days" class="section-title">
          Last 7 days
        </h2>
        <ul class="list usage-days">
          {days.map(({ day, tally: d }) => (
            <li class="row usage-row">
              <span class="row-main">
                <span class="row-title small">{day === today ? 'Today' : shortWeekday(day)}</span>
              </span>
              <span class="usage-count num">
                {plural(d.requests, 'request')}
                {d.failed > 0 && <span class="muted"> · {num(d.failed)} failed</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section class="card stack-12" aria-labelledby="usage-recent">
        <h2 id="usage-recent" class="section-title">
          Recent
        </h2>
        {recent.length === 0 ? (
          <p class="muted small-text">Nothing yet. Every photo estimate, description and correction will show up here.</p>
        ) : (
          <ul class="list usage-recent">
            {recent.map((op) => (
              <li class="usage-op">
                <div class="usage-op-head">
                  <strong>{KIND[op.kind]}</strong>
                  <span class="muted num">
                    {clock(op.at)} · {plural(op.requests.length, 'request')}
                  </span>
                </div>
                {op.requests.map((r) => (
                  <div class={`usage-req${r.outcome === 'ok' ? '' : ' bad'}`}>
                    <span class="usage-req-model">{label(r)}</span>
                    <span class="usage-req-detail num">
                      {OUTCOME[r.outcome]} · {(r.ms / 1000).toFixed(1)} s
                      {r.tokensIn || r.tokensOut ? ` · ${num((r.tokensIn ?? 0) + (r.tokensOut ?? 0))} tokens` : ''}
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p class="field-hint pad-4">
        One estimate is normally one request. More are sent only when a model is busy or at a limit and{' '}
        <strong>Switch models automatically</strong> tries again or tries another model (you can turn that off in Settings).
        A model whose daily free uses are gone is skipped until Google resets them. This counts requests from this device
        only — your other devices count their own, while Google's limits are shared by everything using your key.
      </p>

      {records.length > 0 && (
        <button
          type="button"
          class="link-btn left danger"
          onClick={() => {
            if (!confirm('Clear the usage history on this device?')) return;
            clearUsage();
            showToast('Usage history cleared');
          }}
        >
          Clear the usage history
        </button>
      )}
    </main>
  );
}
