import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { serverEnv } from '@shared/config/env';
import { INTENT_CLUSTERS, type IIntentCluster } from '@/lib/seo/intent-ownership';
import { createGscAccessToken, queryAllSearchAnalyticsRows } from '@/server/services/gsc.service';
import type {
  IGscDateRange,
  IGscSearchAnalyticsRequest,
  IGscSearchAnalyticsRow,
} from '@/server/services/gsc.types';

const ROW_LIMIT = 25000;
const DEFAULT_OUTPUT_DIRECTORY = 'seo-reports';

export interface IClusterMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface IClusterMeasurement {
  range: IGscDateRange;
  matchedRows: number;
  owner: IClusterMetrics;
  cluster: IClusterMetrics;
  byPath: Record<string, IClusterMetrics>;
}

export interface IMeasureClusterArgs {
  clusterName: string;
  window: IGscDateRange;
  baseline: IGscDateRange;
  outputPath?: string;
}

export interface IClusterGateResult {
  exitCode: 0 | 1;
  message: string;
}

export type ClusterMeasurementScope = 'post-consolidation' | 'pre-split-baseline';

export function normalizePagePath(pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    const pathname = url.pathname.replace(/\/$/, '');
    return pathname || '/';
  } catch {
    const pathname = pageUrl.split(/[?#]/, 1)[0];
    return pathname === '/' ? pathname : pathname.replace(/\/$/, '');
  }
}

export function parseDateRange(value: string, flagName: string): IGscDateRange {
  const [startDate, endDate, ...extra] = value.split(':');
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (
    extra.length > 0 ||
    !datePattern.test(startDate ?? '') ||
    !datePattern.test(endDate ?? '') ||
    startDate > endDate
  ) {
    throw new Error(`--${flagName} must be YYYY-MM-DD:YYYY-MM-DD with start before end`);
  }

  return { startDate, endDate };
}

function emptyMetrics(): IClusterMetrics {
  return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}

function addMetrics(target: IClusterMetrics, row: IGscSearchAnalyticsRow): void {
  target.clicks += row.clicks;
  target.impressions += row.impressions;
  target.position += row.position * row.impressions;
}

function finalizeMetrics(metrics: IClusterMetrics): IClusterMetrics {
  const position = metrics.impressions > 0 ? metrics.position / metrics.impressions : 0;
  const ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;

  return {
    clicks: metrics.clicks,
    impressions: metrics.impressions,
    ctr,
    position,
  };
}

function getPathsForScope(
  cluster: IIntentCluster,
  scope: ClusterMeasurementScope
): readonly string[] {
  if (scope === 'pre-split-baseline') {
    if (!cluster.baselinePaths?.length) {
      throw new Error(`Cluster "${cluster.intent}" is missing pre-split baseline paths`);
    }

    return cluster.baselinePaths;
  }

  return [cluster.ownerPath, ...cluster.memberPaths, ...(cluster.measurementPaths ?? [])];
}

export function summarizeClusterRows(
  cluster: IIntentCluster,
  rows: readonly IGscSearchAnalyticsRow[],
  range: IGscDateRange,
  scope: ClusterMeasurementScope = 'post-consolidation'
): IClusterMeasurement {
  const paths = getPathsForScope(cluster, scope);
  const rawByPath = Object.fromEntries(paths.map(pagePath => [pagePath, emptyMetrics()])) as Record<
    string,
    IClusterMetrics
  >;
  let matchedRows = 0;

  for (const row of rows) {
    const pagePath = normalizePagePath(row.keys[0] ?? '');
    const metrics = rawByPath[pagePath];

    if (!metrics) continue;
    matchedRows += 1;
    addMetrics(metrics, row);
  }

  const byPath = Object.fromEntries(
    paths.map(pagePath => [pagePath, finalizeMetrics(rawByPath[pagePath])])
  ) as Record<string, IClusterMetrics>;
  const clusterMetrics = emptyMetrics();

  for (const pagePath of paths) {
    const pathMetrics = byPath[pagePath];
    clusterMetrics.clicks += pathMetrics.clicks;
    clusterMetrics.impressions += pathMetrics.impressions;
    clusterMetrics.position += pathMetrics.position * pathMetrics.impressions;
  }

  return {
    range,
    matchedRows,
    owner: byPath[cluster.ownerPath],
    cluster: finalizeMetrics(clusterMetrics),
    byPath,
  };
}

export function evaluateClusterGate(
  cluster: IIntentCluster,
  measurement: IClusterMeasurement,
  reportPath: string
): IClusterGateResult {
  const measuredClicks = measurement.cluster.clicks;
  const floor = cluster.baselineContract.minimumClicks;
  const passed = measuredClicks >= floor;
  return {
    exitCode: passed ? 0 : 1,
    message: `Cluster "${cluster.intent}" measured ${formatNumber(measuredClicks)} clicks against the ${formatNumber(floor)}-click floor. Report: ${reportPath}`,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMetrics(metrics: IClusterMetrics): string {
  return `${formatNumber(metrics.clicks)} clicks / ${formatNumber(metrics.impressions)} impressions / ${formatPercent(metrics.ctr)} CTR / ${metrics.position.toFixed(2)} position`;
}

function getInclusiveDayCount(range: IGscDateRange): number {
  const start = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function formatDateRange(range: IGscDateRange): string {
  return `${range.startDate}:${range.endDate}`;
}

function hasSameDateRange(first: IGscDateRange, second: IGscDateRange): boolean {
  return first.startDate === second.startDate && first.endDate === second.endDate;
}

function assertBaselineDateRange(cluster: IIntentCluster, baseline: IGscDateRange): void {
  const contract = cluster.baselineContract;
  const expected = {
    startDate: contract.startDate,
    endDate: contract.endDate,
  };

  if (!hasSameDateRange(baseline, expected)) {
    throw new Error(
      `Baseline range for cluster "${cluster.intent}" must be ${formatDateRange(expected)}; received ${formatDateRange(baseline)}`
    );
  }
}

function renderDeferredCandidates(cluster: IIntentCluster): string {
  if (!cluster.deferredCandidates?.length) return '';

  const rows = cluster.deferredCandidates
    .map(
      candidate =>
        `| \`${candidate.path}\` | ${candidate.primaryKeyword} | Deferred — measurement-only; not a current ${cluster.intent.toUpperCase()} member |`
    )
    .join('\n');

  return `
## Deferred candidates

| URL | Primary keyword | Status |
| --- | --- | --- |
${rows}

Ownership for these candidates is decided only after the exact 28-day Phase 0 gate; no redirect is implied by this measurement entry.
`;
}

export function renderClusterReport(
  cluster: IIntentCluster,
  measurement: IClusterMeasurement,
  baseline: IClusterMeasurement
): string {
  const ownerClicks = measurement.owner.clicks;
  const windowDays = getInclusiveDayCount(measurement.range);
  const baselineDays = getInclusiveDayCount(baseline.range);
  const fixedBaselineClicks = cluster.baselineContract.minimumClicks;
  const baselineClusterClicks = baseline.cluster.clicks;
  const baselineBelowFloor = baselineClusterClicks < fixedBaselineClicks;
  const baselineRangeMatchesContract = hasSameDateRange(baseline.range, {
    startDate: cluster.baselineContract.startDate,
    endDate: cluster.baselineContract.endDate,
  });
  const clusterBelowBaseline = measurement.cluster.clicks < fixedBaselineClicks;
  const ownerBelowBaseline = ownerClicks <= fixedBaselineClicks;
  const decision =
    windowDays < 28
      ? `PENDING — ${windowDays}-day window is provisional; do not use this result as the Phase 0 gate`
      : windowDays !== 28
        ? `NOT ELIGIBLE — measured post-consolidation window is ${windowDays} days; the Phase 0 gate requires exactly 28 inclusive days`
        : baselineDays !== 28
          ? `NOT ELIGIBLE — pre-split baseline window is ${baselineDays} days; the Phase 0 gate requires exactly 28 inclusive days`
          : !baselineRangeMatchesContract
            ? `NOT ELIGIBLE — pre-split baseline range must be ${formatDateRange({ startDate: cluster.baselineContract.startDate, endDate: cluster.baselineContract.endDate })}; received ${formatDateRange(baseline.range)}`
            : baselineBelowFloor
              ? `INVALID BASELINE — supplied pre-split baseline is ${formatNumber(baselineClusterClicks)} clicks, below the fixed ${formatNumber(fixedBaselineClicks)}-click floor; do not use this result as the Phase 0 gate`
              : clusterBelowBaseline
                ? `STOP-LOSS — cluster total ${formatNumber(measurement.cluster.clicks)} is below the fixed ${formatNumber(fixedBaselineClicks)}-click baseline floor; do not add another cluster`
                : ownerClicks >= 700 && !ownerBelowBaseline
                  ? 'PASS — mechanism works'
                  : ownerClicks >= 400
                    ? `PARTIAL — owner is below the fixed ${formatNumber(fixedBaselineClicks)}-click baseline floor; fix owner and re-measure`
                    : 'FAIL — do not replicate';
  const postPaths = getPathsForScope(cluster, 'post-consolidation');
  const baselinePaths = new Set(getPathsForScope(cluster, 'pre-split-baseline'));
  const rows = [...new Set([...postPaths, ...baselinePaths])]
    .map(pagePath => {
      const current = measurement.byPath[pagePath] ?? emptyMetrics();
      const prior = baseline.byPath[pagePath];
      const baselineClicks = prior ? formatNumber(prior.clicks) : '—';
      return `| \`${pagePath}\` | ${formatNumber(current.clicks)} | ${formatNumber(current.impressions)} | ${formatPercent(current.ctr)} | ${current.position.toFixed(2)} | ${baselineClicks} |`;
    })
    .join('\n');

  return `# Cluster Measurement: ${cluster.intent}

Generated: ${new Date().toISOString()}

## Decision gate

Owner clicks in the measured post-consolidation window: **${formatNumber(ownerClicks)}** (${windowDays} days)

**${decision}** (28-day PASS requires owner clicks ≥700 and strictly more than the fixed ${formatNumber(fixedBaselineClicks)}-click pre-split baseline floor; the cluster total must also meet that fixed stop-loss floor. Both windows must be exactly 28 inclusive days.)

The PRD requires a fully post-consolidation 28-day window before this gate is used to add another cluster.

Fixed baseline contract: **${cluster.baselineContract.startDate} through ${cluster.baselineContract.endDate}**, minimum **${formatNumber(fixedBaselineClicks)} clicks**. Supplied baseline metrics cannot lower this gate.

## Windows

| Measure | Start | End | Matched GSC rows | Cluster totals | Owner totals |
| --- | --- | --- | ---: | --- | --- |
| Post-consolidation | ${measurement.range.startDate} | ${measurement.range.endDate} | ${measurement.matchedRows} | ${formatMetrics(measurement.cluster)} | ${formatMetrics(measurement.owner)} |
| Pre-split baseline | ${baseline.range.startDate} | ${baseline.range.endDate} | ${baseline.matchedRows} | ${formatMetrics(baseline.cluster)} | ${formatMetrics(baseline.owner)} |
${renderDeferredCandidates(cluster)}

## URL breakdown

| URL | Current clicks | Current impressions | Current CTR | Current position | Baseline clicks |
| --- | ---: | ---: | ---: | ---: | ---: |
${rows}

Source: Google Search Console Search Analytics API, web search, page dimension. Redirect verification remains a separate live check.
`;
}

function getArgument(name: string): string | undefined {
  return process.argv.find(argument => argument.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function getCluster(name: string): IIntentCluster {
  const cluster = INTENT_CLUSTERS.find(candidate => candidate.intent === name);
  if (!cluster) {
    const available = INTENT_CLUSTERS.map(candidate => candidate.intent).join(', ') || '(none)';
    throw new Error(`Unknown cluster "${name}". Available clusters: ${available}`);
  }
  return cluster;
}

function buildSearchAnalyticsRequest(range: IGscDateRange): IGscSearchAnalyticsRequest {
  return {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['page'],
    aggregationType: 'byPage',
    type: 'web',
    dataState: 'final',
    rowLimit: ROW_LIMIT,
  };
}

async function fetchMeasurement(
  accessToken: string,
  siteUrl: string,
  cluster: IIntentCluster,
  range: IGscDateRange,
  scope: ClusterMeasurementScope
): Promise<IClusterMeasurement> {
  const rows = await queryAllSearchAnalyticsRows(
    accessToken,
    siteUrl,
    buildSearchAnalyticsRequest(range)
  );
  const measurement = summarizeClusterRows(cluster, rows, range, scope);

  if (measurement.matchedRows === 0) {
    throw new Error(
      `No Search Console rows matched cluster "${cluster.intent}" for ${range.startDate}:${range.endDate}`
    );
  }

  return measurement;
}

export async function measureCluster(args: IMeasureClusterArgs): Promise<string> {
  const cluster = getCluster(args.clusterName);
  assertBaselineDateRange(cluster, args.baseline);

  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
    throw new Error('GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY are required');
  }

  const accessToken = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  const [measurement, baseline] = await Promise.all([
    fetchMeasurement(
      accessToken,
      serverEnv.GSC_SITE_URL,
      cluster,
      args.window,
      'post-consolidation'
    ),
    fetchMeasurement(
      accessToken,
      serverEnv.GSC_SITE_URL,
      cluster,
      args.baseline,
      'pre-split-baseline'
    ),
  ]);

  const outputPath =
    args.outputPath ??
    path.join(DEFAULT_OUTPUT_DIRECTORY, `cluster-${cluster.intent}-${args.window.endDate}.md`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const report = renderClusterReport(cluster, measurement, baseline);
  await writeFile(outputPath, report, 'utf8');
  return outputPath;
}

export async function gateCluster(args: IMeasureClusterArgs): Promise<IClusterGateResult> {
  const outputPath = await measureCluster(args);
  const cluster = getCluster(args.clusterName);

  if (!serverEnv.GSC_SERVICE_ACCOUNT_EMAIL || !serverEnv.GSC_PRIVATE_KEY) {
    throw new Error('GSC_SERVICE_ACCOUNT_EMAIL and GSC_PRIVATE_KEY are required');
  }
  const accessToken = await createGscAccessToken(
    serverEnv.GSC_SERVICE_ACCOUNT_EMAIL,
    serverEnv.GSC_PRIVATE_KEY
  );
  const measurement = await fetchMeasurement(
    accessToken,
    serverEnv.GSC_SITE_URL,
    cluster,
    args.window,
    'post-consolidation'
  );
  return evaluateClusterGate(cluster, measurement, outputPath);
}

async function main(): Promise<void> {
  const clusterName = getArgument('cluster');
  const windowValue = getArgument('window');
  const baselineValue = getArgument('baseline');
  const gate = process.argv.includes('--gate');

  if (!clusterName || !windowValue) {
    throw new Error(
      'Usage: yarn seo:measure:cluster --cluster=gif --window=YYYY-MM-DD:YYYY-MM-DD [--baseline=YYYY-MM-DD:YYYY-MM-DD] [--gate] [--out=path]'
    );
  }

  const cluster = getCluster(clusterName);
  const outputPath = getArgument('out');
  const args = {
    clusterName,
    window: parseDateRange(windowValue, 'window'),
    baseline: baselineValue
      ? parseDateRange(baselineValue, 'baseline')
      : {
          startDate: cluster.baselineContract.startDate,
          endDate: cluster.baselineContract.endDate,
        },
    outputPath,
  };

  if (gate) {
    const result = await gateCluster(args);
    console.log(result.message);
    process.exitCode = result.exitCode;
    return;
  }

  const output = await measureCluster(args);

  console.log(`Wrote cluster measurement: ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
