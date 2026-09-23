import { ApiError, GoogleGenAI } from '@google/genai';
import {
  AiError,
  normalizeItems,
  parseJsonReply,
  PHOTO_PROMPT,
  PHOTO_SCHEMA,
  TEXT_SCHEMA,
  textPrompt,
  type EstimatedItem,
  type EstimateInput,
} from './shared';

/**
 * Estimates with Google Gemini. Gemini API keys from Google AI Studio come
 * with a free daily allowance, which makes this the no-cost AI option.
 * The request goes straight from the phone to Google. Loaded on demand.
 */

export async function estimateWithGemini(
  apiKey: string,
  model: string,
  input: EstimateInput,
  signal?: AbortSignal,
): Promise<EstimatedItem[]> {
  const ai = new GoogleGenAI({ apiKey });
  const parts =
    input.kind === 'photo'
      ? [{ inlineData: { mimeType: 'image/jpeg', data: input.image.base64 } }, { text: PHOTO_PROMPT }]
      : [{ text: textPrompt(input.text) }];

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: input.kind === 'photo' ? PHOTO_SCHEMA : TEXT_SCHEMA,
        abortSignal: signal,
        httpOptions: { timeout: 90_000 },
      },
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof ApiError) {
      const msg = err.message ?? '';
      if (/api key not valid|API_KEY_INVALID/i.test(msg)) {
        throw new AiError('Your Gemini API key was not accepted. Check it in Settings.');
      }
      if (/location is not supported/i.test(msg)) {
        throw new AiError("Google's Gemini API isn't available in your country, so this key can't be used here.");
      }
      if (err.status === 429) {
        throw new AiError(
          "You've reached Gemini's free limit for now. Wait a minute and try again — if the daily allowance is used up, it resets tomorrow.",
        );
      }
      if (err.status === 403) {
        throw new AiError('This Gemini key is not allowed to use the model. Create a new key in Google AI Studio.');
      }
      if (err.status === 404) {
        throw new AiError('That Gemini model is not available to your key. Pick the other model in Settings.');
      }
      if (err.status >= 500) throw new AiError('Gemini is busy right now. Try again in a moment.');
      throw new AiError(`Gemini could not process this (${err.status}). Try again.`);
    }
    throw new AiError('No connection to Google. Check your internet and try again.');
  }

  if (response.promptFeedback?.blockReason) {
    throw new AiError('Gemini declined to analyse this. Try a different photo or wording.');
  }
  return normalizeItems(parseJsonReply(response.text), input.kind === 'photo');
}
