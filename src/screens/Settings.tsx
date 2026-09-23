import { useState } from 'preact/hooks';
import type { AiProvider, Goals } from '../lib/types';
import {
  backupJson,
  clearAll,
  DEFAULT_GOALS,
  getData,
  isModelId,
  parseData,
  replaceData,
  updateSettings,
  useData,
} from '../lib/store';
import { fmtKcal, kcalFromMacros, parseNumber } from '../lib/nutrition';
import { todayKey } from '../lib/dates';
import { goBack } from '../lib/router';
import { showToast } from '../lib/toast';
import { ChevronLeft } from '../components/Icons';
import { GEMINI_SHORTCUTS, listGeminiModels } from '../lib/ai';
import { SyncSettings } from './SyncSettings';
import { loadSyncConfig } from '../lib/sync/state';

const GOAL_FIELDS = [
  { key: 'p', label: 'Protein', dot: 'p' },
  { key: 'c', label: 'Carbs', dot: 'c' },
  { key: 'f', label: 'Fat', dot: 'f' },
] as const;

async function exportBackup() {
  const json = backupJson();
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
      // Backups carry no API keys; keep the ones already on this device.
      const current = getData().settings;
      replaceData({ ...next, settings: { ...next.settings, apiKey: current.apiKey, geminiKey: current.geminiKey } });
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

      <AiSettings />

      <SyncSettings />

      <section class="card stack-12" aria-labelledby="data-title">
        <h2 id="data-title" class="section-title">
          Your data
        </h2>
        <p class="body-text">
          Everything you log is saved on this device ({data.entries.length}{' '}
          {data.entries.length === 1 ? 'entry' : 'entries'}), and on your other devices if sync is on. Export a backup now and then
          and keep it in Files or iCloud Drive so you can restore it on a new phone. Backups don't include your API keys.
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
            const where = loadSyncConfig() ? 'on this device and every synced device' : 'on this device';
            if (confirm(`Delete every logged entry and favorite ${where}? This cannot be undone.`)) {
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
          everything except barcode lookups, online search and AI estimates. Always open it from that icon: the home
          screen app keeps its own data, separate from Chrome tabs. Removing the icon can delete that data, so export a
          backup first.
        </p>
      </section>
    </main>
  );
}

function KeyField({
  id,
  label,
  placeholder,
  saved,
  onSave,
}: {
  id: string;
  label: string;
  placeholder: string;
  saved: string;
  onSave: (key: string) => void;
}) {
  const [key, setKey] = useState(saved);
  const [show, setShow] = useState(false);
  return (
    <form
      class="field"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(key.trim());
        showToast(key.trim() ? 'Key saved' : 'Key removed');
      }}
    >
      <label for={id} class="field-label">
        {label}
      </label>
      <div class="key-row">
        <input
          id={id}
          class="input"
          type={show ? 'text' : 'password'}
          autoComplete="off"
          autoCapitalize="off"
          spellcheck={false}
          placeholder={placeholder}
          value={key}
          onInput={(e) => setKey((e.target as HTMLInputElement).value)}
        />
        <button type="button" class="btn-secondary small-btn" onClick={() => setShow(!show)}>
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      <button type="submit" class="btn-primary" disabled={key.trim() === saved}>
        Save key
      </button>
    </form>
  );
}

function AiSettings() {
  const { settings } = useData();
  const provider = settings.aiProvider;
  const choose = (p: AiProvider) => updateSettings({ aiProvider: p });

  return (
    <section class="card stack-12" aria-labelledby="ai-title">
      <h2 id="ai-title" class="section-title">
        AI estimates
      </h2>
      <p class="body-text">
        AI turns a meal photo or a plain-text description into items with portions and calories. Describing food also works
        without AI by matching your words to the food list.
      </p>

      <div role="group" aria-label="AI provider" class="segmented two">
        <button type="button" aria-pressed={provider === 'gemini'} onClick={() => choose('gemini')}>
          Gemini · free
        </button>
        <button type="button" aria-pressed={provider === 'claude'} onClick={() => choose('claude')}>
          Claude · paid
        </button>
      </div>

      {provider === 'gemini' ? (
        <>
          <ol class="steps">
            <li>
              Open{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                aistudio.google.com/apikey
              </a>{' '}
              and sign in with a Google account.
            </li>
            <li>
              Tap <strong>Create API key</strong> and copy it. No card is needed.
            </li>
            <li>Paste it below and save.</li>
          </ol>
          <KeyField
            id="gemini-key"
            label="Gemini API key"
            placeholder="AIza…"
            saved={settings.geminiKey}
            onSave={(geminiKey) => {
              updateSettings({ geminiKey });
              // Fetch the models this key can use so they show up in the picker.
              if (geminiKey)
                listGeminiModels(geminiKey)
                  .then((geminiModels) => updateSettings({ geminiModels }))
                  .catch(() => undefined);
            }}
          />
          <GeminiModelPicker />
          <p class="field-hint">
            Free keys can use Flash and Flash-Lite models, each with its own daily limit; Pro models need billing turned on
            in Google AI Studio. On the free tier Google may use what you send (photos and descriptions) to improve its
            products, so don't include anything private.
          </p>
        </>
      ) : (
        <>
          <p class="body-text">
            Claude needs an API key from{' '}
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
              console.anthropic.com
            </a>{' '}
            with prepaid credit; each estimate is billed to your Anthropic account.
          </p>
          <KeyField
            id="api-key"
            label="Anthropic API key"
            placeholder="sk-ant-…"
            saved={settings.apiKey}
            onSave={(apiKey) => updateSettings({ apiKey })}
          />
        </>
      )}
      <p class="field-hint">Keys are stored only on this device and are left out of backups.</p>
    </section>
  );
}

const CUSTOM = '__custom';

function GeminiModelPicker() {
  const { settings } = useData();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(false);
  const [customId, setCustomId] = useState('');
  const current = settings.geminiModel;
  const listed = settings.geminiModels;
  const known = new Set([...GEMINI_SHORTCUTS.map((m) => m.id), ...listed.map((m) => m.id)]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const geminiModels = await listGeminiModels(settings.geminiKey);
      updateSettings({ geminiModels });
      showToast(`Found ${geminiModels.length} models`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="field">
      <label for="gemini-model" class="field-label">
        Model
      </label>
      <select
        id="gemini-model"
        class="input select"
        value={custom ? CUSTOM : current}
        onChange={(e) => {
          const value = (e.target as HTMLSelectElement).value;
          if (value === CUSTOM) {
            setCustom(true);
            setCustomId(known.has(current) ? '' : current);
          } else {
            setCustom(false);
            updateSettings({ geminiModel: value });
          }
        }}
      >
        <optgroup label="Always the newest">
          {GEMINI_SHORTCUTS.map((m) => (
            <option value={m.id}>
              {m.label} — {m.hint}
            </option>
          ))}
        </optgroup>
        {listed.length > 0 && (
          <optgroup label={`Models your key can use (${listed.length})`}>
            {listed.map((m) => (
              <option value={m.id}>{m.label === m.id ? m.id : `${m.label} · ${m.id}`}</option>
            ))}
          </optgroup>
        )}
        {!known.has(current) && <option value={current}>{current}</option>}
        <option value={CUSTOM}>Other — type a model ID…</option>
      </select>

      {custom && (
        <form
          class="key-row"
          onSubmit={(e) => {
            e.preventDefault();
            const id = customId.trim();
            if (!isModelId(id)) return;
            updateSettings({ geminiModel: id });
            setCustom(false);
            showToast(`Using ${id}`);
          }}
        >
          <label for="custom-model" class="sr-only">
            Model ID
          </label>
          <input
            id="custom-model"
            class="input"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            spellcheck={false}
            placeholder="e.g. gemini-3.5-flash"
            value={customId}
            onInput={(e) => setCustomId((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn-secondary small-btn" disabled={!isModelId(customId.trim())}>
            Use
          </button>
        </form>
      )}

      <button type="button" class="link-btn left" disabled={!settings.geminiKey.trim() || loading} onClick={load}>
        {loading ? 'Loading models…' : listed.length > 0 ? 'Refresh the model list' : 'Show all models my key can use'}
      </button>
      {!settings.geminiKey.trim() && <span class="field-hint">Save your key first to see every model it can use.</span>}
      {error && <span class="field-hint error-text">{error}</span>}

      <label class="toggle-row">
        <input
          type="checkbox"
          checked={settings.geminiAutoSwitch}
          onChange={(e) => updateSettings({ geminiAutoSwitch: (e.target as HTMLInputElement).checked })}
        />
        <span>
          <strong>Switch models automatically</strong>
          <span class="muted">When a model is busy or out of free uses, try the next one.</span>
        </span>
      </label>
    </div>
  );
}
