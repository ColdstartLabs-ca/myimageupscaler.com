/**
 * Gallery Expiry Read Fallback Unit Tests (SQR-04)
 *
 * Contract under test for resolveGalleryObjectKeys:
 * - Empty owner rows do no registry query.
 * - Original keys are `buildSavedKey(storage_path)`.
 * - One bounded registry lookup: user scoped, `state in (ready, deleting)`,
 *   `image_id` in the owned ids, selecting only
 *   `image_id,user_id,storage_path,sha256,archive_key`.
 * - A valid `ready` or `deleting` row swaps in its immutable
 *   `archive/gallery/<id>/<sha>` key. A `ready` proof is included because a stale
 *   worker can delete the original after a newer worker restored and released the
 *   row back to `ready`, so archive reads must outlive the claim.
 * - A `completed` row is never selected (its DB row is already gone).
 * - A registry error throws (never sign a possibly deleted original).
 * - A foreign or malformed proof throws and never signs an arbitrary key.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  buildSavedKey: vi.fn((storagePath: string) => `saved/${storagePath}`),
  rows: [] as Array<Record<string, unknown>>,
  error: null as unknown,
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: h.from },
}));

vi.mock('@server/services/r2-storage.service', () => ({
  buildSavedKey: h.buildSavedKey,
}));

import {
  resolveGalleryObjectKeys,
  deriveGalleryArchiveKey,
} from '@server/services/gallery-expiry-read.service';

const USER_ID = 'user-1';
const IMAGE_ID = '11111111-1111-4111-8111-111111111111';
const STORAGE_PATH = 'user-1/abc.png';
const SHA256 = 'a'.repeat(64);
const OWNED = [{ id: IMAGE_ID, storage_path: STORAGE_PATH }];

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    image_id: IMAGE_ID,
    user_id: USER_ID,
    storage_path: STORAGE_PATH,
    sha256: SHA256,
    archive_key: deriveGalleryArchiveKey(IMAGE_ID, SHA256),
    state: 'deleting',
    ...overrides,
  };
}

describe('resolveGalleryObjectKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.rows = [];
    h.error = null;
    let stateFilter: unknown[] | null = null;
    const builder: Record<string, unknown> = {};
    builder.select = (cols: string) => {
      h.select(cols);
      return builder;
    };
    builder.eq = (col: string, val: unknown) => {
      h.eq(col, val);
      if (col === 'state') stateFilter = [val];
      return builder;
    };
    builder.in = (col: string, val: unknown) => {
      h.in(col, val);
      if (col === 'state') stateFilter = val as unknown[];
      return builder;
    };
    // The fake query respects the state predicate, so a proof is only returned
    // when the service actually selects its state. Other columns are not filtered
    // because the real lookup is already owner/id scoped upstream.
    builder.then = (resolve: (value: unknown) => unknown) => {
      const data = h.error
        ? null
        : stateFilter
          ? h.rows.filter(row => (stateFilter as unknown[]).includes(row.state))
          : h.rows;
      return Promise.resolve({ data, error: h.error }).then(resolve);
    };
    h.from.mockReturnValue(builder);
  });

  test('does no registry query for an empty owner row set', async () => {
    const keys = await resolveGalleryObjectKeys(USER_ID, []);

    expect(keys.size).toBe(0);
    expect(h.from).not.toHaveBeenCalled();
    expect(h.in).not.toHaveBeenCalled();
  });

  test('returns the original saved key when there is no registry row', async () => {
    const keys = await resolveGalleryObjectKeys(USER_ID, OWNED);

    expect(keys.get(IMAGE_ID)).toBe(`saved/${STORAGE_PATH}`);
    expect(h.from).toHaveBeenCalledWith('gallery_expiry_backups');
    expect(h.select).toHaveBeenCalledWith('image_id,user_id,storage_path,sha256,archive_key');
    expect(h.select.mock.calls[0][0]).not.toContain('saved_row');
    expect(h.eq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(h.in).toHaveBeenCalledWith('state', ['ready', 'deleting']);
    expect(h.in).toHaveBeenCalledWith('image_id', [IMAGE_ID]);
  });

  test('swaps in the immutable archive key for a valid deleting row', async () => {
    h.rows = [validEntry()];

    const keys = await resolveGalleryObjectKeys(USER_ID, OWNED);

    expect(keys.get(IMAGE_ID)).toBe(deriveGalleryArchiveKey(IMAGE_ID, SHA256));
  });

  test('keeps a released ready proof readable from the archive after a stale original DELETE', async () => {
    // A stale worker can delete the original after a newer worker restored and
    // released the row back to `ready`. The archived bytes are the same pixels and
    // the SHA-256 proof precedes registration, so reads must use the archive.
    h.rows = [validEntry({ state: 'ready' })];

    const keys = await resolveGalleryObjectKeys(USER_ID, OWNED);

    expect(keys.get(IMAGE_ID)).toBe(deriveGalleryArchiveKey(IMAGE_ID, SHA256));
  });

  test('never selects a completed proof, so an absent registry row keeps the original', async () => {
    h.rows = [validEntry({ state: 'completed' })];

    const keys = await resolveGalleryObjectKeys(USER_ID, OWNED);

    expect(keys.get(IMAGE_ID)).toBe(`saved/${STORAGE_PATH}`);
  });

  test('throws when the registry lookup errors, never signing the original', async () => {
    h.error = { message: 'registry down' };

    await expect(resolveGalleryObjectKeys(USER_ID, OWNED)).rejects.toThrow(
      /gallery expiry registry/i
    );
  });

  test.each([
    ['a foreign owner', validEntry({ user_id: 'user-2' })],
    ['a path mismatch', validEntry({ storage_path: 'user-1/other.png' })],
    ['an uppercase hash', validEntry({ sha256: 'A'.repeat(64) })],
    ['a short hash', validEntry({ sha256: 'abc' })],
    ['a mismatched archive key', validEntry({ archive_key: 'archive/gallery/other/x' })],
    ['an unowned image id', validEntry({ image_id: 'other-id' })],
  ])('throws on %s and never signs an arbitrary key', async (_label, entry) => {
    h.rows = [entry];

    await expect(resolveGalleryObjectKeys(USER_ID, OWNED)).rejects.toThrow(
      /invalid gallery expiry backup/i
    );
    expect(h.buildSavedKey).not.toHaveBeenCalledWith(entry.archive_key);
  });
});
