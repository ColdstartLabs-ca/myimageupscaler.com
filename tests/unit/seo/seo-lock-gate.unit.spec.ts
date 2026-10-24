import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkLockApproval,
  checkRenderedLocks,
  formatLockDiffs,
  type ISeoLock,
} from '@/scripts/seo/seo-lock-gate';

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
  it('warns only for the previous approved DB value, and rejects unrelated drift', async () => {
    const fields = await import('@lib/seo/seo-lock').then(m => m.extractSeoFields('<title>Approved title</title>'));
    const lock: ISeoLock = { '/blog/locked': { ...fields, source: 'db', clicks28d: 21 } };
    const pending = new Map([['/blog/locked:title', 'Previous title']]);
    const previous = await checkRenderedLocks(lock, async () => ({ status: 200, html: '<title>Previous title</title>' }), pending);
    expect(previous.ok).toBe(true);
    expect(previous.warnings).toHaveLength(1);
    const unrelated = await checkRenderedLocks(lock, async () => ({ status: 200, html: '<title>Unapproved third title</title>' }), pending);
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
  it('allows pending DB drift only for approval commits in this deployment range', async () => {
    const fixture = makeSignedRepo();
    try {
      const previousDeploy = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      writeFileSync(fixture.allowedSigners, `test-signer ${readFileSync(`${fixture.privateKey}.pub`, 'utf8')}`);
      writeLock(fixture.repo, { '/blog/locked': { ...ENTRY, title: 'Approved new title' } });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['commit', '-S', '-m', 'approve new title']);
      const currentDeploy = git(fixture.repo, ['rev-parse', 'HEAD']).trim();
      const options = { repoRoot: fixture.repo, allowedSignersFile: fixture.allowedSigners };
      expect((await checkLockApproval({ ...options, deployBase: previousDeploy })).changedDbFields)
        .toEqual(new Map([['/blog/locked:title', ENTRY.title]]));
      expect((await checkLockApproval({ ...options, deployBase: currentDeploy })).changedDbFields.size).toBe(0);
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

  it('does not treat an OpenPGP/web-flow-style commit as SSH approval', async () => {
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
        '/blog/locked': { ...ENTRY, title: 'Web-flow changed title' },
      });
      git(fixture.repo, ['add', 'content/seo-lock.json']);
      git(fixture.repo, ['-c', 'commit.gpgsign=true', 'commit', '-m', 'web-flow API update']);

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
