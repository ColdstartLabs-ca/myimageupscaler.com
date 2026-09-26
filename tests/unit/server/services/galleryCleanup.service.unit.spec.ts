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
const USER_ONE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_TWO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
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
    mocks.remove.mockImplementation(async (paths: string[]) => ({
      data: paths.map(name => ({ name })),
      error: null,
    }));
  });

  it('removes only expired direct input objects and preserves fresh inputs and outputs', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`${USER_ONE}/${OLD_INPUT}`),
        inputObject(`${USER_ONE}/${FRESH_INPUT}`, '2026-08-31T11:30:00.000Z'),
        inputObject(`${USER_ONE}/outputs/${OLD_INPUT}`),
        { key: 'already-a-file.png', name: 'already-a-file.png', metadata: { size: 100 } },
        {
          key: CLEANUP_STATE_PATH,
          name: 'gallery-cleanup-state.png',
          created_at: '2026-08-31T10:00:00.000Z',
          metadata: { size: 100 },
        },
        inputObject(
          `${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`,
          '2026-08-31T09:00:00.000Z'
        ),
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
      `${USER_ONE}/${OLD_INPUT}`,
      `${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`,
    ]);
  });

  it('preserves reserved and non-user top-level prefixes', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`outputs/${OLD_INPUT}`),
        inputObject(`_system/${OLD_INPUT}`),
        inputObject(`not-a-user/${OLD_INPUT}`),
      ])
    );

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 0,
      failed: 0,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('reports eligible stale objects without deleting or advancing state in dry-run mode', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`${USER_ONE}/${OLD_INPUT}`),
        inputObject(`${USER_ONE}/${FRESH_INPUT}`, '2026-08-31T11:30:00.000Z'),
      ])
    );

    await expect(cleanupStaleUpscaleInputs(NOW, { dryRun: true })).resolves.toEqual({
      deleted: 0,
      failed: 0,
      eligible: 1,
    });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('reports only objects confirmed deleted by Supabase Storage', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`${USER_ONE}/${OLD_INPUT}`),
        inputObject(`${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`),
      ])
    );
    mocks.remove.mockResolvedValue({
      data: [{ name: `${USER_ONE}/${OLD_INPUT}` }],
      error: null,
    });

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1,
      failed: 1,
    });
  });

  it('reports failed deletion batches without stopping the cron cleanup', async () => {
    mocks.listV2.mockResolvedValue(
      listResult([
        inputObject(`${USER_ONE}/${OLD_INPUT}`),
        inputObject(`${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`),
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
    mocks.listV2.mockResolvedValue(listResult([inputObject(`${USER_ONE}/${legacyInput}`)]));

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });
    expect(mocks.remove).toHaveBeenCalledWith([`${USER_ONE}/${legacyInput}`]);
  });

  it('bounds each invocation to ten pages and deletes in bounded batches', async () => {
    const events: string[] = [];
    mocks.listV2.mockImplementation(async (options: { cursor?: string }) => {
      events.push('list');
      const page = options.cursor ? Number(options.cursor.replace('page-', '')) : 0;
      const staleObjects = Array.from({ length: 100 }, (_, index) =>
        inputObject(
          `${USER_ONE}/66666666-6666-4666-8666-${String(page * 100 + index).padStart(12, '0')}.png`
        )
      );
      return listResult(staleObjects, true, `page-${page + 1}`);
    });
    mocks.remove.mockImplementation(async (paths: string[]) => {
      events.push('remove');
      return { data: paths.map(name => ({ name })), error: null };
    });
    mocks.upload.mockImplementation(async () => {
      events.push('persist');
      return { data: { path: CLEANUP_STATE_PATH }, error: null };
    });

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1000,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenCalledTimes(10);
    expect(mocks.remove).toHaveBeenCalledTimes(20);
    expect(mocks.remove.mock.calls.every(([paths]) => paths.length <= 50)).toBe(true);
    expect(events.filter(event => event === 'list')).toHaveLength(10);
    expect(events.at(-1)).toBe('persist');
    expect(mocks.upload).toHaveBeenCalledWith(CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: 'page-10' },
      upsert: true,
    });
  });

  it('processes multiple storage pages in one bounded invocation', async () => {
    mocks.listV2
      .mockResolvedValueOnce(
        listResult([inputObject(`${USER_ONE}/${OLD_INPUT}`)], true, 'opaque-page-2')
      )
      .mockResolvedValueOnce(
        listResult([inputObject(`${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`)])
      );

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 2,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenCalledTimes(2);
    expect(mocks.listV2).toHaveBeenNthCalledWith(2, {
      limit: 100,
      prefix: '',
      cursor: 'opaque-page-2',
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(mocks.remove).toHaveBeenNthCalledWith(1, [`${USER_ONE}/${OLD_INPUT}`]);
    expect(mocks.remove).toHaveBeenNthCalledWith(2, [
      `${USER_TWO}/33333333-3333-4333-8333-333333333333.webp`,
    ]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledWith(CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: '' },
      upsert: true,
    });
  });

  it('restores a saved cursor and clears it after reaching the final page', async () => {
    mocks.info.mockResolvedValue({
      data: { metadata: { cleanupVersion: '1', cleanupCursor: 'opaque-page-2' } },
      error: null,
    });
    mocks.listV2.mockResolvedValue(listResult([inputObject(`${USER_TWO}/${OLD_INPUT}`)], false));

    await expect(cleanupStaleUpscaleInputs(NOW)).resolves.toEqual({
      deleted: 1,
      failed: 0,
    });

    expect(mocks.listV2).toHaveBeenCalledWith({
      limit: 100,
      prefix: '',
      cursor: 'opaque-page-2',
      with_delimiter: false,
      sortBy: { column: 'name', order: 'asc' },
    });
    expect(mocks.remove).toHaveBeenCalledWith([`${USER_TWO}/${OLD_INPUT}`]);
    expect(mocks.upload).toHaveBeenCalledWith(CLEANUP_STATE_PATH, expect.any(Uint8Array), {
      contentType: 'image/png',
      metadata: { cleanup_version: '1', cleanup_cursor: '' },
      upsert: true,
    });
  });
});
