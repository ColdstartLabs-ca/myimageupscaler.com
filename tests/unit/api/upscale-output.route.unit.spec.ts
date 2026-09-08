import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  retrieveDeliverableOutput: vi.fn(),
  acknowledgeReceipt: vi.fn(),
  supabaseRpc: vi.fn(),
  supabaseFrom: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: {
    retrieveDeliverableOutput: mocks.retrieveDeliverableOutput,
    acknowledgeReceipt: mocks.acknowledgeReceipt,
  },
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: mocks.supabaseRpc,
    from: mocks.supabaseFrom,
    storage: { from: mocks.storageFrom },
  },
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { SUPABASE_URL: 'https://project-ref.supabase.co' },
  clientEnv: { SUPABASE_URL: 'https://project-ref.supabase.co' },
}));

import { POST } from '@/app/api/upscale/output/route';

function outputRequest(body: unknown, userId = 'user-1', signal?: AbortSignal): NextRequest {
  return new NextRequest('https://example.com/api/upscale/output', {
    method: 'POST',
    headers: userId ? { 'X-User-Id': userId, Authorization: 'Bearer token-123' } : {},
    body: JSON.stringify(body),
    signal,
  });
}

const capability = {
  reservationJobId: '11111111-1111-4111-8111-111111111111',
  deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
};

function durableOutput(sizeBytes = 11) {
  const path = `user-1/outputs/${capability.reservationJobId}/22222222-2222-4222-8222-222222222222.png`;
  mocks.supabaseFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { job_id: capability.reservationJobId }, error: null }),
        }),
      }),
    }),
  });
  mocks.supabaseRpc.mockImplementation(async (name: string) => ({
    data:
      name === 'acquire_upscale_delivery_lease'
        ? [
            {
              output_storage_path: path,
              output_mime_type: 'image/png',
              output_size_bytes: sizeBytes,
              output_expires_at: new Date(Date.now() + 86400_000).toISOString(),
            },
          ]
        : true,
    error: null,
  }));
  mocks.createSignedUrl.mockResolvedValue({
    data: {
      signedUrl: `https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/${path}?token=signed`,
    },
    error: null,
  });
  return path;
}

describe('POST /api/upscale/output', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.supabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
        })),
      })),
    });
    mocks.supabaseRpc.mockResolvedValue({ data: null, error: null });
    mocks.storageFrom.mockReturnValue({ createSignedUrl: mocks.createSignedUrl });
    mocks.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          'https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/job.png?token=signed',
      },
      error: null,
    });
  });

  it('delivers an immutable attempt-specific object and acknowledges its exact path', async () => {
    const path = durableOutput();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('image-bytes', { headers: { 'content-type': 'image/png' } })
        )
    );
    const response = await POST(outputRequest(capability));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('image-bytes');
    expect(mocks.supabaseRpc).toHaveBeenCalledWith(
      'acknowledge_upscale_execution',
      expect.objectContaining({ p_output_storage_path: path })
    );
  });

  it('rejects truncated output before settling credits even without Content-Length', async () => {
    durableOutput(15);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('image-bytes', { headers: { 'content-type': 'image/png' } })
        )
    );
    const response = await POST(outputRequest(capability));
    expect(response.status).toBe(200);
    await expect(response.arrayBuffer()).rejects.toThrow(/size|length/i);
    expect(
      mocks.supabaseRpc.mock.calls.some(([name]) => name === 'acknowledge_upscale_execution')
    ).toBe(false);
  });

  it('withholds the final bytes until delivery settlement succeeds', async () => {
    durableOutput();
    let settle!: (value: { data: boolean; error: null }) => void;
    const previous = mocks.supabaseRpc.getMockImplementation()!;
    mocks.supabaseRpc.mockImplementation((name, args) =>
      name === 'acknowledge_upscale_execution'
        ? new Promise(resolve => {
            settle = resolve;
          })
        : previous(name, args)
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('image-bytes', {
            headers: { 'content-type': 'image/png', 'content-length': '11' },
          })
        )
    );
    const response = await POST(outputRequest(capability));
    expect(response.status).toBe(200);
    let received = false;
    const read = response
      .body!.getReader()
      .read()
      .then(result => {
        received = true;
        return result;
      });
    await vi.waitFor(() => expect(settle).toBeTypeOf('function'));
    expect(received).toBe(false);
    settle({ data: true, error: null });
    expect(new TextDecoder().decode((await read).value)).toBe('image-bytes');
  });

  it('renews every thirty seconds and permits a healthy slow download beyond two minutes', async () => {
    vi.useFakeTimers();
    try {
      durableOutput();
      let upstreamSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url, init) => {
          upstreamSignal = init.signal;
          return new Response('image-bytes', { headers: { 'content-type': 'image/png' } });
        })
      );
      const response = await POST(outputRequest(capability));
      expect(response.status).toBe(200);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mocks.supabaseRpc).toHaveBeenCalledWith(
        'renew_upscale_delivery_lease',
        expect.any(Object)
      );
      await vi.advanceTimersByTimeAsync(120_000);
      expect(upstreamSignal?.aborted).toBe(false);
      expect(await response.text()).toBe('image-bytes');
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses the database lease expiry even when signing and headers are delayed', async () => {
    vi.useFakeTimers();
    try {
      durableOutput();
      const previous = mocks.supabaseRpc.getMockImplementation()!;
      mocks.supabaseRpc.mockImplementation(async (name, args) => {
        const result = await previous(name, args);
        if (name === 'acquire_upscale_delivery_lease') {
          result.data[0].delivery_lease_expires_at = new Date(Date.now() + 10_000).toISOString();
        }
        return result;
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('image-bytes', { headers: { 'content-type': 'image/png' } })
          )
      );
      const response = await POST(outputRequest(capability));
      await vi.advanceTimersByTimeAsync(9_001);
      await expect(response.text()).rejects.toThrow(/lease expired/i);
      expect(
        mocks.supabaseRpc.mock.calls.some(([name]) => name === 'acknowledge_upscale_execution')
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not add renewal response latency to the database lease duration', async () => {
    vi.useFakeTimers();
    try {
      durableOutput();
      const previous = mocks.supabaseRpc.getMockImplementation()!;
      let renewals = 0;
      mocks.supabaseRpc.mockImplementation(async (name, args) => {
        if (name !== 'renew_upscale_delivery_lease') return previous(name, args);
        if (++renewals === 1) {
          await new Promise(resolve => setTimeout(resolve, 50_000));
          return { data: true, error: null };
        }
        return { data: null, error: { code: 'PGRST202' } };
      });
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response('image-bytes', { headers: { 'content-type': 'image/png' } })
          )
      );
      const response = await POST(outputRequest(capability));
      await vi.advanceTimersByTimeAsync(149_001);
      await expect(response.text()).rejects.toThrow(/lease expired/i);
      expect(
        mocks.supabaseRpc.mock.calls.some(([name]) => name === 'acknowledge_upscale_execution')
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases the lease and timers immediately if the request aborts before the first read', async () => {
    vi.useFakeTimers();
    try {
      durableOutput();
      const cancel = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(new ReadableStream({ cancel }), {
              headers: { 'content-type': 'image/png' },
            })
          )
      );
      const abort = new AbortController();
      const response = await POST(outputRequest(capability, 'user-1', abort.signal));
      abort.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(cancel).toHaveBeenCalled();
      expect(mocks.supabaseRpc).toHaveBeenCalledWith(
        'release_upscale_delivery_lease',
        expect.any(Object)
      );
      expect(vi.getTimerCount()).toBe(0);
      await expect(response.text()).rejects.toThrow(/aborted/i);
      expect(
        mocks.supabaseRpc.mock.calls.some(([name]) => name === 'acknowledge_upscale_execution')
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds the capability body before acquiring a delivery lease', async () => {
    const response = await POST(outputRequest({ ...capability, unused: 'x'.repeat(8192) }));
    expect(response.status).toBe(413);
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it('requires authentication before retrieving staged output', async () => {
    const response = await POST(outputRequest(capability, ''));

    expect(response.status).toBe(401);
    expect(mocks.retrieveDeliverableOutput).not.toHaveBeenCalled();
  });

  it('validates capability server-side and never trusts a client-supplied provider URL', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue(null);

    const response = await POST(
      outputRequest({
        ...capability,
        imageUrl: 'https://attacker.test/stolen.png',
      })
    );

    expect(response.status).toBe(404);
    expect(mocks.retrieveDeliverableOutput).toHaveBeenCalledWith(
      'user-1',
      capability.reservationJobId,
      capability.deliveryToken
    );
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('rejects non-HTTPS or non-Replicate staged URLs before server fetching', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'http://169.254.169.254/latest/meta-data',
      mimeType: 'image/png',
      expiresAt: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('allows only exact private Supabase output signed URLs for the configured project', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl:
        'https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/11111111-1111-4111-8111-111111111111.png?token=abc',
      mimeType: 'image/png',
      expiresAt: null,
    });
    mocks.acknowledgeReceipt.mockResolvedValue(true);
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(new TextEncoder().encode('image-bytes'), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );
    vi.stubGlobal('fetch', providerFetch);

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('image-bytes');
    expect(providerFetch).toHaveBeenCalledWith(
      'https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/11111111-1111-4111-8111-111111111111.png?token=abc',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it('retrieves v2 output by acquiring its durable lease and signs the object server-side', async () => {
    const outputObjectPath =
      'user-1/outputs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';
    mocks.supabaseFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: { job_id: capability.reservationJobId }, error: null })
            ),
          })),
        })),
      })),
    });
    mocks.supabaseRpc.mockImplementation((name: string) => {
      if (name === 'issue_upscale_delivery_capability') {
        return Promise.resolve({ data: true, error: null });
      }
      if (name === 'acquire_upscale_delivery_lease') {
        return Promise.resolve({
          data: [
            {
              output_storage_path: outputObjectPath,
              output_mime_type: 'image/png',
              output_size_bytes: '11',
              output_expires_at: '2026-11-27T00:00:00.000Z',
              lease_expires_at: '2026-11-27T00:02:00.000Z',
            },
          ],
          error: null,
        });
      }
      if (name === 'acknowledge_upscale_execution') {
        return Promise.resolve({ data: true, error: null });
      }
      if (name === 'release_upscale_delivery_lease') {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: {
        signedUrl:
          'https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png?token=signed',
      },
      error: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new TextEncoder().encode('image-bytes'), {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': '11' },
        })
      )
    );

    const response = await POST(outputRequest(capability));

    await expect(response.text()).resolves.toBe('image-bytes');
    expect(mocks.retrieveDeliverableOutput).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(outputObjectPath, 60);
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('acquire_upscale_delivery_lease', {
      p_user_id: 'user-1',
      p_job_id: capability.reservationJobId,
      p_delivery_token_hash: expect.any(String),
      p_lease_seconds: 120,
    });
    expect(mocks.supabaseRpc).toHaveBeenCalledWith('acknowledge_upscale_execution', {
      p_user_id: 'user-1',
      p_job_id: capability.reservationJobId,
      p_output_storage_path: outputObjectPath,
      p_output_mime_type: 'image/png',
      p_delivery_token_hash: expect.any(String),
    });
  });

  it('rejects Supabase storage URLs with credentials, ports, wrong hosts, or non-output paths', async () => {
    const badUrls = [
      'https://attacker:secret@project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/x.png?token=abc',
      'https://project-ref.supabase.co:444/storage/v1/object/sign/upscale-inputs/user-1/outputs/x.png?token=abc',
      'https://evil.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/outputs/x.png?token=abc',
      'https://project-ref.supabase.co/storage/v1/object/sign/upscale-inputs/user-1/input.png?token=abc',
      'https://project-ref.supabase.co/storage/v1/object/public/upscale-inputs/user-1/outputs/x.png',
    ];
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const imageUrl of badUrls) {
      mocks.retrieveDeliverableOutput.mockResolvedValue({
        imageUrl,
        mimeType: 'image/png',
        expiresAt: null,
      });
      const response = await POST(outputRequest(capability));
      expect(response.status).toBe(422);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non-image staged MIME types before server fetching', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.txt',
      mimeType: 'text/html',
      expiresAt: null,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('rejects an explicit non-image provider response before streaming or acknowledgement', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>temporary CDN error</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      )
    );

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(502);
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('does not follow redirects from an allowed staged URL to an internal host', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    const providerFetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.redirect === 'manual') {
        return Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { location: 'http://169.254.169.254/latest/meta-data' },
          })
        );
      }

      return Promise.resolve(
        new Response('internal-metadata', {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );
    });
    vi.stubGlobal('fetch', providerFetch);

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(502);
    expect(providerFetch).toHaveBeenCalledWith(
      'https://replicate.delivery/private-output.png',
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) })
    );
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('streams the server-staged provider bytes and completes billing before EOF', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: '2026-11-27T00:00:00.000Z',
    });
    mocks.acknowledgeReceipt.mockResolvedValue(true);
    const providerFetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('image-bytes'));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': '11' },
        }
      )
    );
    vi.stubGlobal('fetch', providerFetch);

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-type')).toBe('image/png');
    await expect(response.text()).resolves.toBe('image-bytes');
    expect(providerFetch).toHaveBeenCalledWith(
      'https://replicate.delivery/private-output.png',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(mocks.acknowledgeReceipt).toHaveBeenCalledWith('user-1', capability.reservationJobId, {
      deliveryToken: capability.deliveryToken,
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: '2026-11-27T00:00:00.000Z',
    });
  });

  it('errors the stream before EOF when acknowledgement fails so blob creation is unusable', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    mocks.acknowledgeReceipt.mockResolvedValue(false);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('partial-image'));
              controller.close();
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'image/png' },
          }
        )
      )
    );

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(200);
    await expect(response.blob()).rejects.toThrow(/acknowledge/i);
  });

  it('errors before acknowledgement when a successful provider response has no image bytes', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    mocks.acknowledgeReceipt.mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array(), {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': '0' },
        })
      )
    );

    const response = await POST(outputRequest(capability));

    await expect(response.blob()).rejects.toThrow(/empty/i);
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('rejects a provider response whose declared length exceeds the hard 128 MiB cap', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new ReadableStream(), {
          status: 200,
          headers: { 'content-type': 'image/png', 'content-length': String(128 * 1024 * 1024 + 1) },
        })
      )
    );

    const response = await POST(outputRequest(capability));

    expect(response.status).toBe(502);
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('pulls only one upstream chunk per downstream demand and cancellation skips acknowledgement', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    mocks.acknowledgeReceipt.mockResolvedValue(true);
    const chunks = [new TextEncoder().encode('a'), new TextEncoder().encode('b')];
    const read = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve({ done: false, value: chunks[0] }))
      .mockImplementationOnce(() => Promise.resolve({ done: false, value: chunks[1] }))
      .mockImplementation(() => Promise.resolve({ done: true }));
    const cancel = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png', 'content-length': '2' }),
        body: { getReader: () => ({ read, cancel, releaseLock }) },
      })
    );

    const response = await POST(outputRequest(capability));
    // WHATWG streams may prefetch one chunk up to their default high-water mark,
    // but must not eagerly drain the provider response into Worker memory.
    expect(read.mock.calls.length).toBeLessThanOrEqual(1);

    const reader = response.body!.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false, value: chunks[0] });
    expect(read.mock.calls.length).toBeLessThanOrEqual(2);
    await reader.cancel('user navigated away');

    expect(cancel).toHaveBeenCalledWith('user navigated away');
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });

  it('does not acknowledge when the request abort turns a pending upstream read into EOF', async () => {
    mocks.retrieveDeliverableOutput.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/private-output.png',
      mimeType: 'image/png',
      expiresAt: null,
    });
    mocks.acknowledgeReceipt.mockResolvedValue(true);

    let markPullStarted!: () => void;
    const pullStarted = new Promise<void>(resolve => {
      markPullStarted = resolve;
    });
    let finishRead!: (result: ReadableStreamReadResult<Uint8Array>) => void;
    const read = vi.fn(
      () =>
        new Promise<ReadableStreamReadResult<Uint8Array>>(resolve => {
          finishRead = resolve;
          markPullStarted();
        })
    );
    const cancelUpstream = vi.fn().mockImplementation(async () => {
      finishRead({ done: true, value: undefined });
    });
    const releaseLock = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        body: { getReader: () => ({ read, cancel: cancelUpstream, releaseLock }) },
      })
    );

    const requestAbort = new AbortController();
    const response = await POST(outputRequest(capability, 'user-1', requestAbort.signal));
    const downstreamRead = response.body!.getReader().read();
    await pullStarted;

    requestAbort.abort();

    await expect(downstreamRead).rejects.toThrow(/aborted/i);
    expect(cancelUpstream).toHaveBeenCalled();
    expect(mocks.acknowledgeReceipt).not.toHaveBeenCalled();
  });
});
