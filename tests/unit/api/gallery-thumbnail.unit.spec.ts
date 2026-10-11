/**
 * Gallery Thumbnail Route Unit Tests (SQR02)
 *
 * Contract under test for GET /api/gallery/thumb/[id]:
 * - 401 without the middleware-supplied X-User-Id header.
 * - 400 for an id that is not a UUID v4.
 * - Loads `id, user_id, storage_path` by id; 404 when missing.
 * - 403 for another owner BEFORE any presign or fetch.
 * - Owner: presigns `miu-private` `saved/<storage_path>` for 3600s and proxies it
 *   through Cloudflare Image Resizing (width 400, format auto, redirect error,
 *   cache no-store), streaming the image with a private no-store nosniff response.
 * - A non-OK transform falls back to a plain fetch without cf options.
 * - Fallback failure or a non-image payload fails with 502.
 * - The presigned URL is never returned to the client.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  supabaseFrom: vi.fn(),
  storageFrom: vi.fn(),
  createSignedUrl: vi.fn(),
  presignGet: vi.fn(),
  buildSavedKey: vi.fn((storagePath: string) => `saved/${storagePath}`),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: h.supabaseFrom, storage: { from: h.storageFrom } },
}));

vi.mock('@server/services/r2-storage.service', () => ({
  presignGet: h.presignGet,
  buildSavedKey: h.buildSavedKey,
  R2_PRIVATE_BUCKET: 'miu-private',
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { GET } from '@/app/api/gallery/thumb/[id]/route';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

const SIGNED_URL = 'https://r2.example/signed-thumb';
const VALID_ID = '11111111-1111-4111-8111-111111111111';
const STORAGE_PATH = 'user-1/abc.webp';

function request(userId?: string, pathId = VALID_ID) {
  const headers: Record<string, string> = {};
  if (userId) headers['X-User-Id'] = userId;
  return new NextRequest(`http://localhost/api/gallery/thumb/${pathId}`, {
    method: 'GET',
    headers,
  });
}

function ctx(id = VALID_ID) {
  return { params: Promise.resolve({ id }) };
}

function savedImagesChain(row: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        single: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  };
}

function registryChain(rows: unknown[] = [], error: unknown = null) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.in = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: error ? null : rows, error }).then(resolve);
  return { select: vi.fn(() => builder) };
}

function setSupabase(row: unknown, registryRows: unknown[] = [], registryError: unknown = null) {
  h.supabaseFrom.mockImplementation((table: string) => {
    if (table === 'saved_images') return savedImagesChain(row);
    if (table === 'gallery_expiry_backups') return registryChain(registryRows, registryError);
    throw new Error(`unexpected table: ${table}`);
  });
}

function imageResponse(contentType = 'image/webp', bytes = [1, 2, 3]) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

describe('GET /api/gallery/thumb/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSupabase(null);
    h.presignGet.mockResolvedValue(SIGNED_URL);
    h.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://supabase.example/signed-thumb' },
      error: null,
    });
    h.storageFrom.mockReturnValue({ createSignedUrl: h.createSignedUrl });
    fetchMock.mockResolvedValue(imageResponse());
  });

  test('returns 401 when the middleware user header is missing', async () => {
    const res = await GET(request(undefined), ctx());
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('returns 400 for an id that is not a UUID v4', async () => {
    const asShapedButNotV4 = '11111111-1111-7111-8111-111111111111';
    expect((await GET(request('user-1', 'not-a-uuid'), ctx('not-a-uuid'))).status).toBe(400);
    expect(
      (await GET(request('user-1', asShapedButNotV4), ctx(asShapedButNotV4))).status
    ).toBe(400);
    expect(h.presignGet).not.toHaveBeenCalled();
  });

  test('returns 404 when the image row does not exist', async () => {
    setSupabase(null);
    const res = await GET(request('user-1'), ctx());
    expect(res.status).toBe(404);
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('returns 403 for another owner before signing or fetching', async () => {
    setSupabase({ id: VALID_ID, user_id: 'someone-else', storage_path: STORAGE_PATH, storage_backend: 'r2' });
    const res = await GET(request('user-1'), ctx());
    expect(res.status).toBe(403);
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('presigns the saved key and proxies the transformed image', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });

    const res = await GET(request('user-1'), ctx());

    expect(h.buildSavedKey).toHaveBeenCalledWith(STORAGE_PATH);
    expect(h.presignGet).toHaveBeenCalledWith('miu-private', `saved/${STORAGE_PATH}`, 3600);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(calledUrl).toBe(SIGNED_URL);
    expect(init.cf).toMatchObject({ image: { width: 400, format: 'auto' } });
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/webp');
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(res.headers.get('cache-control')).toContain('private');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');

    const body = new Uint8Array(await res.arrayBuffer());
    expect(body.byteLength).toBe(3);
  });

  test('falls back to a plain fetch when the transform is not OK', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    fetchMock.mockResolvedValueOnce(imageResponse('image/png'));

    const res = await GET(request('user-1'), ctx());

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackInit = fetchMock.mock.calls[1][1] as Record<string, unknown> | undefined;
    expect(fallbackInit?.cf).toBeUndefined();
    expect(res.headers.get('content-type')).toContain('image/png');
  });

  test('falls back when the transform fetch throws', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });
    fetchMock.mockRejectedValueOnce(new Error('transformation unavailable'));
    fetchMock.mockResolvedValueOnce(imageResponse('image/png'));
    const res = await GET(request('user-1'), ctx());
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][1].cf).toBeUndefined();
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('returns 502 when the fallback fetch fails', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    const res = await GET(request('user-1'), ctx());
    expect(res.status).toBe(502);
  });

  test('returns 502 when the upstream payload is not an image', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });
    fetchMock.mockResolvedValueOnce(
      new Response('not an image', { status: 200, headers: { 'content-type': 'text/html' } })
    );

    const res = await GET(request('user-1'), ctx());
    expect(res.status).toBe(502);
  });

  test('never returns the presigned URL to the client', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' });

    const res = await GET(request('user-1'), ctx());

    const headerValues = [...res.headers.entries()].flat().join(' ');
    const body = new TextDecoder().decode(new Uint8Array(await res.arrayBuffer()));
    expect(headerValues).not.toContain(SIGNED_URL);
    expect(body).not.toContain(SIGNED_URL);
  });

  test('serves a deleting image from its immutable archive key', async () => {
    const sha = 'a'.repeat(64);
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' }, [
      {
        image_id: VALID_ID,
        user_id: 'user-1',
        storage_path: STORAGE_PATH,
        sha256: sha,
        archive_key: `archive/gallery/${VALID_ID}/${sha}`,
      },
    ]);

    const res = await GET(request('user-1'), ctx());

    expect(h.presignGet).toHaveBeenCalledWith(
      'miu-private',
      `archive/gallery/${VALID_ID}/${sha}`,
      3600
    );
    expect(res.status).toBe(200);
  });

  test('checks ownership before any archive lookup or signing', async () => {
    const sha = 'a'.repeat(64);
    setSupabase({ id: VALID_ID, user_id: 'someone-else', storage_path: STORAGE_PATH, storage_backend: 'r2' }, [
      {
        image_id: VALID_ID,
        user_id: 'someone-else',
        storage_path: STORAGE_PATH,
        sha256: sha,
        archive_key: `archive/gallery/${VALID_ID}/${sha}`,
      },
    ]);

    const res = await GET(request('user-1'), ctx());

    expect(res.status).toBe(403);
    expect(h.supabaseFrom).not.toHaveBeenCalledWith('gallery_expiry_backups');
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fails closed when the expiry registry lookup errors', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH, storage_backend: 'r2' }, [], {
      message: 'registry down',
    });

    const res = await GET(request('user-1'), ctx());

    expect(res.status).toBe(502);
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('signs a legacy Supabase image from Supabase Storage and proxies it', async () => {
    setSupabase({
      id: VALID_ID,
      user_id: 'user-1',
      storage_path: STORAGE_PATH,
      storage_backend: 'supabase',
    });

    const res = await GET(request('user-1'), ctx());

    expect(h.storageFrom).toHaveBeenCalledWith('saved-images');
    expect(h.createSignedUrl).toHaveBeenCalledWith(STORAGE_PATH, 3600);
    expect(h.supabaseFrom).not.toHaveBeenCalledWith('gallery_expiry_backups');
    expect(h.buildSavedKey).not.toHaveBeenCalled();
    expect(h.presignGet).not.toHaveBeenCalled();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://supabase.example/signed-thumb');
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  test('returns 502 when the legacy Supabase signing fails', async () => {
    setSupabase({
      id: VALID_ID,
      user_id: 'user-1',
      storage_path: STORAGE_PATH,
      storage_backend: 'supabase',
    });
    h.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'signing down' } });

    const res = await GET(request('user-1'), ctx());

    expect(res.status).toBe(502);
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('fails closed for an unknown or absent backend without signing or fetching', async () => {
    setSupabase({ id: VALID_ID, user_id: 'user-1', storage_path: STORAGE_PATH });

    const res = await GET(request('user-1'), ctx());

    expect(res.status).toBe(502);
    expect(h.presignGet).not.toHaveBeenCalled();
    expect(h.createSignedUrl).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
