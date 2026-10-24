import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { join, relative } from 'node:path';
import {
  diffLock,
  SEO_LOCK_FIELDS,
  extractSeoFields,
  loadEffectiveLock,
  hasValidSeoChangeMetadata,
  type ISeoLock,
  type ISeoLockDiff,
  type TSeoLockField,
} from '@lib/seo/seo-lock';

export interface IRenderedLockDiff extends ISeoLockDiff {
  url: string;
}

export interface IRenderGateResult {
  ok: boolean;
  failures: IRenderedLockDiff[];
  warnings: IRenderedLockDiff[];
}

export interface IApprovalViolation {
  commitSha: string;
  path: string;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface ILockApprovalResult {
  ok: boolean;
  signedBaseline?: string;
  changedDbFields: Map<string, unknown>;
  violations: IApprovalViolation[];
  reason?: string;
}

export interface ILockApprovalOptions {
  deployBase?: string;
  repoRoot?: string;
  lockPath?: string;
  allowedSignersFile?: string;
  signerUsername?: string;
  githubApiUrl?: string;
}

interface IRenderedPage {
  status: number;
  html: string;
}

interface IRunGateOptions {
  deployBase?: string;
  repoRoot?: string;
  lockPath?: string;
  baseUrl?: string;
}

const DEFAULT_SIGNER_USERNAME = 'jonit-dev';
const DEFAULT_GITHUB_API_URL = 'https://api.github.com/users/jonit-dev/ssh_signing_keys';

function formatValue(value: unknown): string {
  return JSON.stringify(value);
}

export function formatLockDiffs(diffs: IRenderedLockDiff[]): string {
  return diffs
    .map(
      diff =>
        `${diff.url} | ${diff.field} | locked=${formatValue(diff.expected)} | rendered=${formatValue(diff.actual)}`
    )
    .join('\n');
}

export async function checkRenderedLocks(
  lock: ISeoLock,
  fetchPage: (path: string) => Promise<IRenderedPage>,
  approvedDbFields: Map<string, unknown> = new Map()
): Promise<IRenderGateResult> {
  const failures: IRenderedLockDiff[] = [];
  const warnings: IRenderedLockDiff[] = [];

  for (const [url, entry] of Object.entries(lock).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    let page: IRenderedPage;
    try {
      page = await fetchPage(url);
    } catch (error) {
      failures.push({
        url,
        field: 'status' as TSeoLockField,
        expected: '2xx response',
        actual: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (page.status < 200 || page.status >= 300) {
      failures.push({
        url,
        field: 'status' as TSeoLockField,
        expected: '2xx response',
        actual: page.status,
      });
      continue;
    }

    let rendered;
    try {
      rendered = await extractSeoFields(page.html);
    } catch (error) {
      failures.push({
        url,
        field: 'status' as TSeoLockField,
        expected: 'extractable HTML',
        actual: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    for (const diff of diffLock(entry, rendered)) {
      const result = { url, ...diff };
      if (entry.source === 'db' && approvedDbFields.has(`${url}:${diff.field}`) && JSON.stringify(approvedDbFields.get(`${url}:${diff.field}`)) === JSON.stringify(diff.actual)) {
        warnings.push(result);
      } else {
        failures.push(result);
      }
    }
  }

  return { ok: failures.length === 0, failures, warnings };
}

function runGit(
  repoRoot: string,
  args: string[],
  options: { allowFailure?: boolean } = {}
): string {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', options.allowFailure ? 'ignore' : 'pipe'],
    }).trim();
  } catch (error) {
    if (options.allowFailure) return '';
    throw error;
  }
}

function lockRelativePath(repoRoot: string, lockPath: string): string {
  return relative(repoRoot, lockPath).replaceAll('\\', '/');
}

function readLockAtCommit(repoRoot: string, commitSha: string, lockPath: string): ISeoLock {
  const relativePath = lockRelativePath(repoRoot, lockPath);
  const content = runGit(repoRoot, ['show', `${commitSha}:${relativePath}`], {
    allowFailure: true,
  });
  if (!content) return {};
  return JSON.parse(content) as ISeoLock;
}

function commitParent(repoRoot: string, commitSha: string): string | null {
  const parent = runGit(repoRoot, ['rev-parse', `${commitSha}^`], { allowFailure: true });
  return parent || null;
}

export function verifySshCommit(repoRoot: string, commitSha: string, allowedSignersFile: string): boolean {
  try {
    const commit = runGit(repoRoot, ['cat-file', 'commit', commitSha]);
    const signatures = commit.split('\n\n', 1)[0].split('\n')
      .filter(line => /^gpgsig(?:-sha256)? /.test(line));
    if (signatures.length !== 1 || signatures[0] !== 'gpgsig -----BEGIN SSH SIGNATURE-----') return false;
    execFileSync(
      'git',
      ['-c', `gpg.ssh.allowedSignersFile=${allowedSignersFile}`, 'verify-commit', commitSha],
      { cwd: repoRoot, stdio: 'ignore' }
    );
    return true;
  } catch {
    return false;
  }
}

function lockDiffsBetween(oldLock: ISeoLock, newLock: ISeoLock): IApprovalViolation[] {
  const violations: IApprovalViolation[] = [];
  for (const path of Object.keys(oldLock).sort()) {
    const oldEntry = oldLock[path];
    const newEntry = newLock[path];
    if (!newEntry) {
      violations.push({
        commitSha: '',
        path,
        field: 'entry',
        expected: oldEntry,
        actual: undefined,
      });
      continue;
    }

    for (const diff of diffLock(oldEntry, newEntry)) {
      violations.push({
        commitSha: '',
        path,
        field: diff.field,
        expected: diff.expected,
        actual: diff.actual,
      });
    }

    for (const field of new Set([...Object.keys(oldEntry), ...Object.keys(newEntry)])) {
      if (SEO_LOCK_FIELDS.some(lockedField => lockedField === field)) continue;
      const expected = oldEntry[field as keyof typeof oldEntry];
      const actual = newEntry[field as keyof typeof newEntry];
      if (!isDeepStrictEqual(expected, actual)) {
        violations.push({ commitSha: '', path, field, expected, actual });
      }
    }
  }
  return violations;
}

function changedFields(oldLock: ISeoLock, newLock: ISeoLock): Map<string, unknown> {
  const result = new Map<string, unknown>();
  for (const path of Object.keys(newLock)) {
    const oldEntry = oldLock[path];
    const newEntry = newLock[path];
    if (!oldEntry) continue;
    for (const diff of diffLock(oldEntry, newEntry)) result.set(`${path}:${diff.field}`, diff.expected);
  }
  return result;
}

export async function fetchAllowedSigners(
  username: string,
  apiUrl: string
): Promise<{ content: string; tempDir: string }> {
  const response = await fetch(apiUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'myimageupscaler-seo-lock-gate',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub SSH signing-key lookup failed (${response.status})`);
  }

  const keys = (await response.json()) as Array<{ key?: unknown }>;
  const signerLines = keys
    .map(item => (typeof item.key === 'string' ? item.key.trim() : ''))
    .filter(Boolean)
    .map(key => `${username} ${key}`);
  if (signerLines.length === 0) {
    throw new Error(`GitHub returned no SSH signing keys for ${username}`);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'seo-lock-signers-'));
  return { content: `${signerLines.join('\n')}\n`, tempDir };
}

export async function checkLockApproval(
  options: ILockApprovalOptions = {}
): Promise<ILockApprovalResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const lockPath = options.lockPath ?? join(repoRoot, 'content/seo-lock.json');
  const relativePath = lockRelativePath(repoRoot, lockPath);
  const changedDbFields = new Map<string, unknown>();
  let temporarySignerDir: string | undefined;
  let allowedSignersFile = options.allowedSignersFile;

  try {
    if (!allowedSignersFile) {
      const signerFile = await fetchAllowedSigners(
        options.signerUsername ?? DEFAULT_SIGNER_USERNAME,
        options.githubApiUrl ?? DEFAULT_GITHUB_API_URL
      );
      temporarySignerDir = signerFile.tempDir;
      allowedSignersFile = join(temporarySignerDir, 'allowed_signers');
      writeFileSync(allowedSignersFile, signerFile.content);
    }

    const history = runGit(repoRoot, ['log', '--format=%H', '--', relativePath], {
      allowFailure: true,
    })
      .split('\n')
      .filter(Boolean);
    if (history.length === 0) {
      return {
        ok: false,
        changedDbFields,
        violations: [],
        reason: `No git history found for ${relativePath}`,
      };
    }

    const signedBaseline = history.find(commitSha =>
      verifySshCommit(repoRoot, commitSha, allowedSignersFile!)
    );
    if (!signedBaseline) {
      return {
        ok: false,
        changedDbFields,
        violations: [],
        reason: `No SSH-signed approval commit found for ${relativePath}`,
      };
    }

    const approvedLock = readLockAtCommit(repoRoot, signedBaseline, lockPath);
    const baselineParent = commitParent(repoRoot, signedBaseline);
    const parentLock = baselineParent ? readLockAtCommit(repoRoot, baselineParent, lockPath) : {};
    for (const [path, entry] of Object.entries(approvedLock)) {
      if (!parentLock[path] || diffLock(parentLock[path], entry).length === 0) continue;
      const previousSigned = history.slice(history.indexOf(signedBaseline) + 1)
        .find(commitSha => verifySshCommit(repoRoot, commitSha, allowedSignersFile!));
      if (!hasValidSeoChangeMetadata(entry.change) || !previousSigned || entry.change?.previousLockCommit !== previousSigned) {
        return { ok: false, signedBaseline, changedDbFields, violations: [],
          reason: `Signed value change at ${path} requires valid evaluation metadata referencing the previous SSH-signed lock commit` };
      }
    }

    if (options.deployBase) {
      const deployBase = runGit(repoRoot, ['rev-parse', '--verify', '--end-of-options', `${options.deployBase}^{commit}`]);
      execFileSync('git', ['merge-base', '--is-ancestor', deployBase, 'HEAD'], { cwd: repoRoot, stdio: 'ignore' });
      const deploymentCommits = runGit(repoRoot, ['rev-list', `${deployBase}..HEAD`]).split('\n');
      if (deploymentCommits.includes(signedBaseline)) {
        changedFields(readLockAtCommit(repoRoot, deployBase, lockPath), readLockAtCommit(repoRoot, signedBaseline, lockPath))
          .forEach((value, field) => changedDbFields.set(field, value));
      }
    }

    const laterCommits = runGit(
      repoRoot,
      ['log', '--format=%H', `${signedBaseline}..HEAD`, '--', relativePath],
      { allowFailure: true }
    )
      .split('\n')
      .filter(Boolean);
    const violations: IApprovalViolation[] = [];
    for (const commitSha of laterCommits) {
      const parent = commitParent(repoRoot, commitSha);
      if (!parent) continue;
      const commitViolations = lockDiffsBetween(
        readLockAtCommit(repoRoot, parent, lockPath),
        readLockAtCommit(repoRoot, commitSha, lockPath)
      );
      violations.push(...commitViolations.map(violation => ({ ...violation, commitSha })));
    }

    return {
      ok: violations.length === 0,
      signedBaseline,
      changedDbFields,
      violations,
      ...(violations.length
        ? { reason: 'A later unsigned or non-SSH-approved commit changed an existing lock value' }
        : {}),
    };
  } catch (error) {
    return {
      ok: false,
      changedDbFields,
      violations: [],
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (temporarySignerDir) rmSync(temporarySignerDir, { recursive: true, force: true });
  }
}

function formatApprovalResult(result: ILockApprovalResult): string {
  if (result.ok) return `R2 approval passed (signed baseline ${result.signedBaseline})`;
  const violations = result.violations
    .map(
      violation =>
        `${violation.commitSha} | ${violation.path} | ${violation.field} | approved=${formatValue(violation.expected)} | committed=${formatValue(violation.actual)}`
    )
    .join('\n');
  return [`R2 approval failed: ${result.reason ?? 'unknown reason'}`, violations]
    .filter(Boolean)
    .join('\n');
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, 'localhost', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

export async function waitForServer(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'server did not respond';
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/`, { redirect: 'manual', signal: AbortSignal.timeout(1000) });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for next start at ${baseUrl}: ${lastError}`);
}

async function runRenderGate(
  lock: ISeoLock,
  options: { repoRoot: string; baseUrl?: string; approvedDbFields: Map<string, unknown> }
): Promise<IRenderGateResult> {
  if (Object.keys(lock).length === 0) return { ok: true, failures: [], warnings: [] };

  if (options.baseUrl) {
    return checkRenderedLocks(
      lock,
      async path => {
        const response = await fetch(new URL(path, `${options.baseUrl.replace(/\/$/, '')}/`), {
          redirect: 'manual',
          signal: AbortSignal.timeout(15000),
        });
        return { status: response.status, html: await response.text() };
      },
      options.approvedDbFields
    );
  }

  const port = await findFreePort();
  const baseUrl = `http://localhost:${port}`;
  const child = spawn(process.execPath, [join(options.repoRoot, 'node_modules/next/dist/bin/next'), 'start', '--hostname', 'localhost', '--port', String(port)], {
    cwd: options.repoRoot,
    stdio: 'inherit',
  });

  try {
    await waitForServer(baseUrl);
    return await checkRenderedLocks(
      lock,
      async path => {
        const response = await fetch(new URL(path, `${baseUrl}/`), { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        return { status: response.status, html: await response.text() };
      },
      options.approvedDbFields
    );
  } finally {
    child.kill('SIGTERM');
  }
}

export async function runSeoLockGate(options: IRunGateOptions = {}): Promise<{
  approval: ILockApprovalResult;
  render: IRenderGateResult;
}> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const lockPath = options.lockPath ?? join(repoRoot, 'content/seo-lock.json');
  const signedLock = JSON.parse(readFileSync(lockPath, 'utf8')) as ISeoLock;
  const { loadAutoSeoLocks } = await import('@server/services/seo-lock.service');
  const lock = await loadEffectiveLock(signedLock, loadAutoSeoLocks);
  const approval = await checkLockApproval({ repoRoot, lockPath, deployBase: options.deployBase });
  const render = await runRenderGate(lock, {
    repoRoot,
    baseUrl: options.baseUrl,
    approvedDbFields: approval.ok ? approval.changedDbFields : new Map(),
  });
  return { approval, render };
}

async function main(): Promise<void> {
  const baseUrl = process.argv
    .find(arg => arg.startsWith('--base-url='))
    ?.slice('--base-url='.length);
  const deployBase = process.argv.find(arg => arg.startsWith('--deploy-base='))?.slice('--deploy-base='.length);
  const result = await runSeoLockGate({ baseUrl, deployBase });

  console.log(result.render.ok ? 'R1 render passed' : 'R1 render failed');
  if (result.render.failures.length) console.error(formatLockDiffs(result.render.failures));
  if (result.render.warnings.length) {
    console.warn(
      `R1 render warnings (approved DB changes pending apply):\n${formatLockDiffs(result.render.warnings)}`
    );
  }
  console.log(formatApprovalResult(result.approval));

  if (!result.render.ok || !result.approval.ok) process.exitCode = 1;
}

if (process.argv[1]?.endsWith('seo-lock-gate.ts')) {
  main().catch(error => {
    console.error(
      `SEO lock gate failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
