import { describe, expect, it, vi } from 'vitest';

import type { IExecutorAttempt, IExecutorExecution } from './advance';
import { GeminiAdapter, GeminiAdapterError } from './gemini-adapter';

const jobId = '11111111-1111-4111-8111-111111111111';
const attemptId = '22222222-2222-4222-8222-222222222222';

function execution(overrides: Partial<IExecutorExecution> = {}): IExecutorExecution {
  return {
    job_id: jobId,
    user_id: '33333333-3333-4333-8333-333333333333',
    input_storage_path: '33333333-3333-4333-8333-333333333333/input.png',
    input_mime_type: 'image/png',
    input_size_bytes: 4,
    input_width: 64,
    input_height: 64,
    quality_tier: 'quick',
    scale: 4,
    config: {
      qualityTier: 'quick',
      scale: 4,
      additionalOptions: {
        smartAnalysis: false,
        enhance: true,
        enhanceFaces: false,
        preserveText: false,
        customInstructions: 'Restore detail but preserve the exact composition.',
      },
    },
    billing_model_id: 'nano-banana',
    resolved_model_id: 'nano-banana',
    provider: 'gemini',
    model_version: 'gemini-2.5-flash-image',
    stage: 'submitting',
    lease_generation: 1,
    deadline_at: '2099-01-01T00:00:00.000Z',
    next_action_at: null,
    output_storage_path: null,
    output_mime_type: null,
    output_size_bytes: null,
    output_expires_at: null,
    failure_reason: null,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function attempt(overrides: Partial<IExecutorAttempt> = {}): IExecutorAttempt {
  return {
    attempt_id: attemptId,
    job_id: jobId,
    ordinal: 1,
    provider: 'gemini',
    model_id: 'nano-banana',
    model_version: 'gemini-2.5-flash-image',
    callback_correlation: 'c'.repeat(64),
    submission_state: 'pending',
    provider_prediction_id: null,
    provider_status: null,
    provider_output_url: null,
    provider_output_mime_type: null,
    provider_output_expires_at: null,
    failure_reason: null,
    next_poll_at: null,
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('GeminiAdapter', () => {
  it('recovers published private output by path after signed URL rotation', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1])))
      .mockResolvedValueOnce(
        jsonResponse({
          responseId: 'r',
          candidates: [
            {
              finishReason: 'STOP',
              content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AQIDBA==' } }] },
            },
          ],
        })
      );
    const adapter = new GeminiAdapter({
      apiKey: 'test',
      fetch: fetcher,
      publishOutput: async () => ({
        storagePath: 'u/outputs/j/a.png',
        url: 'https://storage.test/first.png',
      }),
      resolveOutputUrl: async () => 'https://storage.test/renewed.png',
    });
    const created = await adapter.createPrediction(
      execution(),
      attempt(),
      'https://storage.test/input.png'
    );
    expect(created.output).toEqual({ url: 'https://storage.test/first.png' });
    expect(JSON.stringify(created.id)).not.toContain('first.png');
    expect((await adapter.getPrediction(created.id)).output).toEqual({
      url: 'https://storage.test/renewed.png',
    });
  });

  it('keeps the generation deadline active while the response body stalls', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1])))
      .mockImplementationOnce(
        async (_url, init) =>
          new Response(
            new ReadableStream({
              start(controller) {
                init?.signal?.addEventListener(
                  'abort',
                  () => controller.error(new Error('aborted')),
                  { once: true }
                );
              },
            })
          )
      );
    const adapter = new GeminiAdapter({ apiKey: 'test', fetch: fetcher, requestTimeoutMs: 10 });
    await expect(
      adapter.createPrediction(execution(), attempt(), 'https://storage.test/input.png')
    ).rejects.toMatchObject({ ambiguous: true });
  });

  it('rejects a declared response above the separate 192 MiB transport cap before reading', async () => {
    const cancel = vi.fn();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1])))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { 'content-length': String(192 * 1024 * 1024 + 1) },
        })
      );
    const adapter = new GeminiAdapter({ apiKey: 'test', fetch: fetcher });
    await expect(
      adapter.createPrediction(execution(), attempt(), 'https://storage.test/input.png')
    ).rejects.toThrow(/byte limit/);
    expect(cancel).toHaveBeenCalled();
  });
  it('uses the stored model and custom prompt, then returns a recoverable staged-output URL', async () => {
    const outputBytes = new Uint8Array([137, 80, 78, 71]);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { 'content-type': 'image/png', 'content-length': '4' },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          responseId: 'gemini-response-1',
          modelVersion: 'gemini-2.5-flash-image-001',
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: Buffer.from(outputBytes).toString('base64'),
                    },
                  },
                ],
              },
            },
          ],
        })
      );
    const publishOutput = vi.fn(async () => 'https://replicate.delivery/gemini/output.png');
    const adapter = new GeminiAdapter({
      apiKey: 'test-key',
      fetch: fetcher,
      publishOutput,
      maxInputBytes: 8,
      maxOutputBytes: 8,
    });

    const created = await adapter.createPrediction(
      execution(),
      attempt(),
      'https://storage.example/input.png'
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [requestUrl, requestInit] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(requestUrl).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent'
    );
    expect(requestInit.headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      contents: [
        {
          parts: [
            { inlineData: { mimeType: 'image/png', data: 'AQIDBA==' } },
            { text: 'Restore detail but preserve the exact composition.' },
          ],
        },
      ],
      generationConfig: { responseModalities: ['IMAGE'], temperature: 0.4 },
    });
    expect(publishOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        attemptId,
        mimeType: 'image/png',
        bytes: Buffer.from(outputBytes),
      })
    );
    expect(created).toMatchObject({
      status: 'succeeded',
      model: 'gemini-2.5-flash-image',
      version: 'gemini-2.5-flash-image-001',
      output: { url: 'https://replicate.delivery/gemini/output.png' },
    });

    await expect(adapter.getPrediction(created.id)).resolves.toEqual(created);
    expect(adapter.matchesAttempt(created, execution(), attempt(), 'ignored')).toBe(true);
  });

  it('builds enhancement constraints from the immutable stored execution config', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), { headers: { 'content-length': '1' } })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          responseId: 'response-2',
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    fileData: {
                      mimeType: 'image/png',
                      fileUri: 'https://replicate.delivery/gemini/two.png',
                    },
                  },
                ],
              },
            },
          ],
        })
      );
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: fetcher, maxInputBytes: 2 });

    await adapter.createPrediction(
      execution({
        config: {
          qualityTier: 'quick',
          scale: 4,
          additionalOptions: {
            smartAnalysis: false,
            enhance: true,
            enhanceFaces: true,
            preserveText: true,
            enhancement: { denoise: true },
          },
        },
      }),
      attempt(),
      'https://storage.example/input.png'
    );

    const body = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    const prompt = body.contents[0].parts[1].text as string;
    expect(prompt).toContain('Reconstruct the image at 4x resolution');
    expect(prompt).toContain("without altering the person's identity");
    expect(prompt).toContain('Apply strong denoising');
    expect(prompt).toContain('Preserve all text, logos, and typography exactly');
    expect(prompt).toContain('Return ONLY the generated image');
  });

  it('rejects an input stream that exceeds its byte bound before calling Gemini', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4, 5]), {
        headers: { 'content-type': 'image/png' },
      })
    );
    const adapter = new GeminiAdapter({ apiKey: 'test-key', fetch: fetcher, maxInputBytes: 4 });

    await expect(
      adapter.createPrediction(execution(), attempt(), 'https://storage.example/input.png')
    ).rejects.toThrow('Gemini input exceeds the executor byte limit');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('marks a timed-out Gemini generation as ambiguous so the executor never retries create', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1]), { headers: { 'content-length': '1' } })
      )
      .mockImplementationOnce(async (_url, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
            { once: true }
          );
        });
      });
    const adapter = new GeminiAdapter({
      apiKey: 'test-key',
      fetch: fetcher,
      maxInputBytes: 2,
      requestTimeoutMs: 5,
    });

    const error = await adapter
      .createPrediction(execution(), attempt(), 'https://storage.example/input.png')
      .catch(value => value);

    expect(error).toBeInstanceOf(GeminiAdapterError);
    expect(error).toMatchObject({ ambiguous: true });
  });
});
