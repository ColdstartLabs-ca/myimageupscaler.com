#!/usr/bin/env tsx

/**
 * Publication guard for new pSEO rows.
 *
 * Existing pages may be maintained while the site recovers. New matrix rows
 * are blocked when the latest measured sitemap indexation rate is below 85%.
 * Both the report and the committed snapshot must be refreshed within 35 days.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const INDEXATION_THRESHOLD = 85;
export const MAX_EVIDENCE_AGE_DAYS = 35;
export const DEFAULT_INDEXATION_GATE_BASE_REF = 'HEAD^';

export interface IIndexationGateEvidence {
  reportPath: string;
  reportDate: string;
  indexationRate: number;
  snapshotPath: string;
  snapshotGeneratedAt: string;
}

export interface IIndexationGateInput {
  evidence: IIndexationGateEvidence;
  diff: string;
  now?: Date;
}

export interface IIndexationGateResult {
  blocked: boolean;
  reason: string;
}

export function ageInDays(dateValue: string, now: Date): number {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return Infinity;
  return (now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000);
}

export function parseIndexationRate(report: string): number {
  const match = report.match(/Overall indexation rate:\s*([0-9]+(?:\.[0-9]+)?)%/i);
  if (!match) throw new Error('Indexation report is missing “Overall indexation rate: N%”.');
  return Number(match[1]);
}

export function parseReportDate(report: string): string {
  const match = report.match(/Generated:\s*(\d{4}-\d{2}-\d{2}(?:T[^\s]+)?)/i);
  if (!match) throw new Error('Indexation report is missing a Generated timestamp.');
  return match[1];
}

export function hasPseoRowsAdded(diff: string): boolean {
  return diff.split(/\r?\n/).some(line => /^\+(?!\+\+\+).*?["']slug["']\s*:/.test(line));
}

export function evaluateIndexationGate(input: IIndexationGateInput): IIndexationGateResult {
  const now = input.now || new Date();
  const reportAge = ageInDays(input.evidence.reportDate, now);
  const snapshotAge = ageInDays(input.evidence.snapshotGeneratedAt, now);

  if (!Number.isFinite(reportAge) || reportAge < 0 || reportAge > MAX_EVIDENCE_AGE_DAYS) {
    return {
      blocked: true,
      reason: `Indexation report is stale or invalid (${input.evidence.reportDate}). Refresh it with yarn seo:sync:performance.`,
    };
  }

  if (!Number.isFinite(snapshotAge) || snapshotAge < 0 || snapshotAge > MAX_EVIDENCE_AGE_DAYS) {
    return {
      blocked: true,
      reason: `pSEO performance snapshot is stale or invalid (${input.evidence.snapshotGeneratedAt}). Refresh it with yarn seo:sync:performance.`,
    };
  }

  if (input.evidence.indexationRate < INDEXATION_THRESHOLD && hasPseoRowsAdded(input.diff)) {
    return {
      blocked: true,
      reason: `New pSEO rows are blocked while sitemap indexation is ${input.evidence.indexationRate}% (required: ${INDEXATION_THRESHOLD}% or higher). Refresh GSC data and improve existing indexation before adding matrix pages.`,
    };
  }

  return {
    blocked: false,
    reason:
      input.evidence.indexationRate < INDEXATION_THRESHOLD
        ? `Existing pSEO changes allowed: ${input.evidence.indexationRate}% indexation and no new pSEO rows in the diff.`
        : `Indexation gate passed at ${input.evidence.indexationRate}%.`,
  };
}

export function findLatestIndexationReport(reportsDir = resolve('seo-reports')): string {
  const reports = readdirSync(reportsDir)
    .filter(filename => /^indexation-\d{4}-\d{2}-\d{2}\.md$/.test(filename))
    .sort();
  if (reports.length === 0) {
    throw new Error(
      `No dated indexation report found in ${reportsDir}. Run yarn seo:sync:performance first.`
    );
  }
  return join(reportsDir, reports[reports.length - 1]);
}

export function loadGateEvidence(
  reportsDir = resolve('seo-reports'),
  snapshotPath = resolve('content/pseo-performance.json')
): IIndexationGateEvidence {
  if (!existsSync(snapshotPath)) {
    throw new Error(
      `Missing ${snapshotPath}. Run yarn seo:sync:performance before adding pSEO rows.`
    );
  }

  const reportPath = findLatestIndexationReport(reportsDir);
  const report = readFileSync(reportPath, 'utf8');
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as {
    generatedAt?: string;
  };
  if (!snapshot.generatedAt) {
    throw new Error(`pSEO performance snapshot ${snapshotPath} is missing generatedAt.`);
  }

  return {
    reportPath,
    reportDate: parseReportDate(report),
    indexationRate: parseIndexationRate(report),
    snapshotPath,
    snapshotGeneratedAt: snapshot.generatedAt,
  };
}

/**
 * Resolve the committed comparison base. The default is the direct parent so
 * a gate run after a matrix row is committed sees that row; CI can pass a
 * branch or merge-base explicitly with --base-ref=... when evaluating a
 * multi-commit change set.
 */
export function getIndexationGateBaseRef(args: readonly string[] = process.argv): string {
  const baseArg = args.find(arg => arg.startsWith('--base-ref='));
  const baseRef = baseArg?.slice('--base-ref='.length).trim();
  return baseRef || DEFAULT_INDEXATION_GATE_BASE_REF;
}

export function readCommittedPseoDiff(baseRef = DEFAULT_INDEXATION_GATE_BASE_REF): string {
  try {
    return execFileSync('git', ['diff', '--unified=0', `${baseRef}..HEAD`, '--', 'app/seo/data'], {
      encoding: 'utf8',
    });
  } catch (error) {
    throw new Error(
      `Unable to inspect committed pSEO data diff from ${baseRef}..HEAD: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function main(): void {
  try {
    const evidence = loadGateEvidence();
    const baseRef = getIndexationGateBaseRef();
    const result = evaluateIndexationGate({
      evidence,
      diff: readCommittedPseoDiff(baseRef),
    });
    console.log(`Indexation gate diff base: ${baseRef}..HEAD (app/seo/data)`);
    console.log(result.reason);
    if (result.blocked) process.exitCode = 1;
  } catch (error) {
    console.error(
      `Indexation gate failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-indexation-gate.ts')) main();
