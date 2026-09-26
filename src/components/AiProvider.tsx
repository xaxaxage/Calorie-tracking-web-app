import { providerSummary } from '../lib/ai';
import { dayUsedUp, modelLimits, useUsage } from '../lib/ai/usage';
import { updateSettings, useData } from '../lib/store';
import { navigate } from '../lib/router';

/**
 * "Using Gemini · Flash-Lite (newest) · Change" under the AI buttons, with a
 * warning when the chosen model is out of free uses for the day.
 */
export function ProviderLine() {
  const { settings } = useData();
  useUsage();
  const model = settings.geminiModel;
  const usedUp = settings.aiProvider === 'gemini' && dayUsedUp(model);
  const until = modelLimits(model).dayUsedUpUntil;
  return (
    <p class="provider-line">
      Using {providerSummary(settings)} · <a href="#/settings">Change</a>
      {usedUp && until && (
        <span class="provider-warn">
          {' '}
          It's out of free uses until{' '}
          {new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {settings.geminiAutoSwitch ? ', so another model is used' : ''} · <a href="#/usage">Usage</a>
        </span>
      )}
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
