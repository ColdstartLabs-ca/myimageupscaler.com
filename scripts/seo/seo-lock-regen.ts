import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractSeoFields,
  normalizeSeoPath,
  type ISeoLock,
  type ISeoLockFields,
} from '@lib/seo/seo-lock';

export interface IGscPageRow {
  page?: string;
  url?: string;
  clicks?: number;
}

export interface ILockRegenOptions {
  threshold?: number;
  siteUrl?: string;
}

interface IRenderedPage {
  status: number;
  html: string;
}

const DEFAULT_SITE = 'myimageupscaler.com';
const DEFAULT_OUTPUT = 'content/seo-lock.json';
const GSC_FETCHER = '.claude/skills/gsc-analysis/scripts/gsc-fetch.cjs';

function isDbPath(path: string): boolean {
  return /(^|\/)blog\//.test(path);
}

export function selectLockRows(
  rows: IGscPageRow[],
  threshold = 20,
  siteUrl = `https://${DEFAULT_SITE}`
): Array<{ path: string; clicks28d: number }> {
  const clicksByPath = new Map<string, number>();
  for (const row of rows) {
    const rawPath = row.page ?? row.url;
    if (!rawPath) continue;
    const clicks = Number(row.clicks ?? 0);
    if (!Number.isFinite(clicks)) continue;
    const path = normalizeSeoPath(rawPath, siteUrl);
    clicksByPath.set(path, (clicksByPath.get(path) ?? 0) + clicks);
  }

  return [...clicksByPath.entries()]
    .filter(([, clicks28d]) => clicks28d > threshold)
    .map(([path, clicks28d]) => ({ path, clicks28d }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

export async function buildSeoLock(
  rows: IGscPageRow[],
  fetchPage: (path: string) => Promise<IRenderedPage>,
  options: ILockRegenOptions = {}
): Promise<ISeoLock> {
  const selectedRows = selectLockRows(
    rows,
    options.threshold ?? 20,
    options.siteUrl ?? `https://${DEFAULT_SITE}`
  );
  const entries = await mapWithConcurrency(selectedRows, 8, async ({ path, clicks28d }) => {
    const page = await fetchPage(path);
    if (page.status < 200 || page.status >= 300) {
      throw new Error(`Cannot lock ${path}: rendered response was ${page.status}`);
    }

    const fields: ISeoLockFields = await extractSeoFields(page.html);
    return [
      path,
      {
        ...fields,
        source: isDbPath(path) ? 'db' : 'code',
        clicks28d,
      },
    ] as const;
  });

  return Object.fromEntries(entries) as ISeoLock;
}

export function writeSeoLock(lock: ISeoLock, outputPath = DEFAULT_OUTPUT): void {
  mkdirSync(join(process.cwd(), outputPath, '..'), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(lock, null, 2)}\n`);
}

function parseArg(name: string): string | undefined {
  return process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

function extractRows(gscExport: unknown): IGscPageRow[] {
  if (!gscExport || typeof gscExport !== 'object') return [];
  const value = gscExport as Record<string, unknown>;
  const searchTypes = value.searchTypes as Record<string, unknown> | undefined;
  const web = searchTypes?.web as Record<string, unknown> | undefined;
  const candidates = [web?.pages, value.topPages, value.pages];
  const rows = candidates.find(Array.isArray);
  return Array.isArray(rows) ? (rows as IGscPageRow[]) : [];
}

function fetchGscExport(site: string, outputPath: string, keyPath?: string): void {
  const args = [
    GSC_FETCHER,
    `--site=${site}`,
    '--days=28',
    '--search-types=web',
    '--primary-type=web',
    '--inspect-top-pages=0',
    '--appearance-limit=0',
    `--output=${outputPath}`,
  ];
  if (keyPath) args.push(`--key=${keyPath}`);
  execFileSync(process.execPath, args, { stdio: 'inherit' });
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(baseUrl: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'server did not respond';
  while (Date.now() < deadline) {
    try {
      await fetch(`${baseUrl}/`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for next start at ${baseUrl}: ${lastError}`);
}

async function withRenderedServer<T>(
  baseUrl: string | undefined,
  callback: (fetchPage: (path: string) => Promise<IRenderedPage>) => Promise<T>
): Promise<T> {
  if (baseUrl) {
    return callback(async path => {
      const response = await fetch(new URL(path, `${baseUrl.replace(/\/$/, '')}/`), {
        redirect: 'manual',
      });
      return { status: response.status, html: await response.text() };
    });
  }

  const port = await findFreePort();
  const localBaseUrl = `http://127.0.0.1:${port}`;
  const child = spawn('yarn', ['start'], {
    cwd: process.cwd(),
    env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port) },
    stdio: 'inherit',
  });

  try {
    await waitForServer(localBaseUrl);
    return callback(async path => {
      const response = await fetch(new URL(path, `${localBaseUrl}/`), { redirect: 'manual' });
      return { status: response.status, html: await response.text() };
    });
  } finally {
    child.kill('SIGTERM');
  }
}

async function main(): Promise<void> {
  const gscPath = parseArg('--gsc');
  const outputPath = parseArg('--output') ?? DEFAULT_OUTPUT;
  const site = parseArg('--site') ?? DEFAULT_SITE;
  const baseUrl = parseArg('--base-url') ?? process.env.SEO_LOCK_BASE_URL;
  const threshold = Number(parseArg('--threshold') ?? 20);
  const keyPath = parseArg('--key');
  let temporaryGscPath: string | undefined;

  try {
    const sourcePath = gscPath ?? join(mkdtempSync(join(tmpdir(), 'seo-lock-gsc-')), 'gsc.json');
    if (!gscPath) {
      temporaryGscPath = sourcePath;
      fetchGscExport(site, sourcePath, keyPath);
    }

    const rows = extractRows(JSON.parse(readFileSync(sourcePath, 'utf8')));
    const lock = await withRenderedServer(baseUrl, fetchPage =>
      buildSeoLock(rows, fetchPage, { threshold, siteUrl: `https://${site}` })
    );
    writeSeoLock(lock, outputPath);
    console.log(`Wrote ${Object.keys(lock).length} SEO lock entries to ${outputPath}`);
  } finally {
    if (temporaryGscPath) rmSync(join(temporaryGscPath, '..'), { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('seo-lock-regen.ts')) {
  main().catch(error => {
    console.error(
      `SEO lock regeneration failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
