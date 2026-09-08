import { describe, expect, it, vi } from 'vitest';
import {
  createStreamingOutputStager,
  type IExecutorAttempt,
  type IExecutorExecution,
} from './advance';

const execution = { user_id: 'user', job_id: 'job' } as IExecutorExecution;
const attempt = {
  attempt_id: 'attempt',
  provider_output_url: 'https://replicate.delivery/output.png',
} as IExecutorAttempt;
function png() {
  const b = Buffer.alloc(32);
  b.set([137, 80, 78, 71, 13, 10, 26, 10]);
  b.writeUInt32BE(2048, 16);
  b.writeUInt32BE(1024, 20);
  return b;
}
const consume = async (_path: string, body: ReadableStream<Uint8Array>) => {
  for await (const _chunk of body as unknown as AsyncIterable<Uint8Array>) {
    /* storage consumes with backpressure */
  }
};

describe('bounded durable output staging', () => {
  it('should use the durable job output key and verify length, type and dimensions before ready', async () => {
    const upload = vi.fn(consume);
    const stat = vi.fn(async () => ({ sizeBytes: 32, mimeType: 'image/png' }));
    const stager = createStreamingOutputStager({
      storage: { upload, stat },
      fetch: async () =>
        new Response(png(), { headers: { 'content-type': 'image/png', 'content-length': '32' } }),
    });
    const result = await stager.stage(execution, attempt);
    expect(result).toMatchObject({
      storagePath: 'user/outputs/job/attempt.png',
      sizeBytes: 32,
      mimeType: 'image/png',
      width: 2048,
      height: 1024,
    });
  });

  it.each([
    null,
    { sizeBytes: 31, mimeType: 'image/png' },
    { sizeBytes: 32, mimeType: 'text/html' },
  ])('refuses ready when storage metadata does not match %j', async metadata => {
    const stager = createStreamingOutputStager({
      storage: { upload: consume, stat: async () => metadata },
      fetch: async () => new Response(png(), { headers: { 'content-type': 'image/png' } }),
    });
    await expect(stager.stage(execution, attempt)).rejects.toThrow(/metadata/);
  });

  it('cancels lying oversized chunked output at the cap and never reads the next chunk', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          pulls += 1;
          c.enqueue(Buffer.alloc(1024));
        },
        cancel,
      },
      { highWaterMark: 0 }
    );
    const stager = createStreamingOutputStager({
      storage: { upload: consume, stat: async () => null },
      maxBytes: 32,
      fetch: async () =>
        new Response(body, { headers: { 'content-type': 'image/png', 'content-length': '32' } }),
    });
    await expect(stager.stage(execution, attempt)).rejects.toThrow(/byte limit/);
    expect(cancel).toHaveBeenCalled();
    expect(pulls).toBeLessThanOrEqual(2);
  });

  it.each([
    'http://127.0.0.1/image.png',
    'https://127.0.0.1/image.png',
    'https://replicate.delivery:444/image.png',
    'https://user:pass@replicate.delivery/image.png',
    'https://attacker.test/image.png',
  ])('rejects unsafe redirected target %s', async location => {
    const transport = vi.fn(async () => new Response(null, { status: 302, headers: { location } }));
    const stager = createStreamingOutputStager({
      storage: { upload: consume, stat: async () => null },
      fetch: transport,
    });
    await expect(stager.stage(execution, attempt)).rejects.toThrow(/URL|redirect/);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects absent image MIME rather than guessing it from a URL suffix', async () => {
    const stager = createStreamingOutputStager({
      storage: { upload: consume, stat: async () => null },
      fetch: async () => new Response(png()),
    });
    await expect(stager.stage(execution, attempt)).rejects.toThrow(/MIME/);
  });
});
