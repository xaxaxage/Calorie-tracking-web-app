import type { GeminiModelInfo, Settings } from '../types';
import type { EstimatedItem, EstimateInput } from './shared';

export type { EstimatedItem, EstimateInput, PreparedImage } from './shared';

/** Aliases Google keeps pointing at its newest Flash models. */
export const GEMINI_SHORTCUTS: (GeminiModelInfo & { hint: string })[] = [
  { id: 'gemini-flash-lite-latest', label: 'Flash-Lite (newest)', hint: 'most free uses per day' },
  { id: 'gemini-flash-latest', label: 'Flash (newest)', hint: 'more accurate, fewer free uses' },
];

const MAX_MODELS_TO_TRY = 5;

export function providerName(settings: Settings): string {
  return settings.aiProvider === 'claude' ? 'Claude' : 'Gemini';
}

/** "Claude (paid)" or "Gemini · Flash-Lite (newest)", for showing which AI is in use. */
export function providerSummary(settings: Settings): string {
  return settings.aiProvider === 'claude' ? 'Claude (paid)' : `Gemini · ${geminiLabel(settings, settings.geminiModel)}`;
}

/** True when the chosen AI provider has a key. */
export function aiReady(settings: Settings): boolean {
  const key = settings.aiProvider === 'claude' ? settings.apiKey : settings.geminiKey;
  return key.trim().length > 0;
}

/** A readable name for a Gemini model ID. */
export function geminiLabel(settings: Settings, id: string): string {
  return (
    GEMINI_SHORTCUTS.find((m) => m.id === id)?.label ?? settings.geminiModels.find((m) => m.id === id)?.label ?? id
  );
}

/**
 * Models to try, in order: the chosen one, then (with automatic switching on)
 * the "newest" aliases and the other Flash models on the key, then one Gemma
 * model. Pro models are left out of switching: free keys can't use them.
 */
export function geminiChain(settings: Settings): string[] {
  const chosen = settings.geminiModel;
  if (!settings.geminiAutoSwitch) return [chosen];
  const listed = settings.geminiModels.map((m) => m.id);
  const flash = listed.filter((id) => /^gemini-.*flash/i.test(id));
  const gemma = listed.filter((id) => /^gemma-/i.test(id) && !/-(1b|270m)/i.test(id)).slice(0, 1);
  const order = [chosen, ...GEMINI_SHORTCUTS.map((m) => m.id), ...flash, ...gemma];
  return [...new Set(order)].filter((id) => id === chosen || !/pro/i.test(id)).slice(0, MAX_MODELS_TO_TRY);
}

export interface EstimateResult {
  items: EstimatedItem[];
  /** Who produced the estimate, e.g. "Gemini · Flash-Lite (newest)". */
  source: string;
}

/** Ask the chosen provider for an estimate. Provider code is only downloaded when first used. */
export async function estimate(
  settings: Settings,
  input: EstimateInput,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<EstimateResult> {
  if (settings.aiProvider === 'claude') {
    const { estimateWithClaude, CLAUDE_MODEL } = await import('./claude');
    const items = await estimateWithClaude(settings.apiKey.trim(), input, signal);
    return { items, source: `Claude · ${CLAUDE_MODEL}` };
  }
  const { estimateWithGemini } = await import('./gemini');
  const { items, model } = await estimateWithGemini(
    settings.geminiKey.trim(),
    geminiChain(settings),
    input,
    signal,
    onProgress,
    (id) => geminiLabel(settings, id),
  );
  return { items, source: `Gemini · ${geminiLabel(settings, model)}` };
}

export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const { listGeminiModels } = await import('./gemini');
  return listGeminiModels(apiKey.trim());
}

export async function prepareImage(file: Blob) {
  const { prepareImage } = await import('./shared');
  return prepareImage(file);
}
