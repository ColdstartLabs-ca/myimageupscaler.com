import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * `NEXT_PUBLIC_*` values are inlined by `next build`, so a CI deploy only ships what
 * the "Build for Cloudflare Workers" step passes in its `env:` block. A missing one
 * resolves to its zod default (usually `''`) with no error.
 *
 * Not hypothetical: `NEXT_PUBLIC_AHREFS_ANALYTICS_KEY` lived only in the local
 * `myimageupscaler-client-prod` secret, so every push-to-master deploy shipped without
 * the Ahrefs script (`AhrefsAnalytics` renders nothing on an empty key). Ahrefs Web
 * Analytics went to ~0 visitors from 2026-09-11 while GSC still showed ~170 clicks/day.
 */
const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml';

/** Public build-time variables with no usable default. */
const REQUIRED_AT_BUILD = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_AMPLITUDE_API_KEY',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'NEXT_PUBLIC_AHREFS_ANALYTICS_KEY',
];

function buildStepEnv(): string {
  const workflow = readFileSync(DEPLOY_WORKFLOW, 'utf8');
  const start = workflow.indexOf('- name: Build for Cloudflare Workers');
  expect(start, 'build step not found in deploy workflow').toBeGreaterThan(-1);
  const next = workflow.indexOf('- name:', start + 1);
  return workflow.slice(start, next === -1 ? undefined : next);
}

describe('CI build passes every required NEXT_PUBLIC_ variable', () => {
  it.each(REQUIRED_AT_BUILD)('%s is in the build step env', name => {
    expect(buildStepEnv()).toMatch(
      new RegExp(`^\\s+${name}: \\$\\{\\{ vars\\.${name} \\}\\}`, 'm')
    );
  });
});
