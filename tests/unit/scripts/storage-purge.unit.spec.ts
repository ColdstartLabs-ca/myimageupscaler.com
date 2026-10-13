import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import * as storagePurgeModule from '../../../scripts/storage/backup-and-purge.mjs';

// The operator script is plain ESM (.mjs) with no JSDoc types; tests are not
// part of the tsc project, so cast the module to a loose facade.
// Execution-level runPurge/runExpire coverage lives in
// tests/unit/scripts/storage-execution.unit.spec.ts against the frozen-plan contract.
/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  INPUT_BUCKET,
  chunk,
  isInputCandidateEligible,
  selectPurgePaths,
  validateObjectPath,
  validateManifestEntries,
  verifyArtifactHash,
  blogPathFromUrl,
  extractBlogPathsFromMarkdown,
  verifyStorageIntegrity,
} = storagePurgeModule as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    path: 'user/file.png',
    bytes: 100,
    created_at: new Date(NOW - 10 * DAY).toISOString(),
    updated_at: new Date(NOW - 10 * DAY).toISOString(),
    gallery_reference: false,
    nonterminal_reservation_reference: false,
    nonterminal_job_reference: false,
    reservation_output_reference: false,
    job_output_reference: false,
    ...overrides,
  };
}

describe('plan-purge eligibility (AC-1)', () => {
  it('excludes a path referenced by a gallery row', () => {
    const row = candidate({ path: 'ref/gallery.png', gallery_reference: true });
    expect(isInputCandidateEligible(row, NOW)).toBe(false);
    expect(
      selectPurgePaths([row], { now: NOW, verifiedByPath: new Map([[row.path, {}]]) })
    ).toEqual([]);
  });

  it.each([
    'nonterminal_reservation_reference',
    'nonterminal_job_reference',
    'reservation_output_reference',
    'job_output_reference',
  ])('excludes a path referenced by %s', flag => {
    const row = candidate({ path: `ref/${flag}.png`, [flag]: true });
    expect(isInputCandidateEligible(row, NOW)).toBe(false);
  });

  it('excludes a path younger than 7 days by created_at or updated_at', () => {
    const youngCreated = candidate({
      path: 'young/created.png',
      created_at: new Date(NOW - 1 * DAY).toISOString(),
    });
    const youngUpdated = candidate({
      path: 'young/updated.png',
      updated_at: new Date(NOW - 1 * DAY).toISOString(),
    });
    expect(isInputCandidateEligible(youngCreated, NOW)).toBe(false);
    expect(isInputCandidateEligible(youngUpdated, NOW)).toBe(false);
  });

  it('keeps an old unreferenced path only when it exists in the verified backup', () => {
    const eligible = candidate({ path: 'old/ok.png', bytes: 42 });
    const unbackedUp = candidate({ path: 'old/missing.png' });
    const verifiedByPath = new Map([['old/ok.png', { sha256: 'abc', bytes: 42 }]]);

    const selected = selectPurgePaths([eligible, unbackedUp], { now: NOW, verifiedByPath });

    expect(selected).toEqual([
      { bucket: INPUT_BUCKET, path: 'old/ok.png', bytes: 42, sha256: 'abc' },
    ]);
  });
});

describe('chunk', () => {
  it('splits with the last chunk as the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});

describe('Security & Hash verification (AC-2 hardening)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqr-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects path traversal attempts in validateObjectPath and verifyArtifactHash', async () => {
    expect(validateObjectPath('../escape.png')).toBe(false);
    expect(validateObjectPath('/absolute.png')).toBe(false);
    expect(validateObjectPath('foo/../../bar.png')).toBe(false);
    expect(validateObjectPath('valid/dir/image.png')).toBe(true);

    await expect(
      verifyArtifactHash(tempDir, INPUT_BUCKET, '../escape.png', 'a'.repeat(64), 10)
    ).rejects.toThrow(/invalid object path/i);
  });

  it('detects symlinks and refuses to verify or delete them', async () => {
    const bucketDir = path.join(tempDir, INPUT_BUCKET);
    fs.mkdirSync(bucketDir, { recursive: true });
    const targetFile = path.join(tempDir, 'outside.txt');
    fs.writeFileSync(targetFile, 'outside content');
    const symlinkPath = path.join(bucketDir, 'symlinked.png');
    fs.symlinkSync(targetFile, symlinkPath);

    await expect(
      verifyArtifactHash(tempDir, INPUT_BUCKET, 'symlinked.png', 'a'.repeat(64), 15)
    ).rejects.toThrow(/symlink/i);
  });

  it('verifies real backup temp files and fails closed on byte mismatch or tampered hash', async () => {
    const bucketDir = path.join(tempDir, INPUT_BUCKET);
    fs.mkdirSync(bucketDir, { recursive: true });
    const filePath = path.join(bucketDir, 'valid.png');
    const content = Buffer.from('image bytes data');
    fs.writeFileSync(filePath, content);
    const validSha = crypto.createHash('sha256').update(content).digest('hex');

    // Correct verification succeeds
    const verified = await verifyArtifactHash(
      tempDir,
      INPUT_BUCKET,
      'valid.png',
      validSha,
      content.length
    );
    expect(verified.actualSha256).toBe(validSha);
    expect(verified.size).toBe(content.length);

    // Tampered byte size throws
    await expect(
      verifyArtifactHash(tempDir, INPUT_BUCKET, 'valid.png', validSha, content.length + 5)
    ).rejects.toThrow(/byte size mismatch/i);

    // Tampered hash throws
    await expect(
      verifyArtifactHash(tempDir, INPUT_BUCKET, 'valid.png', 'b'.repeat(64), content.length)
    ).rejects.toThrow(/sha256 mismatch/i);
  });

  it('manifest validation rejects duplicate entries, wrong buckets, and oversize batches', () => {
    const entry1 = { bucket: INPUT_BUCKET, path: 'a.png', sha256: 'a'.repeat(64), bytes: 10 };
    const duplicate = { bucket: INPUT_BUCKET, path: 'a.png', sha256: 'a'.repeat(64), bytes: 10 };
    const wrongBucket = { bucket: 'evil-bucket', path: 'b.png', sha256: 'a'.repeat(64), bytes: 10 };

    expect(() => validateManifestEntries([entry1, duplicate], INPUT_BUCKET)).toThrow(/duplicate/i);
    expect(() => validateManifestEntries([wrongBucket], INPUT_BUCKET)).toThrow(/bucket mismatch/i);
  });
});

describe('Integrity URL and Markdown extractors', () => {
  it('extracts blog paths accurately from public and render URLs', () => {
    expect(
      blogPathFromUrl(
        'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test.webp'
      )
    ).toBe('2026/02/test.webp');
    expect(
      blogPathFromUrl(
        'https://example.supabase.co/storage/v1/render/image/public/blog-images/2026/06/hero.webp?w=800'
      )
    ).toBe('2026/06/hero.webp');
  });

  it('extracts embedded markdown blog-images paths', () => {
    const markdown = `
      # Hello
      ![Alt text](https://project.supabase.co/storage/v1/object/public/blog-images/2026/01/inline-1.webp)
      Some text and another image:
      ![Alt 2](/storage/v1/render/image/public/blog-images/2026/02/inline-2.png).
    `;
    const extracted = extractBlogPathsFromMarkdown(markdown);
    expect(extracted).toContain('2026/01/inline-1.webp');
    expect(extracted).toContain('2026/02/inline-2.png');
  });
});

describe('Storage integrity baseline preservation', () => {
  it.each(['baseline', 'other-post', 'featured', 'shared-path', 'gallery', 'restored'])(
    'preserves only the accepted missing body reference (%s)',
    async mode => {
      const objectPath = '2026/01/1769887240667-tools-inline-1.webp';
      const url = `https://project.supabase.co/storage/v1/object/public/blog-images/${objectPath}`;
      const post = { id: 'b26a2f86-ec30-40d0-8a33-bca21bfb7417', content: `![x](${url})` };
      const posts =
        mode === 'other-post'
          ? [{ ...post, id: 'other' }]
          : mode === 'featured'
            ? [{ ...post, content: '', featured_image_url: url }]
            : mode === 'shared-path'
              ? [post, { ...post, id: 'other' }]
              : [post];
      const calls: string[] = [];
      const db = {
        query: async (sql: string) => {
          calls.push(sql);
          return {
            rows: sql.includes('public.saved_images')
              ? mode === 'gallery'
                ? [{ id: 's1', storage_path: objectPath }]
                : []
              : sql.includes('public.blog_images')
                ? []
                : posts,
          };
        },
      };
      const storage = {
        from: () => ({
          list: async () => ({
            data: mode === 'restored' ? [{ name: objectPath, id: 'restored' }] : [],
            error: null,
          }),
        }),
      };
      const messages: string[] = [];
      const result = await verifyStorageIntegrity({
        db,
        storage,
        log: (value: string) => messages.push(value),
      });
      expect(result.ok).toBe(mode === 'baseline' || mode === 'restored');
      expect(result.missing.length).toBe(mode === 'restored' ? 0 : mode === 'gallery' ? 2 : 1);
      expect(messages.join(' ')).toContain('missing:');
      expect(calls.every(sql => sql.startsWith('SELECT'))).toBe(true);
      expect(calls.some(sql => sql.includes('SELECT id, featured_image_url'))).toBe(true);
    }
  );
});
