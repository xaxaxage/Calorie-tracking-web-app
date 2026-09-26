import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  AiError,
  normalizeItems,
  PHOTO_SCHEMA,
  promptFor,
  TEXT_SCHEMA,
  type EstimatedItem,
  type EstimateInput,
} from './shared';
import { newOp, recordUsage, type UsageKind, type UsageOutcome } from './usage';

/**
 * Estimates with Claude (paid, uses the person's own Anthropic API key). The
 * request goes straight from the phone to the Anthropic API. Loaded on demand.
 */

export const CLAUDE_MODEL = 'claude-opus-5';

/** Anthropic's own explanation from the error body, without the status code and raw JSON. */
function apiMessage(err: InstanceType<typeof Anthropic.APIError>): string {
  const body = err.error as { error?: { message?: unknown } } | undefined;
  return typeof body?.error?.message === 'string' ? body.error.message : err.message;
}

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
    // Retries are done below, so that every request shows up in the usage log.
    maxRetries: 0,
  });

  const content: Anthropic.Beta.BetaContentBlockParam[] =
    input.kind === 'photo'
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: input.image.base64 } },
          { type: 'text', text: promptFor(input) },
        ]
      : [{ type: 'text', text: promptFor(input) }];

  const op = newOp();
  const kind: UsageKind = input.correction ? 'correction' : input.kind;
  const send = async () => {
    const started = Date.now();
    const logged = { at: started, op, provider: 'claude' as const, model: CLAUDE_MODEL, kind };
    try {
      const reply = await client.beta.messages.parse(
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
      recordUsage({
        ...logged,
        ms: Date.now() - started,
        outcome: reply.stop_reason === 'refusal' || !reply.parsed_output ? 'failed' : 'ok',
        tokensIn: reply.usage.input_tokens + (reply.usage.cache_read_input_tokens ?? 0) + (reply.usage.cache_creation_input_tokens ?? 0),
        tokensOut: reply.usage.output_tokens,
      });
      return reply;
    } catch (err) {
      const outcome: UsageOutcome =
        err instanceof Anthropic.APIUserAbortError
          ? 'cancelled'
          : err instanceof Anthropic.RateLimitError
            ? 'limit'
            : err instanceof Anthropic.APIError && (err.status ?? 0) >= 500
              ? 'busy'
              : 'failed';
      recordUsage({ ...logged, ms: Date.now() - started, outcome });
      throw err;
    }
  };

  let message;
  try {
    try {
      message = await send();
    } catch (err) {
      // Overloaded or a server hiccup: one more try after a short pause.
      if (!(err instanceof Anthropic.APIError) || (err.status ?? 0) < 500 || signal?.aborted) throw err;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      message = await send();
    }
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) throw err;
    // No credit shows up as a 402 billing_error or as a 400 whose message says so.
    if (
      err instanceof Anthropic.APIError &&
      (err.type === 'billing_error' || err.status === 402 || /credit balance|purchase credits/i.test(apiMessage(err)))
    ) {
      throw new AiError(
        "Your Anthropic account has no credit, so Claude can't be used. Gemini is free — switch to it instead.",
        'use-gemini',
      );
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiError('Your Anthropic API key was not accepted. Check it in Settings, or switch to free Gemini.', 'use-gemini');
    }
    if (err instanceof Anthropic.PermissionDeniedError) {
      throw new AiError('Your Anthropic API key does not have access to this model. Check your Anthropic account.');
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AiError('Too many requests right now. Wait a minute and try again.');
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AiError(`Claude could not process this: ${apiMessage(err)}`);
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
