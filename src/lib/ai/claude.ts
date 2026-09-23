import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  AiError,
  normalizeItems,
  PHOTO_PROMPT,
  PHOTO_SCHEMA,
  TEXT_SCHEMA,
  textPrompt,
  type EstimatedItem,
  type EstimateInput,
} from './shared';

/**
 * Estimates with Claude (paid, uses the person's own Anthropic API key). The
 * request goes straight from the phone to the Anthropic API. Loaded on demand.
 */

export const CLAUDE_MODEL = 'claude-opus-5';

export async function estimateWithClaude(
  apiKey: string,
  input: EstimateInput,
  signal?: AbortSignal,
): Promise<EstimatedItem[]> {
  const client = new Anthropic({
    apiKey,
    // The key belongs to the person using this app and never leaves their device except to call the API.
    dangerouslyAllowBrowser: true,
    timeout: 120_000,
    maxRetries: 1,
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] =
    input.kind === 'photo'
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.image.base64 } },
          { type: 'text', text: PHOTO_PROMPT },
        ]
      : [{ type: 'text', text: textPrompt(input.text) }];

  let message;
  try {
    message = await client.beta.messages.parse(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        // If the model declines, the API retries on Anthropic's recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          format: jsonSchemaOutputFormat(input.kind === 'photo' ? PHOTO_SCHEMA : TEXT_SCHEMA),
        },
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiError('Your Anthropic API key was not accepted. Check it in Settings.');
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      throw new AiError('Your Anthropic API key does not have access to this model. Check your Anthropic account.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AiError('Too many requests right now. Wait a minute and try again.');
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AiError(`Claude could not process this: ${err.message}`);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AiError('No connection to Anthropic. Check your internet and try again.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new AiError(`Anthropic returned an error (${err.status ?? 'unknown'}). Try again in a moment.`);
    }
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    throw new AiError('This could not be analysed. Try again with different wording or a different photo.');
  }
  if (!message.parsed_output) throw new AiError('The estimate came back incomplete. Try again.');
  return normalizeItems(message.parsed_output, input.kind === 'photo');
}
