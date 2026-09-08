// @vitest-environment node
import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ModelRegistry } from '@server/services/model-registry';
import type { IExecutorAttempt, IExecutorExecution } from './advance';
import { ReplicateAdapter } from './replicate-adapter';

const registry = ModelRegistry.getInstance();
const attempt = {
  attempt_id: 'b',
  job_id: 'a',
  callback_correlation: 'c'.repeat(64),
  provider: 'replicate',
} as IExecutorAttempt;
const execution = (modelId = 'real-esrgan'): IExecutorExecution =>
  ({
    job_id: '11111111-1111-4111-8111-111111111111',
    user_id: 'u',
    provider: 'replicate',
    resolved_model_id: modelId,
    model_version: registry.getModel(modelId)!.modelVersion,
    input_storage_path: 'u/input.png',
    input_mime_type: 'image/png',
    input_width: 512,
    input_height: 512,
    config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
    deadline_at: new Date(Date.now() + 900_000).toISOString(),
  }) as IExecutorExecution;

describe('Replicate native transport contract', () => {
  it('sends one POST on a 503 and preserves ambiguous outcome', async () => {
    const transport = vi.fn(async () => new Response('{}', { status: 503 }));
    const adapter = new ReplicateAdapter({
      token: 'test',
      fetch: transport,
      callbackBaseUrl: 'https://callbacks.test/webhooks/replicate',
    });
    await expect(
      adapter.createPrediction(execution(), attempt, 'https://storage.test/input.png')
    ).rejects.toMatchObject({ ambiguous: true });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(
    registry
      .getEnabledModels()
      .filter(model => model.provider === 'replicate')
      .map(model => model.id)
  )('uses the stored endpoint and builder for %s', async modelId => {
    const transport = vi.fn(async () => Response.json({ id: 'prediction', status: 'starting' }));
    const adapter = new ReplicateAdapter({
      token: 'test',
      fetch: transport,
      callbackBaseUrl: 'https://callbacks.test/webhooks/replicate',
    });
    const plan = execution(modelId);
    await adapter.createPrediction(plan, attempt, 'https://storage.test/input.png');
    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe(
      plan.model_version!.includes(':')
        ? 'https://api.replicate.com/v1/predictions'
        : `https://api.replicate.com/v1/models/${plan.model_version}/predictions`
    );
    const body = JSON.parse(String(init.body));
    expect(body.webhook_events_filter).toEqual(['completed']);
    expect(body.webhook).toContain(attempt.callback_correlation);
    expect(body.input).toBeTypeOf('object');
    expect(new Headers(init.headers).has('prefer')).toBe(false);
  });

  it('rejects oversized prediction metadata before parsing and cancels the body', async () => {
    const cancel = vi.fn();
    const transport = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new Uint8Array(2 * 1024 * 1024));
            },
            cancel,
          }),
          { headers: { 'content-type': 'application/json' } }
        )
    );
    const adapter = new ReplicateAdapter({ token: 'test', fetch: transport });
    await expect(adapter.getPrediction('prediction')).rejects.toThrow(/limit/);
    expect(cancel).toHaveBeenCalled();
  });

  it('honors provider Retry-After and exposes cancellation', async () => {
    const transport = vi.fn(async () =>
      Response.json(
        { id: 'prediction', status: 'processing' },
        { headers: { 'retry-after': '90' } }
      )
    );
    const adapter = new ReplicateAdapter({ token: 'test', fetch: transport });
    expect((await adapter.getPrediction('prediction')).retryAfterMs).toBe(90_000);
    await adapter.cancelPrediction('prediction');
    expect(String(transport.mock.calls.at(-1)?.[0])).toBe(
      'https://api.replicate.com/v1/predictions/prediction/cancel'
    );
  });

  it('preserves Retry-After on rate-limited status requests', async () => {
    const adapter = new ReplicateAdapter({
      token: 'test',
      fetch: async () => new Response('{}', { status: 429, headers: { 'retry-after': '90' } }),
    });
    await expect(adapter.getPrediction('prediction')).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 90_000,
    });
  });

  it('validates raw-body signature and timestamp without parsing payload', async () => {
    const secret = Buffer.from('provider-signing-key');
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const body = '{"id":"p"}';
    const signature = createHmac('sha256', secret)
      .update(`message.${timestamp}.${body}`)
      .digest('base64');
    const adapter = new ReplicateAdapter({
      token: 'test',
      webhookSecret: `whsec_${secret.toString('base64')}`,
      now: () => now,
    });
    expect(
      await adapter.verifyWebhook({
        body,
        headers: { id: 'message', timestamp, signature: `v1,${signature}` },
      })
    ).toBe(true);
    expect(
      await adapter.verifyWebhook({
        body: `${body} `,
        headers: { id: 'message', timestamp, signature: `v1,${signature}` },
      })
    ).toBe(false);
    expect(
      await adapter.verifyWebhook({
        body,
        headers: { id: 'message', timestamp: '1', signature: `v1,${signature}` },
      })
    ).toBe(false);
  });
});
