import { providerSummary } from '../lib/ai';
import { updateSettings, useData } from '../lib/store';
import { navigate } from '../lib/router';

/** "Using Gemini · Flash-Lite (newest) · Change" under the AI buttons. */
export function ProviderLine() {
  const { settings } = useData();
  return (
    <p class="provider-line">
      Using {providerSummary(settings)} · <a href="#/settings">Change</a>
    </p>
  );
}

/**
 * Offered when Claude can't be used (no credit, bad key): switch to Gemini and
 * retry, or go set up a Gemini key first.
 */
export function UseGeminiButton({ onSwitched }: { onSwitched: () => void }) {
  const { settings } = useData();
  const hasKey = settings.geminiKey.trim().length > 0;
  return (
    <button
      type="button"
      class="btn-primary"
      onClick={() => {
        updateSettings({ aiProvider: 'gemini' });
        if (hasKey) onSwitched();
        else navigate('/settings');
      }}
    >
      {hasKey ? 'Use free Gemini instead' : 'Set up free Gemini'}
    </button>
  );
}
