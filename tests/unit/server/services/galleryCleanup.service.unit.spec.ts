import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  listV2: vi.fn(),
  info: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    storage: { from: mocks.storageFrom },
  },
}));

import { cleanupStaleUpscaleInputs } from '@server/services/galleryCleanup.service';

const CLEANUP_STATE_PATH = '_system/gallery-cleanup-state.png';
const OLD_INPUT = '11111111-1111-4111-8111-111111111111.png';
const FRESH_INPUT = '22222222-2222-4222-8222-222222222222.png';
const NOW = new Date('2026-08-31T12:00:00.000Z');

function inputObject(key: string, createdAt = '2026-08-31T10:00:00.000Z'): Record<string, unknown> {
  return {
    key,
    name: key.split('/').at(-1),
    created_at: createdAt,
    metadata: { size: 100 },
  };
}

function listResult(objects: Record<string, unknown>[], hasNext = false, nextCursor?: string) {
  return {
    data: { folders: [], objects, hasNext, ...(nextCursor ? { nextCursor } : {}) },
    error: null,
  };
}

describe('cleanupStaleUpscaleInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageFrom.mockReturnValue({
      listV2: mocks.listV2,
      info: mocks.info,
      upload: mocks.upload,
      remove: mocks.remove,
    });
    mocks.info.mockResolvedValue({
      data: null,
      error: { message: 'not found', status: 404 },
    });
    mocks.listV2.mockResolvedValue(listResult([]));
    mocks.upload.mockResolvedValue({ data: { path: CLEANUP_STATE_PATH }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
  });

  it('removes only expired direct input objects and preserves fresh inputs and outputs', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`user-1/${OLD_INPUT}`),
        inputObject(`user-1/${FRESH_INPUT}`, '2026-08-31T11:30:00.000Z'),
        inputObject(`user-1/outputs/${OLD_INPUT}`),
        { key: 'already-a-file.png', name: 'already-a-file.png', metadata: { size: 100 } },
        {
          key: CLEANUP_STATE_PATH,
          name: 'gallery-cleanup-state.png',
          created_at: '2026-08-31T10:00:00.000Z',
          metadata: { size: 100 },
        },
        inputObject(`user-2/33333333-3333-4333-8333-333333333333.webp`, '2026-08-31T09:00:00.000Z'),
      ])
    );

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 2,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenCalledWith({
      limit: 100,
      prefix: '',
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(mocks.remove).toHaveBeenCalledWith([
      `user-1/${OLD_INPUT}`,
      'user-2/33333333-3333-4333-8333-333333333333.webp',
    ]);
  });

  it('reports failed deletion batches without stopping the cron cleanup', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`user-1/${OLD_INPUT}`),
        inputObject('user-2/33333333-3333-4333-8333-333333333333.webp'),
      ])
    );
    mocks.remove.mockResolvedValue({ error: { message: 'storage unavailable' } });

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 0,
      failed: 2,
    });
  });

  it('cleans UUID-shaped input names admitted before the UUIDv4 contract', async () => {
    const legacyInput = '77777777-7777-7777-7777-777777777777.png';
    mocks.listV2.mockResolvedValue(listResult([inputObject(`user-1/${legacyInput}`)]));

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });
    expect(mocks.remove).toHaveBeenCalledWith([`user-1/${legacyInput}`]);
  });

  it('bounds each invocation and deletes stale objects in bounded batches', async () => {
    const staleObjects = Array.from({ length: 100 }, (_, index) =>
      inputObject(`user-1/66666666-6666-4666-8666-${String(index).padStart(12, '0')}.png`)
    );
    const events: string[] = [];
    mocks.listV2.mockImplementation(async () => {
      events.push('list');
      return listResult(staleObjects, true, 'opaque-page-2');
    });
    mocks.remove.mockImplementation(async () => {
      events.push('remove');
      return { error: null };
    });
    mocks.upload.mockImplementation(async () => {
      events.push('persist');
      return { data: { path: CLEANUP_STATE_PATH }, error: null };
    });

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 100,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledTimes(2);
    expect(mocks.remove.mock.calls.every(([paths]) => paths.length <= 50)).toBe(true);
    expect(events).toEqual(['list', 'remove', 'remove', 'persist']);
    expect(mocks.upload).toHaveBeenCalledWith(CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: 'opaque-page-2' },
      upsert: true,
    });
  });

  it('restores the opaque continuation and reaches later pages on the next invocation', async () => {
    let savedCursor: string | undefined;
    mocks.info.mockImplementation(async () => {
      if (!savedCursor) {
        return { data: null, error: { message: 'not found', status: 404 } };
      }
      return {
        // Supabase storage-js recursively camel-cases metadata returned by info().
        data: { metadata: { cleanupVersion: '1', cleanupCursor: savedCursor } },
        error: null,
      };
    });
    mocks.upload.mockImplementation(
      async (_path: string, _body: unknown, options: { metadata: { cleanup_cursor: string } }) => {
        savedCursor = options.metadata.cleanup_cursor || undefined;
        return { data: { path: CLEANUP_STATE_PATH }, error: null };
      }
    );
    mocks.listV2
      .mockResolvedValueOnce(
        listResult([inputObject(`user-early/${OLD_INPUT}`)], true, 'opaque-page-2')
      )
      .mockResolvedValueOnce(
        listResult([inputObject(`user-later/${FRESH_INPUT}`, '2026-08-31T11:30:00.000Z')], false)
      );

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });
    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 0,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenNthCalledWith(1, {
      limit: 100,
      prefix: '',
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(mocks.listV2).toHaveBeenNthCalledWith(2, {
      limit: 100,
      prefix: '',
      cursor: 'opaque-page-2',
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(mocks.remove).toHaveBeenNthCalledWith(1, [`user-early/${OLD_INPUT}`]);
    expect(mocks.upload).toHaveBeenNthCalledWith(1, CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: 'opaque-page-2' },
      upsert: true,
    });
    expect(mocks.upload).toHaveBeenNthCalledWith(2, CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: '' },
      upsert: true,
    });
  });
});
