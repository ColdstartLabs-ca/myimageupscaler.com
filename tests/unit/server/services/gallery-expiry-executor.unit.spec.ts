import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD-SQR-04 verified gallery-expiry executor unit tests.
 * Synthetic data only. Supabase and R2 are mocked; no network, DB or credentials.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  head: vi.fn(),
  deleteObject: vi.fn(),
  restoreGalleryArchive: vi.fn(),
  buildSavedKey: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock('@server/services/r2-storage.service', () => ({
  R2_PRIVATE_BUCKET: 'miu-private',
  buildSavedKey: mocks.buildSavedKey,
  deleteObject: mocks.deleteObject,
  head: mocks.head,
  restoreGalleryArchive: mocks.restoreGalleryArchive,
}));

import {
  runVerifiedGalleryExpiry,
  type IGalleryExpiryRegistryRow,
} from '@server/services/gallery-expiry-executor.service';

const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID_2 = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';
const SHA256 = 'a'.repeat(64);
const SOURCE_ETAG = '"src-etag-1"';
const ARCHIVE_ETAG = '"arc-etag-1"';
const SIZE_BYTES = 2048;
const RESTORED_ETAG = '"restored-etag-1"';

interface IRpcCall {
  name: string;
  args: Record<string, unknown>;
}

interface IState {
  recoverRows: IGalleryExpiryRegistryRow[];
  claimRows: IGalleryExpiryRegistryRow[];
  savedImages: Set<string>;
  savedQueryError: boolean;
  rpcCalls: IRpcCall[];
  headCounts: Map<string, number>;
  finishImpl: () => Promise<{ data: unknown; error: unknown }>;
  releaseImpl: () => Promise<{ data: unknown; error: unknown }>;
  restoreImpl: () => Promise<unknown>;
  deleteImpl: () => Promise<void>;
  headImpl: (key: string) => Promise<Response> | Response;
}

const state: IState = {
  recoverRows: [],
  claimRows: [],
  savedImages: new Set<string>(),
  savedQueryError: false,
  rpcCalls: [],
  headCounts: new Map<string, number>(),
  finishImpl: () => Promise.resolve({ data: 'completed', error: null }),
  releaseImpl: () => Promise.resolve({ data: true, error: null }),
  restoreImpl: () => Promise.resolve({ etag: RESTORED_ETAG }),
  deleteImpl: () => Promise.resolve(),
  headImpl: () => Promise.resolve(new Response(null, { status: 200 })),
};

function makeRow(overrides: Partial<IGalleryExpiryRegistryRow> = {}): IGalleryExpiryRegistryRow {
  const imageId = overrides.image_id ?? IMAGE_ID;
  const sha256 = overrides.sha256 ?? SHA256;
  const storagePath = `user/${imageId}.png`;
  return {
    image_id: imageId,
    user_id: USER_ID,
    storage_path: storagePath,
    saved_row: { id: imageId, user_id: USER_ID, storage_path: storagePath, storage_backend: 'r2' },
    sha256,
    size_bytes: SIZE_BYTES,
    source_etag: SOURCE_ETAG,
    archive_key: `archive/gallery/${imageId}/${sha256}`,
    archive_etag: ARCHIVE_ETAG,
    state: 'deleting',
    attempt_id: ATTEMPT_ID,
    started_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function okHead(etag: string): Response {
  return new Response(null, {
    status: 200,
    headers: { etag, 'content-length': String(SIZE_BYTES) },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.recoverRows = [];
  state.claimRows = [];
  state.savedImages = new Set<string>();
  state.savedQueryError = false;
  state.rpcCalls = [];
  state.headCounts = new Map<string, number>();
  state.finishImpl = () => Promise.resolve({ data: 'completed', error: null });
  state.releaseImpl = () => Promise.resolve({ data: true, error: null });
  state.restoreImpl = () => Promise.resolve({ etag: RESTORED_ETAG });
  state.deleteImpl = () => Promise.resolve();
  state.headImpl = async (key: string) => {
    const count = (state.headCounts.get(key) ?? 0) + 1;
    state.headCounts.set(key, count);
    if (key.startsWith('saved/')) {
      return count > 1 ? new Response(null, { status: 404 }) : okHead(SOURCE_ETAG);
    }
    return okHead(ARCHIVE_ETAG);
  };

  mocks.buildSavedKey.mockImplementation((path: string) => `saved/${path}`);
  mocks.head.mockImplementation((_bucket: string, key: string) => state.headImpl(key));
  mocks.deleteObject.mockImplementation(() => state.deleteImpl());
  mocks.restoreGalleryArchive.mockImplementation(() => state.restoreImpl());

  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown> = {}) => {
    state.rpcCalls.push({ name, args });
    if (name === 'recover_gallery_expiry_images') {
      return Promise.resolve({
        data: state.recoverRows.splice(0, Number(args.p_limit ?? 1)),
        error: null,
      });
    }
    if (name === 'claim_gallery_expiry_images') {
      return Promise.resolve({
        data: state.claimRows.splice(0, Number(args.p_limit ?? 1)),
        error: null,
      });
    }
    if (name === 'finish_gallery_expiry_image') return state.finishImpl();
    if (name === 'release_gallery_expiry_image') return state.releaseImpl();
    return Promise.resolve({ data: null, error: null });
  });

  mocks.from.mockImplementation(() => {
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      maybeSingle: () =>
        Promise.resolve(
          state.savedQueryError
            ? { data: null, error: { message: 'query failed' } }
            : {
                data: state.savedImages.has(`${filters.id}:${filters.user_id}`)
                  ? { id: filters.id }
                  : null,
                error: null,
              }
        ),
    };
    return chain;
  });
});

describe('runVerifiedGalleryExpiry', () => {
  it('does nothing on an empty registry', async () => {
    const result = await runVerifiedGalleryExpiry();

    expect(result).toEqual({ processed: 0, deleted: 0, recovered: 0, failed: 0 });
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
  });

  it('recovers an unfinished claim before new claims, even when the user is active or paid now', async () => {
    state.recoverRows = [makeRow({ image_id: IMAGE_ID })];
    state.claimRows = [makeRow({ image_id: IMAGE_ID_2 })];
    state.savedImages.add(`${IMAGE_ID}:${USER_ID}`);

    const result = await runVerifiedGalleryExpiry();

    expect(state.rpcCalls[0].name).toBe('recover_gallery_expiry_images');
    const releaseIndex = state.rpcCalls.findIndex(c => c.name === 'release_gallery_expiry_image');
    const claimIndex = state.rpcCalls.findIndex(c => c.name === 'claim_gallery_expiry_images');
    expect(releaseIndex).toBeGreaterThanOrEqual(0);
    expect(releaseIndex).toBeLessThan(claimIndex);
    expect(mocks.restoreGalleryArchive).toHaveBeenCalledWith(
      expect.objectContaining({ imageId: IMAGE_ID, sha256: SHA256, sourceEtag: SOURCE_ETAG })
    );
    expect(state.rpcCalls[releaseIndex].args).toMatchObject({
      p_image_id: IMAGE_ID,
      p_attempt_id: ATTEMPT_ID,
      p_source_etag: RESTORED_ETAG,
    });
    expect(result).toMatchObject({ recovered: 1, deleted: 1, failed: 0 });
  });

  it('deletes nothing, restores nothing, and keeps deleting when the source identity changed', async () => {
    state.claimRows = [makeRow()];
    state.headImpl = async (key: string) =>
      key.startsWith('saved/')
        ? new Response(null, {
            status: 200,
            headers: { etag: '"changed"', 'content-length': String(SIZE_BYTES) },
          })
        : okHead(ARCHIVE_ETAG);

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(false);
    expect(result).toMatchObject({ processed: 1, deleted: 0, recovered: 0, failed: 1 });
  });

  it('deletes nothing and keeps deleting when the archive identity no longer matches', async () => {
    state.claimRows = [makeRow()];
    state.restoreImpl = () => Promise.reject(new Error('archive identity mismatch'));
    state.headImpl = async (key: string) =>
      key.startsWith('saved/')
        ? okHead(SOURCE_ETAG)
        : new Response(null, {
            status: 200,
            headers: { etag: '"changed"', 'content-length': String(SIZE_BYTES) },
          });

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(false);
    expect(result).toMatchObject({ deleted: 0, recovered: 0, failed: 1 });
  });

  it('restores and releases when the object delete fails', async () => {
    state.claimRows = [makeRow()];
    state.deleteImpl = () => Promise.reject(new Error('R2 DELETE failed'));

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(true);
    expect(result).toMatchObject({ deleted: 0, recovered: 1, failed: 0 });
  });

  it('treats a 503 after delete as not-absent and restores', async () => {
    state.claimRows = [makeRow()];
    let savedHeads = 0;
    state.headImpl = async (key: string) => {
      if (key.startsWith('saved/')) {
        savedHeads += 1;
        return savedHeads === 1 ? okHead(SOURCE_ETAG) : new Response(null, { status: 503 });
      }
      return okHead(ARCHIVE_ETAG);
    };

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ deleted: 0, recovered: 1 });
  });

  it('restores when the finish commit is uncertain', async () => {
    state.claimRows = [makeRow()];
    state.finishImpl = () => Promise.resolve({ data: null, error: { message: 'network' } });

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(true);
    expect(result).toMatchObject({ deleted: 0, recovered: 1, failed: 0 });
  });

  it('restores when the atomic finish requires a restore', async () => {
    state.claimRows = [makeRow()];
    state.finishImpl = () => Promise.resolve({ data: 'restore_required', error: null });

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ deleted: 0, recovered: 1, failed: 0 });
  });

  it('keeps the attempt in deleting when the restore fails', async () => {
    state.claimRows = [makeRow()];
    state.deleteImpl = () => Promise.reject(new Error('R2 DELETE failed'));
    state.restoreImpl = () => Promise.reject(new Error('restore failed'));

    const result = await runVerifiedGalleryExpiry();

    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(false);
    expect(result).toMatchObject({ deleted: 0, recovered: 0, failed: 1 });
  });

  it('deletes only the saved object and finishes completed', async () => {
    state.claimRows = [makeRow()];

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).toHaveBeenCalledWith('miu-private', `saved/user/${IMAGE_ID}.png`);
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 1, recovered: 0, failed: 0 });
  });

  it('keeps a deleting row when the saved-image query errors during recovery', async () => {
    state.recoverRows = [makeRow()];
    state.savedQueryError = true;

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(false);
    expect(result).toMatchObject({ recovered: 0, failed: 1 });
  });

  it('treats a weak source ETag as a raw mismatch and deletes nothing', async () => {
    state.claimRows = [makeRow()];
    state.headImpl = async (key: string) =>
      key.startsWith('saved/')
        ? new Response(null, {
            status: 200,
            headers: { etag: `W/${SOURCE_ETAG}`, 'content-length': String(SIZE_BYTES) },
          })
        : okHead(ARCHIVE_ETAG);

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 0, recovered: 0, failed: 1 });
  });

  it('deletes nothing when the archive carries a non-identity encoding', async () => {
    state.claimRows = [makeRow()];
    state.restoreImpl = () => Promise.reject(new Error('archive is encoded'));
    state.headImpl = async (key: string) =>
      key.startsWith('saved/')
        ? okHead(SOURCE_ETAG)
        : new Response(null, {
            status: 200,
            headers: {
              etag: ARCHIVE_ETAG,
              'content-length': String(SIZE_BYTES),
              'content-encoding': 'gzip',
            },
          });

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(result).toMatchObject({ deleted: 0, recovered: 0, failed: 1 });
  });

  it('does no IO when the saved-row snapshot does not bind to the registry row', async () => {
    state.claimRows = [
      makeRow({
        saved_row: {
          id: IMAGE_ID,
          user_id: USER_ID,
          storage_path: `user/${IMAGE_ID}.png`,
          storage_backend: 'supabase',
        },
      }),
    ];

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: 1, deleted: 0, failed: 1 });
  });

  it('does no IO and stops on a malformed recovery row', async () => {
    state.recoverRows = [makeRow({ sha256: 'A'.repeat(64) })];
    state.claimRows = [makeRow({ image_id: IMAGE_ID_2 })];

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.head).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('claim_gallery_expiry_images', expect.anything());
    expect(result).toMatchObject({ processed: 1, recovered: 0, failed: 1 });
  });

  it('stops claiming new images after a failed restoration', async () => {
    state.claimRows = [makeRow({ image_id: IMAGE_ID }), makeRow({ image_id: IMAGE_ID_2 })];
    state.deleteImpl = () => Promise.reject(new Error('R2 DELETE failed'));
    state.restoreImpl = () => Promise.reject(new Error('restore failed'));

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(mocks.restoreGalleryArchive).toHaveBeenCalledTimes(1);
    expect(mocks.head).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ processed: 1, deleted: 0, recovered: 0, failed: 1 });
  });

  it('counts failed when an absent recovery row cannot finish', async () => {
    state.recoverRows = [makeRow()];
    state.finishImpl = () => Promise.resolve({ data: null, error: null });

    const result = await runVerifiedGalleryExpiry();

    expect(mocks.restoreGalleryArchive).not.toHaveBeenCalled();
    expect(state.rpcCalls.some(c => c.name === 'release_gallery_expiry_image')).toBe(false);
    expect(result).toMatchObject({ processed: 1, recovered: 0, failed: 1 });
  });
});
