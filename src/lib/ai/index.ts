import type { Settings } from '../types';
import type { EstimatedItem, EstimateInput } from './shared';

export type { EstimatedItem, EstimateInput, PreparedImage } from './shared';

export const GEMINI_MODELS = [
  { id: 'gemini-flash-lite-latest', label: 'Flash-Lite', hint: 'Most free uses per day' },
  { id: 'gemini-flash-latest', label: 'Flash', hint: 'More accurate, fewer free uses' },
] as const;

export function providerName(settings: Settings): string {
  return settings.aiProvider === 'claude' ? 'Claude' : 'Gemini';
}

/** True when the chosen AI provider has a key. */
export function aiReady(settings: Settings): boolean {
  const key = settings.aiProvider === 'claude' ? settings.apiKey : settings.geminiKey;
  return key.trim().length > 0;
}

/** Ask the chosen provider for an estimate. Provider code is only downloaded when first used. */
export async function estimate(settings: Settings, input: EstimateInput, signal?: AbortSignal): Promise<EstimatedItem[]> {
  if (settings.aiProvider === 'claude') {
    const { estimateWithClaude } = await import('./claude');
    return estimateWithClaude(settings.apiKey.trim(), input, signal);
  }
  const { estimateWithGemini } = await import('./gemini');
  return estimateWithGemini(settings.geminiKey.trim(), settings.geminiModel, input, signal);
}

export async function prepareImage(file: Blob) {
  const { prepareImage } = await import('./shared');
  return prepareImage(file);
}
