#!/usr/bin/env tsx
/**
 * PageSpeed Insights check for MyImageUpscaler.
 *
 * Usage:
 *   yarn tsx scripts/seo-pagespeed-check.ts
 *   yarn tsx scripts/seo-pagespeed-check.ts --urls=seo-reports/cwv-urls.txt
 *   yarn tsx scripts/seo-pagespeed-check.ts --url=/pricing --strategy=desktop
 *   yarn tsx scripts/seo-pagespeed-check.ts --budget-lcp=2.5
 *
 * Set PAGESPEED_API_KEY in .env.api for higher API quotas.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { serverEnv } from '../shared/config/env';

const loadedEnv = config({ path: '.env.api' }).parsed || {};

const DEFAULT_BASE_URL = 'https://myimageupscaler.com';
const DEFAULT_URLS_FILE = 'seo-reports/cwv-urls.txt';
const execFileAsync = promisify(execFile);
let useLocalLighthouse = false;
const runtimeConfig = {
  baseUrl: loadedEnv.SITE_URL || serverEnv.NEXT_PUBLIC_BASE_URL || DEFAULT_BASE_URL,
  pageSpeedApiKey: loadedEnv.PAGESPEED_API_KEY || serverEnv.PAGESPEED_API_KEY,
};

interface IPageSpeedResult {
  url: string;
  strategy: 'mobile' | 'desktop';
  fetchedAt: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: {
    lcp: { value: number | null; rating: string };
    fid: { value: number; rating: string };
    cls: { value: number; rating: string };
    inp: { value: number; rating: string } | null;
    fcp: { value: number; rating: string };
    ttfb: { value: number; rating: string };
  };
  lcpElement: string;
  opportunities: Array<{
    id: string;
    title: string;
    savings: string;
  }>;
  diagnostics: Array<{
    id: string;
    title: string;
    description: string;
  }>;
}

interface ILighthouseAudit {
  id: string;
  title: string;
  score?: number | null;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    items?: Array<Record<string, unknown>>;
  };
  numericValue?: number;
  displayValue?: string;
}

interface ILighthousePayload {
  categories: Record<string, { score?: number }>;
  audits: Record<string, ILighthouseAudit>;
}

interface IPageSpeedPayload {
  lighthouseResult: ILighthousePayload;
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
}

interface IArgs {
  urls: string[];
  urlsFile?: string;
  strategy: 'mobile' | 'desktop' | 'both';
  baseUrl: string;
  budgetLcpSeconds?: number;
  outputMarkdown: string;
  outputJson: string;
}

function readUrlList(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`URL list not found: ${filePath}`);
  }

  const urls = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.replace(/#.*/, '').trim())
    .filter(Boolean);

  if (urls.length === 0) {
    throw new Error(`URL list is empty: ${filePath}`);
  }

  return urls;
}

function parseArgs(): IArgs {
  const args = process.argv.slice(2);
  const dateStr = new Date().toISOString().split('T')[0];
  let explicitUrl: string | undefined;
  let urlsFile: string | undefined;
  let strategy: IArgs['strategy'] = 'both';
  let baseUrl = runtimeConfig.baseUrl;
  let budgetLcpSeconds: number | undefined;
  let outputMarkdown = `seo-reports/cwv-${dateStr}.md`;
  let outputJson = `seo-reports/cwv-${dateStr}.json`;

  for (const arg of args) {
    if (arg.startsWith('--url=')) {
      explicitUrl = arg.slice('--url='.length);
    } else if (arg.startsWith('--urls=')) {
      urlsFile = arg.slice('--urls='.length);
    } else if (arg.startsWith('--strategy=')) {
      const value = arg.slice('--strategy='.length);
      if (value !== 'mobile' && value !== 'desktop' && value !== 'both') {
        throw new Error(`Invalid strategy: ${value}`);
      }
      strategy = value;
    } else if (arg.startsWith('--base-url=')) {
      baseUrl = arg.slice('--base-url='.length);
    } else if (arg.startsWith('--budget-lcp=')) {
      const value = Number(arg.slice('--budget-lcp='.length));
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Invalid LCP budget: ${arg}`);
      }
      budgetLcpSeconds = value;
    } else if (arg.startsWith('--output=')) {
      outputMarkdown = arg.slice('--output='.length);
      outputJson = outputMarkdown.replace(/\.md$/, '.json');
    } else if (arg.startsWith('--output-markdown=')) {
      outputMarkdown = arg.slice('--output-markdown='.length);
    } else if (arg.startsWith('--output-json=')) {
      outputJson = arg.slice('--output-json='.length);
    }
  }

  if (!baseUrl) {
    throw new Error('Base URL is required through --base-url or SITE_URL');
  }

  const urls = explicitUrl ? [explicitUrl] : readUrlList(urlsFile || DEFAULT_URLS_FILE);
  return {
    urls,
    urlsFile: explicitUrl ? undefined : urlsFile || DEFAULT_URLS_FILE,
    strategy,
    baseUrl: baseUrl.replace(/\/$/, ''),
    budgetLcpSeconds,
    outputMarkdown,
    outputJson,
  };
}

function getRating(value: number, metric: string): string {
  const thresholds: Record<string, { good: number; poor: number }> = {
    lcp: { good: 2500, poor: 4000 },
    fid: { good: 100, poor: 300 },
    cls: { good: 0.1, poor: 0.25 },
    inp: { good: 200, poor: 500 },
    fcp: { good: 1800, poor: 3000 },
    ttfb: { good: 800, poor: 1800 },
  };

  const threshold = thresholds[metric];
  if (!threshold) return 'unknown';
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

function getRatingEmoji(rating: string): string {
  return rating === 'good'
    ? '🟢'
    : rating === 'needs-improvement'
      ? '🟡'
      : rating === 'unknown'
        ? '⚪'
        : '🔴';
}

function getScoreEmoji(score: number): string {
  return score >= 90 ? '🟢' : score >= 50 ? '🟡' : '🔴';
}

function getLcpElement(audit?: ILighthouseAudit): string {
  const findNode = (item: Record<string, unknown>): string | null => {
    const node = item.element ?? item.node;
    if (typeof node === 'string') return node;
    if (node && typeof node === 'object') {
      const nodeRecord = node as Record<string, unknown>;
      for (const key of ['snippet', 'selector', 'nodeLabel', 'path']) {
        if (typeof nodeRecord[key] === 'string' && nodeRecord[key]) {
          return nodeRecord[key] as string;
        }
      }
    }

    const nestedItems = item.items;
    if (Array.isArray(nestedItems)) {
      for (const nestedItem of nestedItems) {
        if (nestedItem && typeof nestedItem === 'object') {
          const result = findNode(nestedItem as Record<string, unknown>);
          if (result) return result;
        }
      }
    }

    return null;
  };

  for (const item of audit?.details?.items || []) {
    const result = findNode(item);
    if (result) return result;
  }

  return 'Unavailable';
}

function getFullUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${baseUrl}/${url.replace(/^\//, '')}`;
}

function resolveChromePath(): string | undefined {
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];

  if (os.platform() === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const playwrightCache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(playwrightCache)) return undefined;

  const browserDirectories = fs
    .readdirSync(playwrightCache, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map(entry => entry.name)
    .sort()
    .reverse();

  for (const browserDirectory of browserDirectories) {
    const browserRoot = path.join(playwrightCache, browserDirectory);
    const browserCandidates =
      os.platform() === 'darwin'
        ? [path.join(browserRoot, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]
        : [
            path.join(browserRoot, 'chrome-linux64', 'chrome'),
            path.join(browserRoot, 'chrome-linux', 'chrome'),
          ];

    for (const candidate of browserCandidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

export function createPageSpeedResult(
  url: string,
  strategy: 'mobile' | 'desktop',
  data: IPageSpeedPayload
): IPageSpeedResult {
  const lighthouse = data.lighthouseResult;
  const audits = lighthouse.audits || {};
  const metrics = data.loadingExperience?.metrics || {};

  const rawLcpValue = audits['largest-contentful-paint']?.numericValue;
  const lcpValue =
    typeof rawLcpValue === 'number' && Number.isFinite(rawLcpValue) ? rawLcpValue : null;
  const clsValue =
    (metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? 0) / 100 ||
    audits['cumulative-layout-shift']?.numericValue ||
    0;
  const fidValue = metrics.FIRST_INPUT_DELAY_MS?.percentile || 0;
  const inpValue =
    metrics.INTERACTION_TO_NEXT_PAINT?.percentile ??
    audits['interaction-to-next-paint']?.numericValue ??
    null;
  const fcpValue = audits['first-contentful-paint']?.numericValue || 0;
  const ttfbValue = audits['server-response-time']?.numericValue || 0;

  const opportunities = Object.values(audits)
    .filter(
      audit =>
        audit.details?.type === 'opportunity' &&
        audit.details.overallSavingsMs !== undefined &&
        audit.details.overallSavingsMs > 0
    )
    .map(audit => ({
      id: audit.id,
      title: audit.title,
      savings: `${((audit.details?.overallSavingsMs ?? 0) / 1000).toFixed(1)}s`,
    }))
    .sort((a, b) => parseFloat(b.savings) - parseFloat(a.savings))
    .slice(0, 5);

  const diagnosticIds = [
    'dom-size',
    'render-blocking-resources',
    'unused-javascript',
    'unused-css-rules',
    'modern-image-formats',
    'uses-responsive-images',
  ];
  const diagnostics = diagnosticIds
    .map(id => audits[id])
    .filter((audit): audit is ILighthouseAudit =>
      Boolean(audit && audit.score !== null && audit.score < 1)
    )
    .map(audit => ({
      id: audit.id,
      title: audit.title,
      description: audit.displayValue || '',
    }));

  return {
    url,
    strategy,
    fetchedAt: new Date().toISOString(),
    scores: {
      performance: Math.round((lighthouse.categories.performance?.score || 0) * 100),
      accessibility: Math.round((lighthouse.categories.accessibility?.score || 0) * 100),
      bestPractices: Math.round((lighthouse.categories['best-practices']?.score || 0) * 100),
      seo: Math.round((lighthouse.categories.seo?.score || 0) * 100),
    },
    coreWebVitals: {
      lcp: {
        value: lcpValue,
        rating: lcpValue === null ? 'unknown' : getRating(lcpValue, 'lcp'),
      },
      fid: { value: fidValue, rating: getRating(fidValue, 'fid') },
      cls: { value: clsValue, rating: getRating(clsValue, 'cls') },
      inp: inpValue ? { value: inpValue, rating: getRating(inpValue, 'inp') } : null,
      fcp: { value: fcpValue, rating: getRating(fcpValue, 'fcp') },
      ttfb: { value: ttfbValue, rating: getRating(ttfbValue, 'ttfb') },
    },
    lcpElement: getLcpElement(audits['largest-contentful-paint-element']),
    opportunities,
    diagnostics,
  };
}

export interface IPageSpeedGateResult {
  unknownLcpResults: IPageSpeedResult[];
  budgetFailures: IPageSpeedResult[];
  exitCode: 0 | 1;
}

export function evaluatePageSpeedGate(
  results: IPageSpeedResult[],
  failedRequests: string[],
  expectedResults: number,
  budgetLcpSeconds?: number
): IPageSpeedGateResult {
  const unknownLcpResults = results.filter(result => result.coreWebVitals.lcp.value === null);
  const budgetFailures =
    budgetLcpSeconds === undefined
      ? []
      : results.filter(
          result =>
            result.strategy === 'mobile' &&
            (result.coreWebVitals.lcp.value === null ||
              result.coreWebVitals.lcp.value > budgetLcpSeconds * 1000)
        );
  const exitCode: 0 | 1 =
    failedRequests.length > 0 ||
    results.length !== expectedResults ||
    unknownLcpResults.length > 0 ||
    budgetFailures.length > 0
      ? 1
      : 0;

  return { unknownLcpResults, budgetFailures, exitCode };
}

async function fetchLocalLighthouse(
  url: string,
  strategy: 'mobile' | 'desktop'
): Promise<IPageSpeedResult | null> {
  const outputDir = fs.mkdtempSync(path.join('/tmp', 'miu-lighthouse-'));
  const outputPath = path.join(outputDir, 'report.json');
  const chromePath = resolveChromePath();
  const chromeFlags = '--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage';
  const lighthouseArgs = [
    'lighthouse',
    url,
    '--output=json',
    `--output-path=${outputPath}`,
    `--chrome-flags=${chromeFlags}`,
    '--only-categories=performance,seo,accessibility,best-practices',
    '--quiet',
  ];

  if (strategy === 'desktop') {
    lighthouseArgs.push(
      '--form-factor=desktop',
      '--screenEmulation.disabled',
      '--throttling.cpuSlowdownMultiplier=1'
    );
  } else {
    lighthouseArgs.push('--form-factor=mobile');
  }

  try {
    const command = chromePath ? 'env' : 'npx';
    const commandArgs = chromePath
      ? [`CHROME_PATH=${chromePath}`, 'npx', ...lighthouseArgs]
      : lighthouseArgs;
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      maxBuffer: 50 * 1024 * 1024,
    });
    if (stderr.trim()) console.error(stderr.trim());
    const report = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as
      | IPageSpeedPayload
      | (ILighthousePayload & { loadingExperience?: IPageSpeedPayload['loadingExperience'] });
    const data: IPageSpeedPayload =
      'lighthouseResult' in report
        ? report
        : { lighthouseResult: report, loadingExperience: report.loadingExperience };
    return createPageSpeedResult(url, strategy, data);
  } catch (error) {
    console.error(
      `Local Lighthouse failed for ${url} (${strategy}): ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return null;
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
}

async function fetchPageSpeed(
  url: string,
  strategy: 'mobile' | 'desktop'
): Promise<IPageSpeedResult | null> {
  if (useLocalLighthouse) return fetchLocalLighthouse(url, strategy);

  const apiKey = runtimeConfig.pageSpeedApiKey;
  const encodedUrl = encodeURIComponent(url);
  let apiUrl =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}` +
    `&strategy=${strategy}&category=performance&category=accessibility` +
    '&category=best-practices&category=seo';

  if (apiKey) apiUrl += `&key=${apiKey}`;

  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      const body = await response.text();
      let message = response.statusText;
      try {
        message = (JSON.parse(body) as { error?: { message?: string } }).error?.message || message;
      } catch {
        // Keep the HTTP status text when the API does not return JSON.
      }
      console.error(`API Error for ${url} (${strategy}): ${message}`);
      if (/quota exceeded/i.test(message)) {
        useLocalLighthouse = true;
        console.log('PageSpeed API quota is unavailable; falling back to local Lighthouse.');
        return fetchLocalLighthouse(url, strategy);
      }
      return null;
    }

    const data = (await response.json()) as IPageSpeedPayload;
    return createPageSpeedResult(url, strategy, data);
  } catch (error) {
    console.error(
      `Failed to fetch PageSpeed data for ${url} (${strategy}): ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
    return null;
  }
}

function printResult(result: IPageSpeedResult): void {
  const cwv = result.coreWebVitals;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${result.strategy.toUpperCase()} — ${result.url}`);
  console.log(`${'═'.repeat(60)}\n`);
  const lcpDisplay =
    cwv.lcp.value === null
      ? 'unknown (measurement unavailable)'
      : `${(cwv.lcp.value / 1000).toFixed(2)}s`;
  console.log(
    `${getScoreEmoji(result.scores.performance)} Performance ${result.scores.performance} | ` +
      `${getRatingEmoji(cwv.lcp.rating)} LCP ${lcpDisplay} | ` +
      `${getRatingEmoji(cwv.cls.rating)} CLS ${cwv.cls.value.toFixed(3)}`
  );
  console.log(`LCP element: ${result.lcpElement}`);
  console.log(`INP: ${cwv.inp ? `${cwv.inp.value}ms (${cwv.inp.rating})` : 'unavailable'}`);
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function createMarkdownReport(
  args: IArgs,
  results: IPageSpeedResult[],
  failedRequests: string[]
): string {
  const budgetLine =
    args.budgetLcpSeconds === undefined
      ? 'No LCP budget configured.'
      : `Mobile LCP budget: ${args.budgetLcpSeconds.toFixed(1)}s.`;
  const rows = results
    .map(result => {
      const cwv = result.coreWebVitals;
      const lcpDisplay =
        cwv.lcp.value === null
          ? 'unknown (measurement unavailable)'
          : `${(cwv.lcp.value / 1000).toFixed(2)}s (${cwv.lcp.rating})`;
      return `| ${escapeMarkdown(result.url)} | ${result.strategy} | ${lcpDisplay} | ${cwv.inp ? `${cwv.inp.value}ms` : 'n/a'} | ${cwv.cls.value.toFixed(3)} | ${escapeMarkdown(result.lcpElement)} |`;
    })
    .join('\n');

  return `# PageSpeed Core Web Vitals Report

Generated: ${new Date().toISOString()}

${budgetLine}

| URL | Strategy | LCP | INP | CLS | LCP element |
| --- | --- | --- | --- | --- | --- |
${rows || '| No measurements | — | — | — | — | — |'}

${failedRequests.length > 0 ? `Failed requests:\n\n${failedRequests.map(item => `- ${item}`).join('\n')}` : 'All requested measurements returned successfully.'}
`;
}

function writeReports(args: IArgs, results: IPageSpeedResult[], failedRequests: string[]): void {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: args.baseUrl,
    urls: args.urls,
    urlsFile: args.urlsFile,
    strategy: args.strategy,
    budgetLcpSeconds: args.budgetLcpSeconds,
    failedRequests,
    results,
  };

  fs.mkdirSync(path.dirname(args.outputJson), { recursive: true });
  fs.mkdirSync(path.dirname(args.outputMarkdown), { recursive: true });
  fs.writeFileSync(args.outputJson, JSON.stringify(report, null, 2));
  fs.writeFileSync(args.outputMarkdown, createMarkdownReport(args, results, failedRequests));
  console.log(`\nJSON report: ${args.outputJson}`);
  console.log(`Markdown report: ${args.outputMarkdown}`);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const strategies: Array<'mobile' | 'desktop'> =
    args.strategy === 'both' ? ['mobile', 'desktop'] : [args.strategy];

  console.log('\n🚀 PAGESPEED INSIGHTS CHECK');
  console.log(`URLs: ${args.urls.length} from ${args.urlsFile || 'command line'}`);
  console.log(`Strategies: ${strategies.join(', ')}`);
  console.log(`Base URL: ${args.baseUrl}`);

  if (!runtimeConfig.pageSpeedApiKey) {
    console.log('⚠️  No PAGESPEED_API_KEY set; using the public API quota.');
  }

  const results: IPageSpeedResult[] = [];
  const failedRequests: string[] = [];

  for (const url of args.urls) {
    for (const strategy of strategies) {
      const fullUrl = getFullUrl(args.baseUrl, url);
      console.log(`\nFetching ${strategy}: ${fullUrl}`);
      const result = await fetchPageSpeed(fullUrl, strategy);
      if (result) {
        results.push(result);
        printResult(result);
      } else {
        failedRequests.push(`${strategy} ${fullUrl}`);
      }
    }
  }

  writeReports(args, results, failedRequests);

  const expectedResults = args.urls.length * strategies.length;
  const { unknownLcpResults, budgetFailures, exitCode } = evaluatePageSpeedGate(
    results,
    failedRequests,
    expectedResults,
    args.budgetLcpSeconds
  );

  if (unknownLcpResults.length > 0) {
    console.error('\n❌ LCP measurement unavailable or non-finite:');
    for (const result of unknownLcpResults) {
      console.error(`- ${result.strategy} ${result.url}`);
    }
  }

  if (budgetFailures.length > 0) {
    console.error(`\n❌ Mobile LCP budget check failed (${args.budgetLcpSeconds}s):`);
    for (const result of budgetFailures) {
      const lcpValue = result.coreWebVitals.lcp.value;
      const lcpDisplay =
        lcpValue === null
          ? 'unknown (measurement unavailable)'
          : `${(lcpValue / 1000).toFixed(2)}s`;
      console.error(`- ${result.url}: ${lcpDisplay}`);
    }
  }

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    return;
  }

  console.log('\n✅ PageSpeed check complete; all measurements are within the configured gate.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`❌ ${error instanceof Error ? error.message : 'PageSpeed check failed'}`);
    process.exitCode = 1;
  });
}
