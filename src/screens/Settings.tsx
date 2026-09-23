import { useState } from 'preact/hooks';
import type { Goals } from '../lib/types';
import { clearAll, DEFAULT_GOALS, getData, parseData, replaceData, updateSettings, useData } from '../lib/store';
import { fmtKcal, kcalFromMacros, parseNumber } from '../lib/nutrition';
import { todayKey } from '../lib/dates';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { ChevronLeft } from '../components/Icons';

const GOAL_FIELDS = [
  { key: 'p', label: 'Protein', dot: 'p' },
  { key: 'c', label: 'Carbs', dot: 'c' },
  { key: 'f', label: 'Fat', dot: 'f' },
] as const;

async function exportBackup() {
  const data = getData();
  const json = JSON.stringify(data, null, 2);
  const name = `calorie-tracker-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Calorie Tracker backup' });
      return;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function Settings() {
  const data = useData();
  const goals = data.settings.goals;
  const [draft, setDraft] = useState<Record<keyof Goals, string>>({
    kcal: String(goals.kcal),
    p: String(goals.p),
    c: String(goals.c),
    f: String(goals.f),
  });
  const [key, setKey] = useState(data.settings.apiKey);
  const [showKey, setShowKey] = useState(false);

  const setGoal = (field: keyof Goals, value: string) => {
    const clean = value.replace(/[^\d]/g, '').slice(0, 5);
    setDraft({ ...draft, [field]: clean });
    const n = Math.round(parseNumber(clean));
    if (n > 0) updateSettings({ goals: { ...getData().settings.goals, [field]: n } });
  };

  const macroKcal = Math.round(kcalFromMacros(goals));
  const mismatch = Math.abs(macroKcal - goals.kcal) > 50;

  const importBackup = async (file: File) => {
    try {
      const next = parseData(JSON.parse(await file.text()));
      const count = next.entries.length;
      if (!confirm(`Replace everything on this device with the backup (${count} entries)?`)) return;
      replaceData({ ...next, settings: { ...next.settings, apiKey: next.settings.apiKey || getData().settings.apiKey } });
      const g = next.settings.goals;
      setDraft({ kcal: String(g.kcal), p: String(g.p), c: String(g.c), f: String(g.f) });
      showToast(`Restored ${count} entries`);
    } catch (err) {
      alert(err instanceof SyntaxError ? 'That file is not a valid backup.' : (err as Error).message);
    }
  };

  return (
    <main class="screen">
      <header class="topbar">
        <button type="button" class="icon-btn ink" aria-label="Back" onClick={() => goBack('/')}>
          <ChevronLeft />
        </button>
        <h1>Settings</h1>
        <span class="spacer-44" />
      </header>

      <section class="card stack-16" aria-labelledby="goals-title">
        <h2 id="goals-title" class="section-title">
          Daily goals
        </h2>
        <div class="field">
          <label for="goal-kcal" class="field-label">
            Calories
          </label>
          <div class="input-wrap">
            <input
              id="goal-kcal"
              class="input strong big small-big"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={draft.kcal}
              onInput={(e) => setGoal('kcal', (e.target as HTMLInputElement).value)}
              onBlur={() => setDraft({ ...draft, kcal: String(getData().settings.goals.kcal) })}
            />
            <span class="input-suffix">kcal</span>
          </div>
        </div>
        <div class="grid-3 gap-10">
          {GOAL_FIELDS.map((g) => (
            <div class="field">
              <label for={`goal-${g.key}`} class="field-label">
                <span class={`dot ${g.dot}`} />
                {g.label}
              </label>
              <div class="input-wrap">
                <input
                  id={`goal-${g.key}`}
                  class="input macro"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={draft[g.key]}
                  onInput={(e) => setGoal(g.key, (e.target as HTMLInputElement).value)}
                  onBlur={() => setDraft({ ...draft, [g.key]: String(getData().settings.goals[g.key]) })}
                />
                <span class="input-suffix">g</span>
              </div>
            </div>
          ))}
        </div>
        {mismatch && (
          <div class="notice">
            <span>
              These macros add up to <strong class="num">{fmtKcal(macroKcal)} kcal</strong>
            </span>
            <button
              type="button"
              class="btn-text"
              onClick={() => {
                updateSettings({ goals: { ...goals, kcal: macroKcal } });
                setDraft({ ...draft, kcal: String(macroKcal) });
              }}
            >
              Use {fmtKcal(macroKcal)}
            </button>
          </div>
        )}
        <button
          type="button"
          class="link-btn left"
          onClick={() => {
            updateSettings({ goals: { ...DEFAULT_GOALS } });
            setDraft({
              kcal: String(DEFAULT_GOALS.kcal),
              p: String(DEFAULT_GOALS.p),
              c: String(DEFAULT_GOALS.c),
              f: String(DEFAULT_GOALS.f),
            });
          }}
        >
          Reset to defaults
        </button>
      </section>

      <section class="card stack-12" aria-labelledby="photo-title">
        <h2 id="photo-title" class="section-title">
          Photo estimates
        </h2>
        <p class="body-text">
          Photo estimates use Claude by Anthropic. Add your own API key from{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
            console.anthropic.com
          </a>
          . The key is stored only on this device, and photos go straight from your phone to Anthropic. Each estimate is
          billed to your Anthropic account.
        </p>
        <form
          class="field"
          onSubmit={(e) => {
            e.preventDefault();
            updateSettings({ apiKey: key.trim() });
            showToast(key.trim() ? 'API key saved' : 'API key removed');
          }}
        >
          <label for="api-key" class="field-label">
            Anthropic API key
          </label>
          <div class="key-row">
            <input
              id="api-key"
              class="input"
              type={showKey ? 'text' : 'password'}
              autoComplete="off"
              autoCapitalize="off"
              spellcheck={false}
              placeholder="sk-ant-…"
              value={key}
              onInput={(e) => setKey((e.target as HTMLInputElement).value)}
            />
            <button type="button" class="btn-secondary small-btn" onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <button type="submit" class="btn-primary" disabled={key.trim() === data.settings.apiKey}>
            Save key
          </button>
        </form>
      </section>

      <section class="card stack-12" aria-labelledby="data-title">
        <h2 id="data-title" class="section-title">
          Your data
        </h2>
        <p class="body-text">
          Everything you log is saved on this device only ({data.entries.length}{' '}
          {data.entries.length === 1 ? 'entry' : 'entries'}). Export a backup now and then so you can restore it on a new
          phone.
        </p>
        <div class="button-pair">
          <button type="button" class="btn-secondary" onClick={() => exportBackup()}>
            Export backup
          </button>
          <label class="btn-secondary file-btn">
            Import backup
            <input
              type="file"
              accept="application/json,.json"
              class="sr-only"
              onChange={(e) => {
                const input = e.target as HTMLInputElement;
                const file = input.files?.[0];
                input.value = '';
                if (file) importBackup(file);
              }}
            />
          </label>
        </div>
        <button
          type="button"
          class="link-btn left danger"
          onClick={() => {
            if (confirm('Delete every logged entry and favorite on this device? This cannot be undone.')) {
              clearAll();
              showToast('All entries deleted');
            }
          }}
        >
          Delete all entries
        </button>
      </section>

      <section class="card stack-12" aria-labelledby="install-title">
        <h2 id="install-title" class="section-title">
          Use it like an app
        </h2>
        <p class="body-text">
          In Chrome on iPhone, tap the <strong>Share</strong> button in the address bar, then{' '}
          <strong>Add to Home Screen</strong>. The tracker then opens full screen from its own icon and works offline for
          everything except barcode lookups, online search and photo estimates.
        </p>
      </section>
    </main>
  );
}
