import { pathToFileURL } from 'node:url';
import { getEmailRecipientValueService } from '@server/services/email-recipient-value.service';

export interface IEmailRecipientValueReportArgs {
  days: 7 | 14 | 30;
}

export interface IEmailRecipientValuePerformanceRow {
  country: string;
  pricing_region: string;
  campaign_key: string;
  policy_version: string;
  value_band: string;
  sent_count: number;
  purchased_after_email_count: number;
  conversion_rate?: number | null;
  conversion_ci_lower?: number | null;
  conversion_ci_upper?: number | null;
  revenue_multiplier?: number | null;
  evidence_status?: string;
  [key: string]: unknown;
}

function getArgValue(argv: string[], name: string): string | undefined {
  const inline = argv.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  if (index >= 0) {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
  }
  return undefined;
}

export function parseReportEmailRecipientValueArgs(argv: string[]): IEmailRecipientValueReportArgs {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--days') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--days=')) continue;
    throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
  }

  const rawDays = getArgValue(argv, '--days') ?? '30';
  const days = Number(rawDays);
  if (days !== 7 && days !== 14 && days !== 30) {
    throw new Error('--days must be 7, 14, or 30');
  }
  return { days };
}

export function calculateWilsonInterval(
  successes: number,
  trials: number,
  z = 1.96
): { lower: number; upper: number } {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials <= 0) {
    return { lower: 0, upper: 0 };
  }

  const boundedSuccesses = Math.min(Math.max(successes, 0), trials);
  const p = boundedSuccesses / trials;
  const zSquared = z * z;
  const denominator = 1 + zSquared / trials;
  const center = (p + zSquared / (2 * trials)) / denominator;
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) + zSquared / (4 * trials)) / trials);

  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

export function filterPrivacySafePerformanceRows(
  rows: IEmailRecipientValuePerformanceRow[]
): IEmailRecipientValuePerformanceRow[] {
  return rows.filter(row => Number(row.sent_count) >= 20);
}

export function addEvidenceStatus(
  row: IEmailRecipientValuePerformanceRow
): IEmailRecipientValuePerformanceRow & { evidence_status: string; recommendation: null } {
  const status = Number(row.sent_count) < 100 ? 'insufficient_evidence' : 'sufficient_evidence';
  return { ...row, evidence_status: status, recommendation: null };
}

export function buildReportEmailRecipientValueOutput(
  rows: IEmailRecipientValuePerformanceRow[]
): Record<string, unknown> {
  return {
    count_only: true,
    suppressed_below_sends: 20,
    insufficient_evidence_below_sends: 100,
    rows: filterPrivacySafePerformanceRows(rows).map(addEvidenceStatus),
  };
}

export async function runReportEmailRecipientValue(
  args: IEmailRecipientValueReportArgs = { days: 30 }
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - args.days * 24 * 60 * 60 * 1000);
  const rows = await getEmailRecipientValueService().getPerformanceReport(since);
  return buildReportEmailRecipientValueOutput(rows as IEmailRecipientValuePerformanceRow[]);
}

async function main(): Promise<void> {
  const args = parseReportEmailRecipientValueArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runReportEmailRecipientValue(args)));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
