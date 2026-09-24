import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_RELAYS, isRelayUrl, loadSyncConfig, useSyncStatus, type SyncStatus } from '../lib/sync/state';
import { showToast } from '../lib/toast';

type Mode = 'idle' | 'create' | 'join' | 'show';

const crypto = () => import('../lib/sync/crypto');
const engine = () => import('../lib/sync/engine');

function ago(ms: number | undefined): string {
  if (!ms) return 'not yet';
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
}

function statusText(s: SyncStatus): string {
  const relays = s.relaysTotal ? ` · ${s.relaysOk ?? 0} of ${s.relaysTotal} relays` : '';
  switch (s.state) {
    case 'syncing':
      return 'Syncing…';
    case 'synced':
      return `Synced ${ago(s.lastSyncAt)}${relays}`;
    case 'offline':
      return s.message ?? 'Offline — will sync when connected';
    case 'error':
      return s.message ?? 'Sync failed';
    default:
      return 'Off';
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Sync key copied');
  } catch {
    showToast('Copy failed — select the words and copy them instead');
  }
}

function Words({ phrase }: { phrase: string }) {
  return (
    <ol class="words" aria-label="Sync key">
      {phrase.split(' ').map((w) => (
        <li>{w}</li>
      ))}
    </ol>
  );
}

export function SyncSettings() {
  const status = useSyncStatus();
  const enabled = status.state !== 'off';
  const [mode, setMode] = useState<Mode>('idle');
  const [phrase, setPhrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [input, setInput] = useState('');
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [relayText, setRelayText] = useState('');

  // Fill the relay list once sync is on (not when the section opens, which could overwrite typing).
  useEffect(() => {
    if (enabled) setRelayText((loadSyncConfig()?.relays ?? DEFAULT_RELAYS).join('\n'));
  }, [enabled]);

  useEffect(() => {
    if (mode !== 'join') return;
    let live = true;
    crypto().then(({ isValidPhrase }) => live && setValid(isValidPhrase(input)));
    return () => {
      live = false;
    };
  }, [mode, input]);

  const start = async (words: string, joining: boolean) => {
    setBusy(true);
    setError('');
    try {
      const { enableSync } = await engine();
      const { added } = await enableSync(words);
      setMode('idle');
      setPhrase('');
      setInput('');
      showToast(
        joining
          ? added > 0
            ? `Sync is on — ${added} ${added === 1 ? 'entry' : 'entries'} added from your other devices`
            : 'Sync is on'
          : 'Sync is on',
      );
    } catch (err) {
      setError((err as Error).message || 'Could not start sync.');
    } finally {
      setBusy(false);
    }
  };

  const openCreate = async () => {
    const { newPhrase } = await crypto();
    setPhrase(newPhrase());
    setSaved(false);
    setMode('create');
  };

  if (!enabled) {
    return (
      <section class="card stack-12" aria-labelledby="sync-title">
        <h2 id="sync-title" class="section-title">
          Sync between devices
        </h2>

        {mode === 'idle' && (
          <>
            <p class="body-text">
              Use the same log on several devices: a <strong>12-word sync key</strong> links them. Your log, favorites, goals
              and AI keys are encrypted on this device before they're sent, and only devices with the key can read them.
              No account needed.
            </p>
            <div class="button-pair">
              <button type="button" class="btn-secondary" onClick={() => setMode('join')}>
                I have a key
              </button>
              <button type="button" class="btn-primary" onClick={openCreate}>
                Create sync key
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <p class="body-text">
              This is your sync key. <strong>Save it somewhere safe</strong> (a password manager or Notes) — you'll type it
              on your other devices. Anyone with these words can read your log and use your AI keys.
            </p>
            <Words phrase={phrase} />
            <button type="button" class="btn-secondary" onClick={() => copy(phrase)}>
              Copy the 12 words
            </button>
            <label class="toggle-row">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved((e.target as HTMLInputElement).checked)} />
              <span>I've saved my sync key</span>
            </label>
            {error && <div class="notice plain">{error}</div>}
            <div class="button-pair">
              <button type="button" class="btn-secondary" disabled={busy} onClick={() => setMode('idle')}>
                Cancel
              </button>
              <button type="button" class="btn-primary" disabled={!saved || busy} onClick={() => start(phrase, false)}>
                {busy ? 'Starting…' : 'Start syncing'}
              </button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <form
            class="stack-12"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !busy) start(input, true);
            }}
          >
            <label for="sync-phrase" class="field-label">
              Sync key from your other device
            </label>
            <textarea
              id="sync-phrase"
              class="input textarea mono"
              rows={3}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellcheck={false}
              placeholder="12 words, separated by spaces"
              value={input}
              onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
            />
            {input.trim() && !valid && (
              <span class="field-hint">That's not a complete sync key yet — check all 12 words.</span>
            )}
            <p class="field-hint">
              What's on this device is combined with what's already synced — nothing gets overwritten.
            </p>
            {error && <div class="notice plain">{error}</div>}
            <div class="button-pair">
              <button type="button" class="btn-secondary" disabled={busy} onClick={() => setMode('idle')}>
                Cancel
              </button>
              <button type="submit" class="btn-primary" disabled={!valid || busy}>
                {busy ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </form>
        )}
      </section>
    );
  }

  const config = loadSyncConfig();
  return (
    <section class="card stack-12" aria-labelledby="sync-title">
      <h2 id="sync-title" class="section-title">
        Sync between devices
      </h2>
      <div class={`sync-status ${status.state}`} role="status">
        <span class="sync-dot" aria-hidden="true" />
        <span>{statusText(status)}</span>
      </div>
      <div class="button-pair">
        <button type="button" class="btn-secondary" onClick={() => setMode(mode === 'show' ? 'idle' : 'show')}>
          {mode === 'show' ? 'Hide sync key' : 'Show sync key'}
        </button>
        <button
          type="button"
          class="btn-primary"
          disabled={status.state === 'syncing'}
          onClick={async () => {
            const { syncNow } = await engine();
            const { added } = await syncNow();
            if (added > 0) showToast(`${added} ${added === 1 ? 'entry' : 'entries'} synced from other devices`);
          }}
        >
          Sync now
        </button>
      </div>

      {mode === 'show' && config && (
        <>
          <p class="body-text">
            To add a device: open the app there, go to <strong>Settings → Sync between devices → I have a key</strong>, and
            enter these words.
          </p>
          <Words phrase={config.phrase} />
          <button type="button" class="btn-secondary" onClick={() => copy(config.phrase)}>
            Copy the 12 words
          </button>
        </>
      )}

      <details class="relays">
        <summary>Relays ({config?.relays.length ?? 0})</summary>
        <p class="field-hint">
          Free public Nostr relays that pass the encrypted data between your devices. One per line; every device should
          use at least one relay in common.
        </p>
        <textarea
          class="input textarea mono"
          rows={4}
          autoCapitalize="off"
          autoCorrect="off"
          spellcheck={false}
          value={relayText}
          onInput={(e) => setRelayText((e.target as HTMLTextAreaElement).value)}
        />
        <div class="button-pair">
          <button type="button" class="btn-secondary" onClick={() => setRelayText(DEFAULT_RELAYS.join('\n'))}>
            Defaults
          </button>
          <button
            type="button"
            class="btn-primary"
            onClick={async () => {
              const relays = relayText.split(/\s+/).filter(isRelayUrl);
              if (relays.length === 0) return showToast('Add at least one wss:// relay');
              const { setRelays } = await engine();
              await setRelays(relays);
              showToast('Relays saved');
            }}
          >
            Save relays
          </button>
        </div>
      </details>

      <button
        type="button"
        class="link-btn left danger"
        onClick={async () => {
          if (!confirm('Stop syncing on this device? Your log stays here, and your other devices keep theirs.')) return;
          const { disableSync } = await engine();
          disableSync();
          setMode('idle');
          showToast('Sync turned off on this device');
        }}
      >
        Turn off sync on this device
      </button>
    </section>
  );
}
