import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { fetch as nodeFetch } from 'undici';
import {
  checkLockApproval,
  checkRenderedLocks,
  formatLockDiffs,
  waitForServer,
  runSeoLockGate,
} from '@/scripts/seo/seo-lock-gate';
import type { ISeoLock } from '@lib/seo/seo-lock';

const { loadAutoSeoLocks } = vi.hoisted(() => ({ loadAutoSeoLocks: vi.fn() }));
vi.mock('@server/services/seo-lock.service', () => ({ loadAutoSeoLocks }));

const ENTRY = {
  title: 'Locked title',
  description: 'Locked description',
  h1: 'Locked heading',
  introHash: 'a'.repeat(64),
  canonical: 'https://myimageupscaler.com/blog/locked',
  robots: 'index, follow',
  hreflang: ['en=https://myimageupscaler.com/blog/locked'],
  jsonLdTypes: ['BlogPosting'],
  source: 'code' as const,
  clicks28d: 21,
};

const LOCK: ISeoLock = { '/blog/locked': ENTRY };

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function writeLock(repo: string, lock: ISeoLock): void {
  writeFileSync(join(repo, 'content/seo-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
}

function makeSignedRepo(): {
  repo: string;
  keyDir: string;
  allowedSigners: string;
  privateKey: string;
} {
  const repo = mkdtempSync(join(tmpdir(), 'seo-lock-gate-'));
  const keyDir = mkdtempSync(join(tmpdir(), 'seo-lock-key-'));
  const privateKey = join(keyDir, 'id_ed25519');
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', privateKey]);
  mkdirSync(join(repo, 'content'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Test Signer']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  git(repo, ['config', 'gpg.format', 'ssh']);
  git(repo, ['config', 'user.signingKey', privateKey]);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  writeLock(repo, LOCK);
  git(repo, ['add', 'content/seo-lock.json']);
  git(repo, ['-c', 'commit.gpgsign=true', 'commit', '-m', 'signed baseline']);
  return {
    repo,
    keyDir,
    allowedSigners: join(keyDir, 'allowed_signers'),
    privateKey,
  };
}

describe('SEO lock render gate', () => {
  it('passes database locks to R2 from the actual gate entry point', async () => {
    const fixture = makeSignedRepo();
    try {
      const auto = { ...ENTRY, source: 'db' as const };
      writeLock(fixture.repo, { ...LOCK, '/auto': { ...auto, title: 'Unapproved override' } });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-m', 'unsigned auto override']);
      loadAutoSeoLocks.mockClear();
      loadAutoSeoLocks.mockResolvedValue({ '/auto': auto });
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) =>
          String(url).includes('api.github.com')
            ? Response.json([{ key: readFileSync(`${fixture.privateKey}.pub`, 'utf8').trim() }])
            : new Response('<title>Unapproved override</title>')
        )
      );
      const result = await runSeoLockGate({ repoRoot: fixture.repo, baseUrl: 'http://fixture' });
      expect(result.approval.ok).toBe(false);
      expect(result.approval.violations).toContainEqual(
        expect.objectContaining({ path: '/auto', field: 'title' })
      );
      expect(loadAutoSeoLocks).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it('includes auto-added paths in the real gate entry point', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'seo-lock-effective-'));
    mkdirSync(join(repo, 'content'));
    writeLock(repo, {});
    loadAutoSeoLocks.mockResolvedValue({ '/auto-winner': ENTRY });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('api.github.com')
          ? new Response('[]', { headers: { 'content-type': 'application/json' } })
          : new Response(
              '<html><head><title>Unapproved title</title></head><body><h1>Heading</h1><p>Intro</p></body></html>'
            )
      )
    );
    try {
      const result = await runSeoLockGate({ repoRoot: repo, baseUrl: 'http://fixture' });
      expect(loadAutoSeoLocks).toHaveBeenCalled();
      expect(result.render.ok).toBe(false);
      expect(result.render.failures).toContainEqual(
        expect.objectContaining({
          url: '/auto-winner',
          field: 'title',
          expected: ENTRY.title,
          actual: 'Unapproved title',
        })
      );
    } finally {
      vi.unstubAllGlobals();
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('accepts an HTTP redirect as readiness without following a redirect loop', async () => {
    vi.stubGlobal('fetch', nodeFetch);
    let requests = 0;
    const server = createServer((_req, res) => {
      requests++;
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server address');
      res.writeHead(301, { location: `http://127.0.0.1:${address.port}/` });
      res.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server address');
      await expect(waitForServer(`http://127.0.0.1:${address.port}`, 30)).resolves.toBeUndefined();
      expect(requests).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve()))
      );
    }
  });
  it('warns only for the previous approved DB value, and rejects unrelated drift', async () => {
    const fields = await import('@lib/seo/seo-lock').then(m =>
      m.extractSeoFields('<title>Approved title</title>')
    );
    const lock: ISeoLock = { '/blog/locked': { ...fields, source: 'db', clicks28d: 21 } };
    const pending = new Map([['/blog/locked:title', 'Previous title']]);
    const previous = await checkRenderedLocks(
      lock,
      async () => ({ status: 200, html: '<title>Previous title</title>' }),
      pending
    );
    expect(previous.ok).toBe(true);
    expect(previous.warnings).toHaveLength(1);
    const unrelated = await checkRenderedLocks(
      lock,
      async () => ({ status: 200, html: '<title>Unapproved third title</title>' }),
      pending
    );
    expect(unrelated.ok).toBe(false);
    expect(unrelated.warnings).toHaveLength(0);
  });
  it('fails on a changed title and exposes the field diff', async () => {
    const result = await checkRenderedLocks(LOCK, async () => ({
      status: 200,
      html: '<title>Changed title</title>',
    }));

    expect(result.ok).toBe(false);
    expect(formatLockDiffs(result.failures)).toContain(
      '/blog/locked | title | locked="Locked title" | rendered="Changed title"'
    );
  });

  it('passes unchanged rendered fields', async () => {
    const html = `
      <title>Locked title</title>
      <meta name="description" content="Locked description">
      <meta name="robots" content="index, follow">
      <link rel="canonical" href="https://myimageupscaler.com/blog/locked">
      <link rel="alternate" hreflang="en" href="https://myimageupscaler.com/blog/locked">
      <h1>Locked heading</h1>
      <p>Not the locked intro.</p>
      <script type="application/ld+json">{"@type":"BlogPosting"}</script>
    `;
    const result = await checkRenderedLocks(
      {
        '/blog/locked': {
          ...ENTRY,
          introHash: createHash('sha256').update('Not the locked intro.').digest('hex'),
        },
      },
      async () => ({ status: 200, html })
    );

    expect(result).toEqual({ ok: true, failures: [], warnings: [] });
  });
});

describe('SEO lock approval gate', () => {
  it('checks working-tree values while allowing a genuinely new unlocked path', async () => {
    const fixture = makeSignedRepo();
    try {
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      const options = { repoRoot: fixture.repo, allowedSignersFile: fixture.allowedSigners };
      writeLock(fixture.repo, { ...LOCK, '/new-winner': ENTRY });
      expect((await checkLockApproval(options)).ok).toBe(true);
      writeLock(fixture.repo, {
        '/blog/locked': { ...ENTRY, title: 'Uncommitted unauthorized title' },
      });
      const result = await checkLockApproval(options);
      expect(result.ok).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ commitSha: 'WORKTREE', path: '/blog/locked', field: 'title' })
      );
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it.each([
    { title: ENTRY.title, allowed: true },
    { title: 'Unsigned auto override', allowed: false },
  ])(
    'checks an unsigned JSON promotion against frozen auto values: $allowed',
    async ({ title, allowed }) => {
      const fixture = makeSignedRepo();
      try {
        writeFileSync(
          fixture.allowedSigners,
          `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
        );
        const auto = { ...ENTRY, source: 'db' as const };
        writeLock(fixture.repo, { ...LOCK, '/auto': { ...auto, title } });
        expect(
          (
            await checkLockApproval({
              repoRoot: fixture.repo,
              allowedSignersFile: fixture.allowedSigners,
              autoLock: { '/auto': auto },
            })
          ).ok
        ).toBe(allowed);
        git(fixture.repo, ['add', 'content/seo-lock.json']);
        git(fixture.repo, ['commit', '-m', 'unsigned JSON addition over auto lock']);
        const result = await checkLockApproval({
          repoRoot: fixture.repo,
          allowedSignersFile: fixture.allowedSigners,
          autoLock: { '/auto': auto },
        });
        expect(result.ok).toBe(allowed);
        if (!allowed)
          expect(result.violations).toContainEqual(
            expect.objectContaining({
              path: '/auto',
              field: 'title',
              expected: auto.title,
              actual: title,
            })
          );
      } finally {
        rmSync(fixture.repo, { recursive: true, force: true });
        rmSync(fixture.keyDir, { recursive: true, force: true });
      }
    }
  );

  it('requires evaluation metadata for a signed change promoted from an auto lock', async () => {
    const fixture = makeSignedRepo();
    try {
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      writeLock(fixture.repo, {
        ...LOCK,
        '/auto': { ...ENTRY, source: 'db', title: 'Signed auto change' },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'promote changed auto value without baseline']);
      const result = await checkLockApproval({
        repoRoot: fixture.repo,
        allowedSignersFile: fixture.allowedSigners,
        autoLock: { '/auto': { ...ENTRY, source: 'db' } },
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('evaluation metadata');
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it('allows a signed auto promotion and reports only its previous DB value as pending', async () => {
    const fixture = makeSignedRepo();
    try {
      const base = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      const auto = { ...ENTRY, source: 'db' as const };
      writeLock(fixture.repo, {
        ...LOCK,
        '/auto': {
          ...auto,
          title: 'Signed new title',
          change: {
            approvedAt: '2026-10-01',
            baselineClicks28d: 100,
            baselineEndDate: '2026-09-28',
            readbackDate: '2026-10-18',
            previousLockCommit: base,
          },
        },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'approve auto promotion']);
      const options = {
        repoRoot: fixture.repo,
        allowedSignersFile: fixture.allowedSigners,
        autoLock: { '/auto': auto },
      };
      const result = await checkLockApproval({ ...options, deployBase: base });
      expect(result.ok).toBe(true);
      expect(result.changedDbFields).toEqual(new Map([['/auto:title', auto.title]]));
      expect(
        (
          await checkLockApproval({
            ...options,
            deployBase: git(fixture.repo, ['rev-parse', 'HEAD']).trim(),
          })
        ).changedDbFields.size
      ).toBe(0);
      const promoted = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      writeLock(fixture.repo, LOCK);
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'revert JSON promotion to frozen auto values']);
      const reverted = await checkLockApproval({ ...options, deployBase: promoted });
      expect(reverted.ok).toBe(true);
      expect(reverted.changedDbFields).toEqual(new Map([['/auto:title', 'Signed new title']]));
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it('rejects a signed value change without its evaluation baseline', async () => {
    const fixture = makeSignedRepo();
    try {
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      writeLock(fixture.repo, { '/blog/locked': { ...ENTRY, title: 'Approved new title' } });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'change without evaluation baseline']);
      const result = await checkLockApproval({
        repoRoot: fixture.repo,
        allowedSignersFile: fixture.allowedSigners,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('evaluation metadata');
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });
  it('requires a signature for evaluation metadata on an existing entry', async () => {
    const fixture = makeSignedRepo();
    try {
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      writeLock(fixture.repo, {
        '/blog/locked': {
          ...ENTRY,
          change: {
            approvedAt: '2026-10-01',
            baselineClicks28d: 100,
            baselineEndDate: '2026-09-28',
            readbackDate: '2026-10-18',
            previousLockCommit: 'a'.repeat(40),
          },
        },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-m', 'unsigned baseline manipulation']);
      const result = await checkLockApproval({
        repoRoot: fixture.repo,
        allowedSignersFile: fixture.allowedSigners,
      });
      expect(result.ok).toBe(false);
      expect(result.violations).toContainEqual(expect.objectContaining({ field: 'change' }));
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it('allows pending DB drift only for approval commits in this deployment range', async () => {
    const fixture = makeSignedRepo();
    try {
      const previousDeploy = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      writeLock(fixture.repo, {
        '/blog/locked': {
          ...ENTRY,
          title: 'Approved new title',
          change: {
            approvedAt: '2026-10-01',
            baselineClicks28d: 100,
            baselineEndDate: '2026-09-28',
            readbackDate: '2026-10-18',
            previousLockCommit: previousDeploy,
          },
        },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'approve new title']);
      const currentDeploy = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      const options = { repoRoot: fixture.repo, allowedSignersFile: fixture.allowedSigners };
      expect(
        (await checkLockApproval({ ...options, deployBase: previousDeploy })).changedDbFields
      ).toEqual(new Map([['/blog/locked:title', ENTRY.title]]));
      expect(
        (await checkLockApproval({ ...options, deployBase: currentDeploy })).changedDbFields.size
      ).toBe(0);
      expect((await checkLockApproval(options)).changedDbFields.size).toBe(0);
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it('rejects an unsigned value change and accepts an unsigned addition', async () => {
    const fixture = makeSignedRepo();
    try {
      writeLock(fixture.repo, { ...LOCK, '/blog/added': ENTRY });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-m', 'unsigned addition']);

      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      await expect(
        checkLockApproval({
          repoRoot: fixture.repo,
          allowedSignersFile: fixture.allowedSigners,
        }).then(result => result.ok)
      ).resolves.toBe(true);

      writeLock(fixture.repo, {
        '/blog/locked': { ...ENTRY, title: 'Unsigned changed title' },
        '/blog/added': ENTRY,
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-m', 'unsigned value change']);

      await expect(
        checkLockApproval({
          repoRoot: fixture.repo,
          allowedSignersFile: fixture.allowedSigners,
        }).then(result => result.ok)
      ).resolves.toBe(false);
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
    }
  });

  it.each(['web-flow API update', 'web-flow API update\n\n-----BEGIN SSH SIGNATURE-----'])('does not treat an OpenPGP commit as SSH approval: %s', async message => {
    const fixture = makeSignedRepo();
    const gpgHome = mkdtempSync(join(tmpdir(), 'seo-lock-gpg-'));
    const batchFile = join(gpgHome, 'batch');
    const gpgWrapper = join(gpgHome, 'gpg-wrapper');
    try {
      writeFileSync(
        batchFile,
        [
          'Key-Type: RSA',
          'Key-Length: 2048',
          'Name-Real: Web Flow Fixture',
          'Name-Email: web-flow@example.com',
          'Expire-Date: 1d',
          '%no-protection',
          '%commit',
          '',
        ].join('\n')
      );
      execFileSync('gpg', ['--batch', '--homedir', gpgHome, '--generate-key', batchFile]);
      writeFileSync(
        gpgWrapper,
        `#!/bin/sh\nexec /usr/bin/gpg --homedir ${JSON.stringify(gpgHome)} "$@"\n`
      );
      chmodSync(gpgWrapper, 0o700);
      git(fixture.repo, ['config', 'gpg.format', 'openpgp']);
      git(fixture.repo, ['config', 'gpg.program', gpgWrapper]);
      git(fixture.repo, ['config', 'user.signingKey', 'web-flow@example.com']);
      writeLock(fixture.repo, {
        '/blog/locked': { ...ENTRY, title: 'Web-flow changed title', change: {
          approvedAt: '2026-10-01', baselineClicks28d: 100, baselineEndDate: '2026-09-28',
          readbackDate: '2026-10-18', previousLockCommit: git(fixture.repo, ['rev-parse', 'HEAD']).trim(),
        } },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['-c', 'commit.gpgsign=true', 'commit', '-m', message]);

      writeFileSync(
        fixture.allowedSigners,
        `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`
      );
      await expect(
        checkLockApproval({
          repoRoot: fixture.repo,
          allowedSignersFile: fixture.allowedSigners,
        }).then(result => result.ok)
      ).resolves.toBe(false);
    } finally {
      rmSync(fixture.repo, { recursive: true, force: true });
      rmSync(fixture.keyDir, { recursive: true, force: true });
      rmSync(gpgHome, { recursive: true, force: true });
    }
  });
});
