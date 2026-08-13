#!/usr/bin/env tsx

/**
 * GSC Fix Verification Harness
 *
 * Re-fetches the URL lists Google Search Console exported and fails when a URL still violates the
 * issue it was reported for. This is the live gate behind the GSC recovery PRDs
 * (`docs/PRDs/gsc-recovery-2026-08/`) — unit tests cannot prove production stopped 404ing.
 *
 * Usage:
 *   yarn seo:verify:gsc --set=404
 *   yarn seo:verify:gsc --set=404 --base-url=http://localhost:3000
 *   yarn seo:verify:gsc --set=noindex --concurrency=4 --delay=250
 *   yarn seo:verify:gsc --set=404 --expect=404      # negative control: must exit 0 today
 *   yarn seo:verify:gsc --set=cni --limit=50
 *
 * Sets and what counts as a violation:
 *   404     — anything that is not 200 or a single HTTP 301 to a live 200 page
 *   5xx     — any status >= 500
 *   noindex — URL is noindexed AND still submitted in a sitemap
 *   cni     — same rule as noindex (PRD 03's index-bloat gate)
 *   dup     — locale URL still self-canonical (Google already chose English)
 *
 * Exit code: 0 when every URL passes, 1 otherwise (or on bad arguments).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import dayjs from 'dayjs';
import { clientEnv } from '../../shared/config/env';
import {
  GSC_SETS,
  SETS_REQUIRING_BODY,
  SETS_REQUIRING_SITEMAP,
  SET_CSV_FILES,
  evaluateExpectation,
  extractCanonical,
  extractRobotsMeta,
  extractSitemapLocs,
  parseGscCsv,
  rebaseUrl,
  summarizeByFamily,
  type GscSet,
  type IExpectationResult,
  type IUrlObservation,
} from '../../lib/seo/gsc-verification';

const DATA_DIR = path.join(process.cwd(), 'docs/PRDs/gsc-recovery-2026-08/data');
const REPORT_DIR = path.join(process.cwd(), 'seo-reports');
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECT_HOPS = 4;

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const set = getArg('set') as GscSet | undefined;
if (!set || !GSC_SETS.includes(set)) {
  fail(`--set is required and must be one of: ${GSC_SETS.join(', ')}`);
}

const baseUrl = (getArg('base-url') ?? `https://${clientEnv.PRIMARY_DOMAIN}`).replace(/\/$/, '');
const concurrency = Math.max(1, Number(getArg('concurrency') ?? 4));
const delayMs = Math.max(0, Number(getArg('delay') ?? 250));
const limit = getArg('limit') ? Number(getArg('limit')) : undefined;
const expectStatus = getArg('expect') ? Number(getArg('expect')) : undefined;
const needsBody = SETS_REQUIRING_BODY.includes(set) && expectStatus === undefined;
const needsSitemap = SETS_REQUIRING_SITEMAP.includes(set) && expectStatus === undefined;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, method: 'GET' | 'HEAD'): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'miu-gsc-verify/1.0 (+seo-recovery-prd)' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function observe(url: string, sitemapUrls: Set<string> | null): Promise<IUrlObservation> {
  const startedAt = Date.now();
  const observation: IUrlObservation = { url, status: 0 };
  if (sitemapUrls) {
    observation.inSitemap = sitemapUrls.has(url.replace(/\/$/, ''));
  }

  try {
    let response = await fetchWithTimeout(url, needsBody ? 'GET' : 'HEAD');

    // Some edges reject HEAD outright; fall back rather than reporting a phantom failure.
    if (!needsBody && (response.status === 405 || response.status === 501)) {
      response = await fetchWithTimeout(url, 'GET');
    }

    observation.status = response.status;
    observation.responseTimeMs = Date.now() - startedAt;
    observation.location = response.headers.get('location') ?? undefined;
    observation.xRobotsTag = response.headers.get('x-robots-tag') ?? undefined;

    if (needsBody && response.status === 200) {
      const html = await response.text();
      observation.canonical = extractCanonical(html);
      observation.robots = extractRobotsMeta(html);
    }

    // A 301 to a 404 is not a fix, and a chain is its own defect — resolve the destination.
    if (observation.location) {
      let current = new URL(observation.location, url).toString();
      let hops = 0;
      while (hops < MAX_REDIRECT_HOPS) {
        hops += 1;
        const hop = await fetchWithTimeout(current, 'HEAD');
        const next = hop.headers.get('location');
        if (!next) {
          observation.finalStatus = hop.status;
          break;
        }
        current = new URL(next, current).toString();
        await sleep(delayMs);
      }
      observation.finalUrl = current;
      observation.redirectHops = hops;
    }
  } catch (error) {
    observation.error = error instanceof Error ? error.message : String(error);
    observation.responseTimeMs = Date.now() - startedAt;
  }

  return observation;
}

/** Walk /sitemap.xml (index + children) and return every submitted URL. */
async function collectSitemapUrls(): Promise<Set<string>> {
  const collected = new Set<string>();
  const indexResponse = await fetchWithTimeout(`${baseUrl}/sitemap.xml`, 'GET');
  if (!indexResponse.ok) {
    fail(`could not read ${baseUrl}/sitemap.xml (status ${indexResponse.status})`);
  }

  const locs = extractSitemapLocs(await indexResponse.text());
  const children = locs.filter(loc => loc.includes('sitemap'));
  const direct = locs.filter(loc => !loc.includes('sitemap'));
  direct.forEach(loc => collected.add(loc.replace(/\/$/, '')));

  for (const child of children) {
    try {
      const childResponse = await fetchWithTimeout(rebaseUrl(child, baseUrl), 'GET');
      if (!childResponse.ok) continue;
      extractSitemapLocs(await childResponse.text()).forEach(loc =>
        collected.add(loc.replace(/\/$/, ''))
      );
    } catch {
      // A single unreachable child sitemap must not silently shrink the submitted set.
      console.warn(`  ! could not read child sitemap ${child}`);
    }
    await sleep(delayMs);
  }

  if (collected.size === 0) {
    fail('sitemap walk produced 0 URLs — refusing to evaluate membership against an empty set');
  }
  return collected;
}

async function main(): Promise<void> {
  const csvPath = path.join(DATA_DIR, SET_CSV_FILES[set]);
  if (!existsSync(csvPath)) fail(`missing GSC export: ${csvPath}`);

  const urls = parseGscCsv(readFileSync(csvPath, 'utf8'))
    .map(url => rebaseUrl(url, baseUrl))
    .slice(0, limit);

  if (urls.length === 0) fail(`no URLs parsed from ${csvPath}`);

  console.log(`GSC verify — set=${set}  urls=${urls.length}  base=${baseUrl}`);
  if (expectStatus !== undefined)
    console.log(`  negative control: expecting status ${expectStatus}`);

  const sitemapUrls = needsSitemap ? await collectSitemapUrls() : null;
  if (sitemapUrls) console.log(`  sitemap URLs collected: ${sitemapUrls.size}`);

  const results: Array<{ observation: IUrlObservation; expectation: IExpectationResult }> = [];
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const observation = await observe(url, sitemapUrls);
      results.push({
        observation,
        expectation: evaluateExpectation(set, observation, expectStatus),
      });
      if (results.length % 25 === 0) {
        console.log(`  … ${results.length}/${urls.length}`);
      }
      await sleep(delayMs);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));

  const violations = results.filter(result => !result.expectation.ok);
  const summaries = summarizeByFamily(results);

  console.log('\nBy URL family:');
  for (const summary of summaries) {
    const marker = summary.violations > 0 ? '✖' : '✓';
    console.log(
      `  ${marker} ${summary.family.padEnd(24)} ${summary.violations}/${summary.total} violating`
    );
    for (const example of summary.examples) {
      console.log(`      ${example.url} — ${example.reason}`);
    }
  }

  const reportPath = path.join(
    REPORT_DIR,
    `gsc-verify-${set}-${dayjs().format('YYYY-MM-DD')}.json`
  );
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        set,
        baseUrl,
        expectStatus: expectStatus ?? null,
        generatedAt: dayjs().toISOString(),
        totals: { checked: results.length, violations: violations.length },
        summaries,
        results,
      },
      null,
      2
    )
  );

  console.log(`\n${violations.length}/${results.length} URLs violate the "${set}" expectation`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  process.exit(violations.length > 0 ? 1 : 0);
}

void main().catch(error => fail(error instanceof Error ? error.message : String(error)));
