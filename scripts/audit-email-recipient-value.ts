import { pathToFileURL } from 'node:url';
import { getEmailRecipientValueService } from '@server/services/email-recipient-value.service';

export interface IAuditEmailRecipientValueArgs {
  pageSize: number;
}

const MAX_PAGE_SIZE = 250;

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

export function parseAuditEmailRecipientValueArgs(argv: string[]): IAuditEmailRecipientValueArgs {
  if (argv.includes('--help')) {
    throw new Error(
      'Usage: yarn email:queue:audit [--page-size <1-250>]\n' +
        'Audit the pending lifecycle queue in dry-run mode. It never changes queue status.'
    );
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--page-size') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--page-size=')) continue;
    throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
  }

  const rawPageSize = getArgValue(argv, '--page-size');
  const pageSize = rawPageSize === undefined ? MAX_PAGE_SIZE : Number(rawPageSize);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error(`--page-size must be an integer from 1 to ${MAX_PAGE_SIZE}`);
  }

  return { pageSize };
}

export function buildAuditEmailRecipientValueOutput(result: {
  runId: string;
  summary: {
    candidateCount: number;
    byDecision: Record<string, number>;
    byReason: Record<string, number>;
    byCampaign: Record<string, number>;
    byCountry: Record<string, number>;
    byBand: Record<string, number>;
  };
}): Record<string, unknown> {
  return {
    run_id: result.runId,
    dry_run: true,
    candidate_count: result.summary.candidateCount,
    by_decision: result.summary.byDecision,
    by_reason: result.summary.byReason,
    by_campaign: result.summary.byCampaign,
    by_country: result.summary.byCountry,
    by_band: result.summary.byBand,
  };
}

export async function runAuditEmailRecipientValue(
  args: IAuditEmailRecipientValueArgs = { pageSize: MAX_PAGE_SIZE }
): Promise<Record<string, unknown>> {
  const result = await getEmailRecipientValueService().auditQueue({
    pageSize: args.pageSize,
    onProgress: processedCount => {
      console.error(JSON.stringify({ audit_progress: true, processed_count: processedCount }));
    },
  });
  return buildAuditEmailRecipientValueOutput(result);
}

async function main(): Promise<void> {
  const args = parseAuditEmailRecipientValueArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runAuditEmailRecipientValue(args)));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
