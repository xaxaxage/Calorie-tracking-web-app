import { useData } from '../lib/store';
import { geminiLabel } from '../lib/ai';
import { addDays, shortWeekday, todayKey, toKey } from '../lib/dates';
import {
  allLimits,
  clearUsage,
  dayUsedUp,
  forgetDayLimit,
  limitsFor,
  nextPacificMidnight,
  operations,
  pacificDayStart,
  peakPerMinute,
  resting,
  restUntil,
  perModelToday,
  tally,
  usedSince,
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
  busy: 'Overloaded',
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

/** "17 / 20" with a bar that turns orange near the limit and red at it — the numbers always written out. */
function Meter({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const level = !limit ? 'none' : ratio >= 1 ? 'full' : ratio >= 0.75 ? 'high' : 'ok';
  return (
    <div class={`meter-row ${level}`}>
      <span class="meter-label">{label}</span>
      {limit ? (
        <span
          class="meter"
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={`${used} of ${limit}`}
        >
          <span class="meter-fill" style={{ width: `${Math.max(ratio * 100, used > 0 ? 4 : 0)}%` }} />
        </span>
      ) : (
        <span class="meter-none" />
      )}
      <span class="meter-value num">
        {num(used)}
        {limit ? ` / ${num(limit)}` : ''}
      </span>
    </div>
  );
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
              const gemini = m.provider === 'gemini';
              const shown = gemini ? limitsFor(m.model) : { reported: false };
              const since = pacificDayStart(now);
              return (
                <li class="row usage-row">
                  <div class="row-main">
                    <span class="row-title small">{label(m)}</span>
                    {gemini ? (
                      <div class="meters">
                        <Meter
                          label="Requests today"
                          // Google said the day's allowance is gone (maybe used from another device): show it full.
                          used={usedUp && shown.perDay ? Math.max(usedSince(m.model, since), shown.perDay) : usedSince(m.model, since)}
                          limit={shown.perDay}
                        />
                        <Meter label="Busiest minute" used={peakPerMinute(m.model, since)} limit={shown.perMinute} />
                      </div>
                    ) : (
                      <span class="row-sub wrap">{plural(m.tally.requests, 'request')}</span>
                    )}
                    {(m.tally.failed > 0 || shown.reported) && (
                      <span class="row-sub wrap">
                        {m.tally.failed > 0 ? `${plural(m.tally.failed, 'request')} turned away or failed` : ''}
                        {m.tally.failed > 0 && shown.reported ? ' · ' : ''}
                        {shown.reported ? 'limits as Google reported them for your key' : ''}
                      </span>
                    )}
                    {!usedUp && resting(m.model, now) && (
                      <span class="usage-warn">
                        Google says it's overloaded — resting it until {clock(restUntil(m.model)!)}, so estimates use
                        another model meanwhile.{' '}
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
          Limits shown are Google's free-tier ones as AI Studio lists them — Flash: 20 a day, 5 a minute; Flash-Lite: 500
          a day, 15 a minute — unless Google has reported yours; keys with billing get more. These count this device's
          requests; Google's own count, from all your devices, is under Usage in{' '}
          <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer">
            AI Studio
          </a>
          . See also{' '}
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
                    {r.error && r.outcome !== 'ok' && <span class="usage-req-error">{r.provider === 'gemini' ? 'Google' : 'Anthropic'}: {r.error}</span>}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p class="field-hint pad-4">
        One estimate is normally one request. More are sent only when a model is overloaded or at a limit and{' '}
        <strong>Switch models automatically</strong> tries another model (you can turn that off in Settings). A model
        whose daily free uses are gone is skipped until Google resets them, and one Google calls overloaded rests for 5–30
        minutes — its failed requests seem to count toward the daily limit too. This counts requests from this device
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
