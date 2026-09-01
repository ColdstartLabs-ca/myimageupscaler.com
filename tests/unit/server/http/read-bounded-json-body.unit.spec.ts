import { describe, expect, it, vi } from 'vitest';

import {
  BoundedJsonBodyTooLargeError,
  readBoundedJsonBody,
} from '@server/http/read-bounded-json-body';

const MAX_BYTES = 64 * 1024;

function requestFromChunks(
  chunks: Uint8Array[],
  headers: Record<string, string> = {}
): { request: Request; getReadCount: () => number; getCancelReason: () => unknown } {
  let readCount = 0;
  let cancelReason: unknown;
  let nextChunk = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      readCount += 1;
      const chunk = chunks[nextChunk++];
      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel(reason) {
      cancelReason = reason;
    },
  });

  const request = new Request('https://example.com/api/upscale', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });

  return {
    request,
    getReadCount: () => readCount,
    getCancelReason: () => cancelReason,
  };
}

function encodedJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

describe('readBoundedJsonBody', () => {
  it('parses a body that is exactly at the byte limit', async () => {
    const body = JSON.stringify('x'.repeat(MAX_BYTES - 2));
    expect(new TextEncoder().encode(body)).toHaveLength(MAX_BYTES);
    const stream = requestFromChunks([new TextEncoder().encode(body)]);

    await expect(readBoundedJsonBody(stream.request, MAX_BYTES)).resolves.toBe(
      'x'.repeat(MAX_BYTES - 2)
    );
    expect(stream.getCancelReason()).toBeUndefined();
  });

  it('stops after 64 KiB when content length is absent', async () => {
    const stream = requestFromChunks([
      new Uint8Array(MAX_BYTES),
      new Uint8Array([0x7b]),
    ]);

    await expect(readBoundedJsonBody(stream.request, MAX_BYTES)).rejects.toBeInstanceOf(
      BoundedJsonBodyTooLargeError
    );
    expect(stream.getReadCount()).toBe(2);
    expect(stream.getCancelReason()).toBe('request body exceeds configured limit');
  });

  it('rejects a dishonest content length when streamed bytes exceed the limit', async () => {
    const stream = requestFromChunks(
      [encodedJson('x'.repeat(MAX_BYTES)), new Uint8Array([0x20])],
      { 'content-length': '1' }
    );

    await expect(readBoundedJsonBody(stream.request, MAX_BYTES)).rejects.toBeInstanceOf(
      BoundedJsonBodyTooLargeError
    );
    expect(stream.getCancelReason()).toBe('request body exceeds configured limit');
  });

  it('rejects a declared oversized body without acquiring a reader', async () => {
    const getReader = vi.fn();
    const request = {
      headers: new Headers({ 'content-length': String(MAX_BYTES + 1) }),
      body: { getReader },
    } as unknown as Request;

    await expect(readBoundedJsonBody(request, MAX_BYTES)).rejects.toMatchObject({
      name: 'BoundedJsonBodyTooLargeError',
      maxBytes: MAX_BYTES,
      actualBytes: MAX_BYTES + 1,
      statusCode: 413,
    });
    expect(getReader).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes rather than JavaScript string length', async () => {
    const value = '🙂'.repeat(100);
    const stream = requestFromChunks([encodedJson(value)]);

    await expect(readBoundedJsonBody(stream.request, 5000)).resolves.toBe(value);
  });
});
