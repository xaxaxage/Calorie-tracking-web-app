import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateWithClaude } from '../src/lib/ai/claude';
import { AiError } from '../src/lib/ai/shared';

const anthropicError = (status: number, type: string, message: string) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message }, request_id: 'req_test' }), {
    status,
    headers: { 'Content-Type': 'application/json', 'request-id': 'req_test' },
  });

function stub(response: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async () => response()));
}

afterEach(() => vi.unstubAllGlobals());

const run = () => estimateWithClaude('sk-ant-test', { kind: 'text', text: 'banana' });

describe('Claude errors', () => {
  it('turns "credit balance too low" into a clear message with a switch to Gemini', async () => {
    stub(() =>
      anthropicError(
        400,
        'invalid_request_error',
        'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
      ),
    );
    const err = await run().catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.fix).toBe('use-gemini');
    expect(err.message).toMatch(/no credit/);
    expect(err.message).not.toContain('{');
  });

  it('treats a 402 billing error the same way', async () => {
    stub(() => anthropicError(402, 'billing_error', 'Payment required.'));
    const err = await run().catch((e) => e);
    expect(err.fix).toBe('use-gemini');
  });

  it('offers Gemini when the key is rejected', async () => {
    stub(() => anthropicError(401, 'authentication_error', 'invalid x-api-key'));
    const err = await run().catch((e) => e);
    expect(err.message).toMatch(/not accepted/);
    expect(err.fix).toBe('use-gemini');
  });

  it("shows Anthropic's own words, not raw JSON, for other bad requests", async () => {
    stub(() => anthropicError(400, 'invalid_request_error', 'Image is too large.'));
    const err = await run().catch((e) => e);
    expect(err.message).toBe('Claude could not process this: Image is too large.');
    expect(err.fix).toBeUndefined();
  });
});
