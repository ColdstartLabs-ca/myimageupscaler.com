import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  serverEnv: {
    CLOUDFLARE_ACCOUNT_ID: 'acct-123',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret-key',
  },
}));

vi.mock('@shared/config/env', () => ({ serverEnv: mocks.serverEnv }));

import {
  restoreGalleryArchive,
  type IRestoreGalleryArchiveInput,
} from '@server/services/r2-storage.service';

const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const SHA256 = 'a'.repeat(64);
const ARCHIVE_KEY = `archive/gallery/${IMAGE_ID}/${SHA256}`;
const ARCHIVE_PATH = `/miu-private/${ARCHIVE_KEY}`;
const TARGET_PATH = '/miu-private/saved/gallery/photo.png';
const SIZE_BYTES = 4096;
const ARCHIVE_ETAG = '"archive-etag"';
const SOURCE_ETAG = '"source-etag"';
const COPY_XML = '<CopyObjectResult><ETag>&quot;copy-etag&quot;</ETag></CopyObjectResult>';

const baseInput: IRestoreGalleryArchiveInput = {
  imageId: IMAGE_ID,
  sha256: SHA256,
  storagePath: 'gallery/photo.png',
  archiveEtag: ARCHIVE_ETAG,
  sourceEtag: SOURCE_ETAG,
  sizeBytes: SIZE_BYTES,
};

function headOk(etag: string, size: number): Response {
  return new Response(null, {
    status: 200,
    headers: { etag, 'content-length': String(size) },
  });
}

function requestPath(request: Request): string {
  return new URL(request.url).pathname;
}

function methodsOf(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([request]) => (request as Request).method);
}

describe('restoreGalleryArchive', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.serverEnv.CLOUDFLARE_ACCOUNT_ID = 'acct-123';
    mocks.serverEnv.R2_ACCESS_KEY_ID = 'test-access-key';
    mocks.serverEnv.R2_SECRET_ACCESS_KEY = 'test-secret-key';
  });

  it('copies the archive to the saved key with the immutable conditional headers', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT' && path === TARGET_PATH) {
        return new Response(COPY_XML, { status: 200 });
      }
      if (request.method === 'HEAD' && path === TARGET_PATH) {
        return headOk('"copy-etag"', SIZE_BYTES);
      }
      throw new Error(`unexpected ${request.method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).resolves.toBe('"copy-etag"');

    expect(methodsOf(fetchMock)).toEqual(['HEAD', 'PUT', 'HEAD']);
    expect(methodsOf(fetchMock)).not.toContain('DELETE');

    const putRequest = fetchMock.mock.calls[1][0] as Request;
    expect(requestPath(putRequest)).toBe(TARGET_PATH);
    expect(putRequest.headers.get('x-amz-copy-source')).toBe(`/miu-private/${ARCHIVE_KEY}`);
    expect(putRequest.headers.get('x-amz-copy-source-if-match')).toBe(ARCHIVE_ETAG);
    expect(putRequest.headers.get('cf-copy-destination-if-none-match')).toBe('*');
    expect(putRequest.redirect).toBe('error');
    expect(putRequest.cache).toBe('no-store');
  });

  it('URL-encodes each target key segment', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(COPY_XML, { status: 200 });
      if (request.method === 'HEAD') return headOk('"copy-etag"', SIZE_BYTES);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await restoreGalleryArchive({ ...baseInput, storagePath: 'gallery/my photo.png' });

    const putRequest = fetchMock.mock.calls[1][0] as Request;
    expect(requestPath(putRequest)).toBe('/miu-private/saved/gallery/my%20photo.png');
    expect(putRequest.headers.get('x-amz-copy-source')).toBe(`/miu-private/${ARCHIVE_KEY}`);
  });

  it('rejects a 200 CopyObject response that carries an S3 error body', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') {
        return new Response('<Error><Code>InternalError</Code></Error>', { status: 200 });
      }
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/CopyObject returned an error/);
    expect(methodsOf(fetchMock)).toEqual(['HEAD', 'PUT']);
  });

  it('cancels and rejects a CopyObject body larger than 8192 bytes', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(9000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(stream, { status: 200 });
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/too large/);
    expect(cancelled).toBe(true);
  });

  it('aborts a stalled CopyObject body through the timeout signal and never deletes the target', async () => {
    vi.useFakeTimers();
    const timeoutController = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation(milliseconds => {
      setTimeout(
        () => timeoutController.abort(new DOMException('timeout', 'TimeoutError')),
        milliseconds
      );
      return timeoutController.signal;
    });

    const stalled = new ReadableStream<Uint8Array>({
      start(streamController) {
        timeoutController.signal.addEventListener('abort', () => {
          streamController.error(timeoutController.signal.reason);
        });
      },
    });

    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(stalled, { status: 200 });
      throw new Error(`unexpected ${request.method} ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = restoreGalleryArchive(baseInput);
    const rejection = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
    expect(methodsOf(fetchMock)).toEqual(['HEAD', 'PUT']);
    expect(methodsOf(fetchMock)).not.toContain('DELETE');
    vi.useRealTimers();
  });

  it('rejects a truncated CopyObject XML that never closes its result element', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') {
        return new Response('<CopyObjectResult><ETag>&quot;copy-etag&quot;</ETag>', { status: 200 });
      }
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/CopyObject result missing/);
    expect(methodsOf(fetchMock)).toEqual(['HEAD', 'PUT']);
  });

  it('fails before the copy when the archive ETag does not match', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) {
        return headOk('"different-archive"', SIZE_BYTES);
      }
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Archive ETag mismatch/);
    expect(methodsOf(fetchMock)).toEqual(['HEAD']);
  });

  it('fails before the copy when the archive byte count does not match', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) {
        return headOk(ARCHIVE_ETAG, SIZE_BYTES + 1);
      }
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Archive size mismatch/);
    expect(methodsOf(fetchMock)).toEqual(['HEAD']);
  });

  it('accepts a 412 when the existing target matches the original saved object', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(null, { status: 412 });
      if (request.method === 'HEAD') return headOk(SOURCE_ETAG, SIZE_BYTES);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).resolves.toBe(SOURCE_ETAG);
    expect(methodsOf(fetchMock)).toEqual(['HEAD', 'PUT', 'HEAD']);
    expect(methodsOf(fetchMock)).not.toContain('DELETE');
  });

  it('refuses a 412 when the existing target differs from the original saved object', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(null, { status: 412 });
      if (request.method === 'HEAD') return headOk('"someone-else"', SIZE_BYTES);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Existing target ETag mismatch/);
  });

  it('refuses a 412 when the existing target has the wrong size', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(null, { status: 412 });
      if (request.method === 'HEAD') return headOk(SOURCE_ETAG, SIZE_BYTES + 1);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Existing target size mismatch/);
  });

  it('fails when the archive HEAD returns 503', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Archive HEAD failed: 503/);
    expect(methodsOf(fetchMock).every(method => method === 'HEAD')).toBe(true);
  });

  it('fails when the target HEAD after the copy reports the wrong size', async () => {
    const fetchMock = vi.fn(async (request: Request) => {
      const path = requestPath(request);
      if (request.method === 'HEAD' && path === ARCHIVE_PATH) return headOk(ARCHIVE_ETAG, SIZE_BYTES);
      if (request.method === 'PUT') return new Response(COPY_XML, { status: 200 });
      if (request.method === 'HEAD') return headOk('"copy-etag"', SIZE_BYTES + 1);
      throw new Error('unexpected');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive(baseInput)).rejects.toThrow(/Target size mismatch/);
  });

  const unsafeCases: Array<[string, Partial<IRestoreGalleryArchiveInput>]> = [
    ['a non-UUID imageId', { imageId: 'not-a-uuid' }],
    ['an uppercase sha256', { sha256: 'A'.repeat(64) }],
    ['a short sha256', { sha256: 'a'.repeat(63) }],
    ['an unquoted archiveEtag', { archiveEtag: 'archive-etag' }],
    ['an empty quoted archiveEtag', { archiveEtag: '""' }],
    ['a CRLF in sourceEtag', { sourceEtag: '"abc"\r\nX-Injected: 1' }],
    ['a tab control character in sourceEtag', { sourceEtag: '"a\tb"' }],
    ['a DEL control character in archiveEtag', { archiveEtag: '"a\u007fb"' }],
    ['an inner quote in archiveEtag', { archiveEtag: '"a"b"' }],
    ['an over-long archiveEtag', { archiveEtag: `"${'a'.repeat(200)}"` }],
    ['a zero sizeBytes', { sizeBytes: 0 }],
    ['a fractional sizeBytes', { sizeBytes: 1.5 }],
    ['a parent-relative storagePath', { storagePath: '../escape.png' }],
    ['a backslash storagePath', { storagePath: 'a\\b.png' }],
    ['a control character storagePath', { storagePath: 'a\u0000b.png' }],
  ];

  it.each(unsafeCases)('rejects %s without any fetch', async (_label, override) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(restoreGalleryArchive({ ...baseInput, ...override })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
