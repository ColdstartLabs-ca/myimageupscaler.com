import { pathToFileURL } from 'url';
import { serverEnv } from '@shared/config/env';

const REQUIRED_RECOVERY_AUDIENCES = [
  'checkout_abandoner',
  'upgrade_click_no_purchase',
  'credit_wall_dismissed',
  'high_usage_free_user',
] as const;

const REQUIRED_COUNT_KEYS = [
  'scanned',
  'eligible',
  'queued',
  'skippedPurchased',
  'skippedPriority',
  'skippedMissingEmail',
] as const;

type RecoveryAudience = (typeof REQUIRED_RECOVERY_AUDIENCES)[number];
type RecoveryCountKey = (typeof REQUIRED_COUNT_KEYS)[number];

export type IRecoveryCronAudienceCounts = Record<RecoveryCountKey, number>;

export interface IRecoveryCronDryRunSummary {
  duePending: number;
  durationMs: number;
  byAudience: Record<RecoveryAudience, IRecoveryCronAudienceCounts>;
}

export interface IRecoveryCronDryRunCheckOptions {
  baseUrl?: string;
  cronSecret?: string;
  fetchImpl?: typeof fetch;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requireInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`Recovery cron dry-run response is missing integer ${path}`);
  }
  return value;
}

export function validateRecoveryCronDryRunResponse(payload: unknown): IRecoveryCronDryRunSummary {
  const data = asRecord(payload);
  if (!data) {
    throw new Error('Recovery cron dry-run response was not a JSON object');
  }

  if (data.success !== true || data.dryRun !== true) {
    throw new Error('Recovery cron dry-run response did not report success=true and dryRun=true');
  }

  const recovery = asRecord(data.recoveryEligibility);
  const byAudience = asRecord(recovery?.byAudience);
  if (!byAudience) {
    throw new Error('Recovery cron dry-run response is missing recoveryEligibility.byAudience');
  }

  const summary: IRecoveryCronDryRunSummary = {
    duePending: requireInteger(data.duePending, 'duePending'),
    durationMs: requireInteger(data.durationMs, 'durationMs'),
    byAudience: {} as Record<RecoveryAudience, IRecoveryCronAudienceCounts>,
  };

  for (const audience of REQUIRED_RECOVERY_AUDIENCES) {
    const counts = asRecord(byAudience[audience]);
    if (!counts) {
      throw new Error(`Recovery cron dry-run response is missing ${audience} counts`);
    }

    const normalized = {} as IRecoveryCronAudienceCounts;
    for (const key of REQUIRED_COUNT_KEYS) {
      normalized[key] = requireInteger(counts[key], `${audience}.${key}`);
    }
    summary.byAudience[audience] = normalized;
  }

  return summary;
}

export function formatRecoveryCronDryRunSummary(summary: IRecoveryCronDryRunSummary): string[] {
  const lines = [
    `Recovery lifecycle dry-run OK | duePending=${summary.duePending} | durationMs=${summary.durationMs}`,
  ];

  for (const audience of REQUIRED_RECOVERY_AUDIENCES) {
    const counts = summary.byAudience[audience];
    lines.push(
      `OK ${audience}: scanned=${counts.scanned} eligible=${counts.eligible} queued=${counts.queued} skippedPurchased=${counts.skippedPurchased} skippedPriority=${counts.skippedPriority} skippedMissingEmail=${counts.skippedMissingEmail}`
    );
  }

  return lines;
}

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = process.argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];

  return undefined;
}

// Mirrors the hourly production cron parameters (workers/cron/index.ts). The eligibility
// scan issues several sequential Supabase round-trips per profile, so a larger scan pushes
// the Worker past its resource limits and Cloudflare answers 503 (error code 1102).
const DRY_RUN_SCAN_LIMIT = '25';

function buildCronUrl(baseUrl: string): string {
  const url = new URL('/api/cron/email-lifecycle', baseUrl);
  url.searchParams.set('dryRun', 'true');
  url.searchParams.set('batchSize', DRY_RUN_SCAN_LIMIT);
  url.searchParams.set('scanLimit', DRY_RUN_SCAN_LIMIT);
  return url.toString();
}

export async function runRecoveryCronDryRunCheck(
  options: IRecoveryCronDryRunCheckOptions = {}
): Promise<IRecoveryCronDryRunSummary> {
  const baseUrl = options.baseUrl ?? serverEnv.BASE_URL;
  const cronSecret = options.cronSecret ?? serverEnv.CRON_SECRET;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!cronSecret) {
    throw new Error('CRON_SECRET is required to verify the target recovery lifecycle dry-run');
  }

  const response = await fetchImpl(buildCronUrl(baseUrl), {
    method: 'POST',
    headers: {
      'x-cron-secret': cronSecret,
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Recovery lifecycle dry-run failed with HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error('Recovery lifecycle dry-run returned invalid JSON');
  }

  return validateRecoveryCronDryRunResponse(payload);
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/check-recovery-cron-target.ts [options]

Authenticated target-environment dry-run check for revenue recovery lifecycle cron.
This validates aggregate queue and recovery audience counts only; it does not send emails.

Options:
  --url <url>  Override serverEnv.BASE_URL for the target application
  --help       Show this help text

Examples:
  yarn recovery:cron:check
  yarn recovery:cron:check:prod
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const summary = await runRecoveryCronDryRunCheck({
    baseUrl: getArgValue('--url'),
  });

  for (const line of formatRecoveryCronDryRunSummary(summary)) {
    console.log(line);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
