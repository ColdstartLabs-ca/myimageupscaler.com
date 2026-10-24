import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fetchAllowedSigners, verifySshCommit } from './seo-lock-gate';
import type { ISeoLock } from '@lib/seo/seo-lock';

export function restoreSeoLockEntry(path: string, from: string, repoRoot = process.cwd()): void {
  if (!/^[a-f0-9]{40}$/i.test(from)) throw new Error('Use a full 40-character source commit');
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Use a locked URL path beginning with one slash');
  const lockPath = join(repoRoot, 'content/seo-lock.json');
  try {
    execFileSync('git', ['diff', '--quiet', '--', 'content/seo-lock.json'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    execFileSync('git', ['diff', '--cached', '--quiet', '--', 'content/seo-lock.json'], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  } catch {
    throw new Error('Preserve or commit uncommitted lock changes before restoring an entry');
  }
  const previous = JSON.parse(
    execFileSync('git', ['show', `${from}:content/seo-lock.json`], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  ) as ISeoLock;
  if (!Object.hasOwn(previous, path)) throw new Error(`No lock entry for ${path} at ${from}`);
  const current = JSON.parse(readFileSync(lockPath, 'utf8')) as ISeoLock;
  current[path] = previous[path];
  const temporary = `${lockPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(current, null, 2)}\n`);
    renameSync(temporary, lockPath);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function main(): Promise<void> {
  const path = process.argv.find(arg => arg.startsWith('--path='))?.slice(7);
  const from = process.argv.find(arg => arg.startsWith('--from='))?.slice(7);
  if (!path || !from || !/^[a-f0-9]{40}$/i.test(from))
    throw new Error('Use --path=/locked-url --from=<full-signed-commit>');
  const signers = await fetchAllowedSigners(
    'jonit-dev',
    'https://api.github.com/users/jonit-dev/ssh_signing_keys'
  );
  try {
    const allowed = join(signers.tempDir, 'allowed_signers');
    writeFileSync(allowed, signers.content);
    if (!verifySshCommit(process.cwd(), from, allowed))
      throw new Error('Source commit is not SSH-signed by João');
    restoreSeoLockEntry(path, from);
    console.log(`Restored ${path}. Review git diff, then commit the lock with your SSH signature.`);
  } finally {
    rmSync(signers.tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('seo-lock-restore.ts')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
