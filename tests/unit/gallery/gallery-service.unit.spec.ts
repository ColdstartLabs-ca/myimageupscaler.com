/**
 * Gallery Storage Service Unit Tests (R2 contract)
 *
 * Contract under test (SQR02):
 * - saveImage writes prepared bytes to the private R2 bucket under the saved key
 *   (`put(R2_PRIVATE_BUCKET, buildSavedKey(relativePath), bytes, mime)`) and never
 *   touches Supabase Storage.
 * - An uncertain DB insert retains the uploaded R2 object; a lost response may follow a commit.
 * - `signed_url` is a 1-hour presigned R2 GET; `thumbnail_signed_url` points at the
 *   DB-id thumb route (`/api/gallery/thumb/<id>`).
 * - deleteImage is ownership scoped, removes the R2 object, confirms 404 with a HEAD,
 *   and only then deletes the exact id/user DB row. R2 errors, a still-present object,
 *   and HEAD failures all keep the DB row.
 */

import { readFileSync } from 'node:fs';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock setup - must be hoisted before imports
// =============================================================================

const h = vi.hoisted(() => {
  const usage = vi.fn<() => { count: number; error: unknown }>(() => ({ count: 0, error: null }));
  const ownership = vi.fn<() => { data: unknown; error: unknown }>(() => ({
    data: null,
    error: null,
  }));
  const insertResult = vi.fn<() => { data: unknown; error: unknown }>(() => ({
    data: { id: 'db-img-1' },
    error: null,
  }));
  const deleteResult = vi.fn<() => { data: unknown; error: unknown }>(() => ({
    data: { id: 'img-1' },
    error: null,
  }));
  const rpc = vi.fn(async (..._args: unknown[]) => ({
    data: true as unknown,
    error: null as unknown,
  }));
  const listResult = vi.fn<() => { data: unknown; error: unknown; count: number }>(() => ({
    data: [],
    error: null,
    count: 0,
  }));
  const registryResult = vi.fn<() => { data: unknown; error: unknown }>(() => ({
    data: [],
    error: null,
  }));
  const profileResult = vi.fn(() => ({ data: null, error: null }));

  const ops: { tag: string; col: string; val: unknown }[] = [];

  function chain(tag: string, terminal: () => unknown) {
    const c: Record<string, unknown> = {};
    const pass = () => c;
    c.eq = (col: string, val: unknown) => {
      ops.push({ tag, col, val });
      return c;
    };
    c.neq = pass;
    c.or = pass;
    c.in = pass;
    c.lt = pass;
    c.lte = pass;
    c.gte = pass;
    c.limit = pass;
    c.order = pass;
    c.range = pass;
    c.select = pass;
    c.maybeSingle = () => Promise.resolve(terminal());
    c.single = () => Promise.resolve(terminal());
    c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(terminal()).then(resolve, reject);
    return c;
  }

  const insertArgs: unknown[] = [];
  const deleteMock = vi.fn((..._args: unknown[]) => chain('delete', deleteResult));
  const from = vi.fn((table: string) => ({
    select: vi.fn((cols: string, opts?: { head?: boolean }) => {
      if (table === 'profiles') return chain('profiles', profileResult);
      if (table === 'gallery_expiry_backups') return chain('registry', registryResult);
      if (opts?.head) return chain('usage', usage);
      if (typeof cols === 'string' && cols.includes('storage_path'))
        return chain('ownership', ownership);
      return chain('list', listResult);
    }),
    insert: vi.fn((row: unknown) => {
      insertArgs.push(row);
      return chain('insert', insertResult);
    }),
    delete: deleteMock,
  }));

  const upload = vi.fn(async () => ({ data: { path: 'supabase-path' }, error: null }));
  const remove = vi.fn(async () => ({ error: null }));
  const createSignedUrl = vi.fn<() => Promise<{ data: unknown; error: unknown }>>(async () => ({
    data: { signedUrl: 'https://supabase.example/signed' },
    error: null,
  }));

  return {
    usage,
    ownership,
    insertResult,
    deleteResult,
    rpc,
    listResult,
    registryResult,
    profileResult,
    ops,
    from,
    insertArgs,
    deleteMock,
    upload,
    remove,
    createSignedUrl,
  };
});

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: h.from,
    rpc: h.rpc,
    storage: {
      from: vi.fn(() => ({
        upload: h.upload,
        remove: h.remove,
        createSignedUrl: h.createSignedUrl,
      })),
    },
  },
}));

const r2 = vi.hoisted(() => ({
  put: vi.fn(async () => undefined),
  presignGet: vi.fn(async () => 'https://r2.example/signed'),
  deleteObject: vi.fn(async () => undefined),
  head: vi.fn(async () => new Response(null, { status: 404 })),
  buildSavedKey: vi.fn((storagePath: string) => `saved/${storagePath}`),
}));

vi.mock('@server/services/r2-storage.service', () => ({
  put: r2.put,
  presignGet: r2.presignGet,
  deleteObject: r2.deleteObject,
  head: r2.head,
  buildSavedKey: r2.buildSavedKey,
  R2_PRIVATE_BUCKET: 'miu-private',
}));

import {
  saveImage,
  listImages,
  deleteImage,
  getUsage,
  compressForGallery,
  type ISaveImageMetadata,
} from '@server/services/galleryStorage.service';
import { GALLERY_LIMITS, type GalleryTier } from '@shared/config/gallery.config';

const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;

const SAVED_KEY_PATTERN = /^saved\/user-123\/.+\.png$/;

function imageResponse(bytes = [1, 2, 3]) {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('Gallery Storage Service (R2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    r2.put.mockResolvedValue(undefined);
    r2.presignGet.mockResolvedValue('https://r2.example/signed');
    r2.deleteObject.mockResolvedValue(undefined);
    r2.head.mockResolvedValue(new Response(null, { status: 404 }));
    h.usage.mockReturnValue({ count: 0, error: null });
    h.ownership.mockReturnValue({ data: null, error: null });
    h.insertResult.mockReturnValue({ data: { id: 'db-img-1' }, error: null });
    h.deleteResult.mockReturnValue({ data: { id: 'img-1' }, error: null });
    h.rpc.mockResolvedValue({ data: true, error: null });
    h.listResult.mockReturnValue({ data: [], error: null, count: 0 });
    h.registryResult.mockReturnValue({ data: [], error: null });
    h.insertArgs.length = 0;
    fetchMock.mockResolvedValue(imageResponse());
  });

  describe('compressForGallery', () => {
    test('should compress image and convert to WebP', async () => {
      const compressed = await compressForGallery(Buffer.from('test-image-data'));
      expect(compressed).toBeInstanceOf(Buffer);
    });
  });

  describe('saveImage', () => {
    test('should reject save when over tier limit', async () => {
      h.usage.mockReturnValue({ count: GALLERY_LIMITS.free, error: null });

      await expect(
        saveImage('user-123', 'https://replicate.delivery/test.png', { filename: 'test.png' })
      ).rejects.toThrow(/limit exceeded/i);
      expect(r2.put).not.toHaveBeenCalled();
    });

    test('should validate image URL format', async () => {
      await expect(
        saveImage('user-123', 'not-a-valid-url', { filename: 'test.png' })
      ).rejects.toThrow();
    });

    test('should reject URLs from non-allowed domains', async () => {
      await expect(
        saveImage('user-123', 'https://evil.com/malicious.png', { filename: 'test.png' })
      ).rejects.toThrow(/allowed domain/i);
    });

    test('uploads the prepared bytes to the private R2 bucket under the saved key', async () => {
      await saveImage('user-123', 'https://replicate.delivery/result.png', {
        filename: 'result.png',
        width: 10,
        height: 10,
      });

      expect(r2.buildSavedKey).toHaveBeenCalledWith(expect.stringMatching(/^user-123\/.+\.png$/));
      expect(r2.put).toHaveBeenCalledWith(
        'miu-private',
        expect.stringMatching(SAVED_KEY_PATTERN),
        expect.any(Buffer),
        'image/png'
      );
      // Supabase Storage must not be used for writes any more.
      expect(h.upload).not.toHaveBeenCalled();
    });

    test('returns a 1-hour presigned read URL and a DB-id thumbnail URL', async () => {
      const result = await saveImage('user-123', 'https://replicate.delivery/result.png', {
        filename: 'result.png',
        width: 10,
        height: 10,
      });

      expect(r2.presignGet).toHaveBeenCalledWith(
        'miu-private',
        expect.stringMatching(SAVED_KEY_PATTERN),
        3600
      );
      expect(result.signedUrl).toBe('https://r2.example/signed');
      expect(result.thumbnailSignedUrl).toBe('/api/gallery/thumb/db-img-1');
    });

    test('records storage_backend r2 on the new row so the object is read from R2', async () => {
      await saveImage('user-123', 'https://replicate.delivery/result.png', {
        filename: 'result.png',
        width: 10,
        height: 10,
      });

      expect(h.insertArgs[0]).toMatchObject({ storage_backend: 'r2' });
    });

    test('retains the uploaded R2 object when a committed insert response is lost', async () => {
      h.insertResult.mockReturnValue({
        data: null,
        error: { message: 'response lost after commit' },
      });

      await expect(
        saveImage('user-123', 'https://replicate.delivery/result.png', {
          filename: 'result.png',
          width: 10,
          height: 10,
        })
      ).rejects.toThrow(/save image record/i);

      expect(r2.put).toHaveBeenCalled();
      expect(r2.deleteObject).not.toHaveBeenCalled();
    });
  });

  describe('listImages', () => {
    test('should return paginated list of images', async () => {
      const result = await listImages('user-123', 1, 20);

      expect(result.images).toBeDefined();
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(typeof result.total).toBe('number');
      expect(typeof result.has_more).toBe('boolean');
    });

    test('does no registry query when the page has no images', async () => {
      h.listResult.mockReturnValue({ data: [], error: null, count: 0 });

      await listImages('user-123', 1, 20);

      expect(h.from).not.toHaveBeenCalledWith('gallery_expiry_backups');
    });

    test('serves a deleting image from its immutable archive key', async () => {
      const sha = 'a'.repeat(64);
      h.listResult.mockReturnValue({
        data: [
          {
            id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/abc.png',
            storage_backend: 'r2',
            created_at: 'x',
          },
        ],
        error: null,
        count: 1,
      });
      h.registryResult.mockReturnValue({
        data: [
          {
            image_id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/abc.png',
            sha256: sha,
            archive_key: `archive/gallery/img-1/${sha}`,
          },
        ],
        error: null,
      });

      await listImages('user-123', 1, 20);

      expect(r2.presignGet).toHaveBeenCalledWith(
        'miu-private',
        `archive/gallery/img-1/${sha}`,
        3600
      );
    });

    test('fails closed when the registry lookup errors, never signing the original', async () => {
      h.listResult.mockReturnValue({
        data: [
          {
            id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/abc.png',
            storage_backend: 'r2',
          },
        ],
        error: null,
        count: 1,
      });
      h.registryResult.mockReturnValue({ data: null, error: { message: 'registry down' } });

      await expect(listImages('user-123', 1, 20)).rejects.toThrow(/gallery expiry registry/i);
      expect(r2.presignGet).not.toHaveBeenCalled();
    });

    test('signs a legacy Supabase row from Supabase Storage with no registry query', async () => {
      h.listResult.mockReturnValue({
        data: [
          {
            id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/legacy.png',
            storage_backend: 'supabase',
          },
        ],
        error: null,
        count: 1,
      });

      const result = await listImages('user-123', 1, 20);

      expect(h.createSignedUrl).toHaveBeenCalledWith('user-123/legacy.png', 3600);
      expect(result.images[0].signed_url).toBe('https://supabase.example/signed');
      expect(h.from).not.toHaveBeenCalledWith('gallery_expiry_backups');
      expect(r2.presignGet).not.toHaveBeenCalled();
    });

    test('fails closed on a legacy signing error and drops only that row', async () => {
      h.listResult.mockReturnValue({
        data: [
          {
            id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/legacy.png',
            storage_backend: 'supabase',
          },
        ],
        error: null,
        count: 1,
      });
      h.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'signing down' } });

      const result = await listImages('user-123', 1, 20);

      expect(result.images).toHaveLength(0);
      expect(r2.presignGet).not.toHaveBeenCalled();
    });

    test('fails closed on an unknown or absent backend without signing', async () => {
      h.listResult.mockReturnValue({
        data: [
          { id: 'img-1', user_id: 'user-123', storage_path: 'user-123/a.png' },
          {
            id: 'img-2',
            user_id: 'user-123',
            storage_path: 'user-123/b.png',
            storage_backend: 'gcs',
          },
        ],
        error: null,
        count: 2,
      });

      const result = await listImages('user-123', 1, 20);

      expect(result.images).toHaveLength(0);
      expect(r2.presignGet).not.toHaveBeenCalled();
      expect(h.createSignedUrl).not.toHaveBeenCalled();
      expect(h.from).not.toHaveBeenCalledWith('gallery_expiry_backups');
    });
  });

  describe('deleteImage', () => {
    test('journals a legacy deletion atomically without touching either object store', async () => {
      h.ownership.mockReturnValue({
        data: { id: 'img-1', storage_path: 'user-123/abc.png', storage_backend: 'supabase' },
        error: null,
      });
      await expect(deleteImage('user-123', 'img-1')).resolves.toBe(true);
      expect(h.rpc).toHaveBeenCalledWith('delete_legacy_gallery_image', {
        p_user_id: 'user-123',
        p_image_id: 'img-1',
        p_storage_path: 'user-123/abc.png',
      });
      expect(r2.deleteObject).not.toHaveBeenCalled();
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.deleteMock).not.toHaveBeenCalled();
    });

    test.each([false, null])(
      'refuses a legacy deletion when the row changed (%s)',
      async result => {
        h.ownership.mockReturnValue({
          data: { id: 'img-1', storage_path: 'user-123/abc.png', storage_backend: 'supabase' },
          error: null,
        });
        h.rpc.mockResolvedValue({ data: result, error: null });
        await expect(deleteImage('user-123', 'img-1')).rejects.toThrow(/changed/);
        expect(r2.deleteObject).not.toHaveBeenCalled();
        expect(h.deleteMock).not.toHaveBeenCalled();
      }
    );

    test('retains a legacy row when journaling fails', async () => {
      h.ownership.mockReturnValue({
        data: { id: 'img-1', storage_path: 'user-123/abc.png', storage_backend: 'supabase' },
        error: null,
      });
      h.rpc.mockResolvedValue({ data: null, error: { message: 'journal unavailable' } });
      await expect(deleteImage('user-123', 'img-1')).rejects.toThrow(/journal unavailable/);
      expect(r2.deleteObject).not.toHaveBeenCalled();
      expect(h.deleteMock).not.toHaveBeenCalled();
    });

    test.each([undefined, 'gcs'])(
      'refuses an unknown backend before storage mutation (%s)',
      async backend => {
        h.ownership.mockReturnValue({
          data: { id: 'img-1', storage_path: 'user-123/abc.png', storage_backend: backend },
          error: null,
        });
        await expect(deleteImage('user-123', 'img-1')).rejects.toThrow(/backend/);
        expect(r2.deleteObject).not.toHaveBeenCalled();
        expect(h.rpc).not.toHaveBeenCalled();
      }
    );

    test('does not report success when an R2 backend/path change prevents the guarded row delete', async () => {
      h.ownership.mockReturnValue({
        data: { id: 'img-1', storage_path: 'user-123/abc.png', storage_backend: 'r2' },
        error: null,
      });
      h.deleteResult.mockReturnValue({ data: null, error: null });
      await expect(deleteImage('user-123', 'img-1')).rejects.toThrow(/changed/);
      expect(h.ops).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag: 'delete', col: 'storage_path', val: 'user-123/abc.png' }),
          expect.objectContaining({ tag: 'delete', col: 'storage_backend', val: 'r2' }),
        ])
      );
    });

    test('should throw error if image not found or not owned by user', async () => {
      await expect(deleteImage('user-123', 'non-existent-img')).rejects.toThrow(
        /not found or you do not have permission/i
      );
      expect(r2.deleteObject).not.toHaveBeenCalled();
      expect(h.deleteMock).not.toHaveBeenCalled();
    });

    test('deletes the R2 object, confirms 404 with HEAD, then deletes the exact DB row', async () => {
      h.ownership.mockReturnValue({
        data: {
          id: 'img-1',
          user_id: 'user-123',
          storage_path: 'user-123/abc.png',
          storage_backend: 'r2',
        },
        error: null,
      });
      r2.head.mockResolvedValue(new Response(null, { status: 404 }));

      await deleteImage('user-123', 'img-1');

      expect(r2.deleteObject).toHaveBeenCalledWith('miu-private', 'saved/user-123/abc.png');
      expect(r2.head).toHaveBeenCalledWith('miu-private', 'saved/user-123/abc.png');
      expect(h.deleteMock).toHaveBeenCalled();

      const deleteOrder = r2.deleteObject.mock.invocationCallOrder[0];
      const headOrder = r2.head.mock.invocationCallOrder[0];
      const dbOrder = h.deleteMock.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(headOrder);
      expect(headOrder).toBeLessThan(dbOrder);
    });

    test('scopes the DB delete to the exact id and user', async () => {
      h.ownership.mockReturnValue({
        data: {
          id: 'img-1',
          user_id: 'user-123',
          storage_path: 'user-123/abc.png',
          storage_backend: 'r2',
        },
        error: null,
      });

      await deleteImage('user-123', 'img-1');

      const deleteEqs = h.ops.filter(op => op.tag === 'delete');
      expect(deleteEqs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ col: 'id', val: 'img-1' }),
          expect.objectContaining({ col: 'user_id', val: 'user-123' }),
        ])
      );
    });

    test('keeps the DB row when the R2 delete fails', async () => {
      h.ownership.mockReturnValue({
        data: {
          id: 'img-1',
          user_id: 'user-123',
          storage_path: 'user-123/abc.png',
          storage_backend: 'r2',
        },
        error: null,
      });
      r2.deleteObject.mockRejectedValue(new Error('r2 delete failed'));

      await expect(deleteImage('user-123', 'img-1')).rejects.toThrow();
      expect(h.deleteMock).not.toHaveBeenCalled();
    });

    test.each([200, 503])(
      'keeps the DB row when HEAD does not confirm deletion (%i)',
      async status => {
        h.ownership.mockReturnValue({
          data: {
            id: 'img-1',
            user_id: 'user-123',
            storage_path: 'user-123/abc.png',
            storage_backend: 'r2',
          },
          error: null,
        });
        r2.head.mockResolvedValue(new Response(null, { status }));

        await expect(deleteImage('user-123', 'img-1')).rejects.toThrow();
        expect(h.deleteMock).not.toHaveBeenCalled();
      }
    );
  });

  describe('getUsage', () => {
    test('should return correct usage stats when tier is provided', async () => {
      const tier: GalleryTier = 'hobby';
      const result = await getUsage('user-123', tier);

      expect(result.current_count).toBeDefined();
      expect(result.max_allowed).toBe(GALLERY_LIMITS.hobby);
      expect(typeof result.can_save_more).toBe('boolean');
    });

    test('should indicate cannot save more when at limit', async () => {
      const result = await getUsage('user-123', 'free');
      expect(result.max_allowed).toBe(GALLERY_LIMITS.free);
    });

    test('should return free tier for users without active subscription', async () => {
      const result = await getUsage('user-123');
      expect(result.current_count).toBeDefined();
      expect(typeof result.can_save_more).toBe('boolean');
    });
  });

  describe('Supabase Storage is read-only', () => {
    test('gallery storage service never writes to or deletes from Supabase Storage', () => {
      const source = readFileSync('server/services/galleryStorage.service.ts', 'utf8');
      expect(source).not.toMatch(/\.upload\(/);
      expect(source).not.toMatch(/\.remove\(/);
      expect(source).toMatch(/createSignedUrl\(/);
    });
  });
});
