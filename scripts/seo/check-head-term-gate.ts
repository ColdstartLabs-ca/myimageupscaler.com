#!/usr/bin/env tsx

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ageInDays, MAX_EVIDENCE_AGE_DAYS } from './check-indexation-gate';

export const HEAD_TERM_POSITION_THRESHOLD = 10;

export interface IHeadTermEvidence {
  generatedAt: string;
  query: string;
  position: number;
  period: { startDate: string; endDate: string; days: number };
}

export function evaluateHeadTermGate(
  evidence: IHeadTermEvidence,
  now = new Date()
): { blocked: boolean; reason: string } {
  const age = ageInDays(evidence.generatedAt, now);
  if (!Number.isFinite(age) || age < 0 || age > MAX_EVIDENCE_AGE_DAYS) {
    throw new Error(`Head-term evidence is stale or invalid (${evidence.generatedAt}).`);
  }
  if (evidence.query !== 'image upscaler') {
    throw new Error(`Head-term evidence must measure "image upscaler", not "${evidence.query}".`);
  }
  if (evidence.period.days !== 28) {
    throw new Error(`Head-term evidence must cover 28 complete days, not ${evidence.period.days}.`);
  }

  const blocked = evidence.position >= HEAD_TERM_POSITION_THRESHOLD;
  return {
    blocked,
    reason: blocked
      ? `image upscaler position ${evidence.position.toFixed(2)} has not returned below ${HEAD_TERM_POSITION_THRESHOLD}; the content-matrix pruning escalation is urgent.`
      : `image upscaler position ${evidence.position.toFixed(2)} is below ${HEAD_TERM_POSITION_THRESHOLD}.`,
  };
}

function latestEvidencePath(): string {
  const filename = readdirSync(resolve('seo-reports'))
    .filter(name => /^head-term-\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .sort()
    .at(-1);
  if (!filename) throw new Error('No seo-reports/head-term-YYYY-MM-DD.json evidence found.');
  return resolve('seo-reports', filename);
}

function main(): void {
  const explicitPath = process.argv
    .find(argument => argument.startsWith('--input='))
    ?.split('=')[1];
  const inputPath = explicitPath ? resolve(explicitPath) : latestEvidencePath();
  const evidence = JSON.parse(readFileSync(inputPath, 'utf8')) as IHeadTermEvidence;
  const result = evaluateHeadTermGate(evidence);
  console.log(`${result.reason} Evidence: ${inputPath}`);
  if (result.blocked) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
