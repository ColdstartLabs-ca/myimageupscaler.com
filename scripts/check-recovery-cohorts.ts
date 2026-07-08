import { pathToFileURL } from 'url';
import {
  AmplitudeCohortService,
  type IAmplitudeCohort,
} from '@server/services/amplitude-cohort.service';
import { serverEnv } from '@shared/config/env';

interface IExpectedRecoveryCohort {
  label: string;
  cohortId: string;
}

export interface IRecoveryCohortCheckResult {
  label: string;
  cohortId: string;
  maskedCohortId: string;
  found: boolean;
  name: string | null;
  size: number | null;
  syncDestinations: number | null;
}

export function maskCohortId(cohortId: string): string {
  if (cohortId.length <= 4) return '*'.repeat(cohortId.length);
  return `${cohortId.slice(0, 2)}***${cohortId.slice(-2)}`;
}

export function buildRecoveryCohortCheckResults(
  cohorts: IAmplitudeCohort[],
  expected: IExpectedRecoveryCohort[]
): IRecoveryCohortCheckResult[] {
  const cohortsById = new Map(cohorts.map(cohort => [cohort.id, cohort]));

  return expected.map(item => {
    const cohort = cohortsById.get(item.cohortId);
    return {
      label: item.label,
      cohortId: item.cohortId,
      maskedCohortId: maskCohortId(item.cohortId),
      found: Boolean(cohort),
      name: cohort?.name ?? null,
      size: typeof cohort?.size === 'number' ? cohort.size : null,
      syncDestinations: Array.isArray(cohort?.syncMetadata) ? cohort.syncMetadata.length : null,
    };
  });
}

export function formatRecoveryCohortCheckLine(result: IRecoveryCohortCheckResult): string {
  if (!result.found) {
    return `FAIL ${result.label}: cohort ${result.maskedCohortId} was not discoverable`;
  }

  const size = result.size === null ? 'unknown' : String(result.size);
  const syncDestinations =
    result.syncDestinations === null ? 'unknown' : String(result.syncDestinations);
  return `OK ${result.label}: cohort ${result.maskedCohortId} | name="${result.name ?? 'unknown'}" | size=${size} | syncDestinations=${syncDestinations}`;
}

function getExpectedRecoveryCohorts(): IExpectedRecoveryCohort[] {
  return [
    {
      label: 'checkout abandoners',
      cohortId: serverEnv.AMPLITUDE_COHORT_CHECKOUT_ABANDONERS,
    },
    {
      label: 'upgrade clickers no purchase',
      cohortId: serverEnv.AMPLITUDE_COHORT_UPGRADE_CLICKERS_NO_PURCHASE,
    },
  ];
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/check-recovery-cohorts.ts [options]

Read-only Amplitude Behavioral Cohorts discovery check for revenue recovery.
This lists cohort metadata only and never downloads cohort members or prints user identifiers.

Options:
  --help      Show this help text

Examples:
  yarn recovery:cohorts:check
  yarn recovery:cohorts:check:prod
`);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const expected = getExpectedRecoveryCohorts();
  const service = new AmplitudeCohortService();
  const cohorts = await service.listCohorts({ includeSyncInfo: true });
  const results = buildRecoveryCohortCheckResults(cohorts, expected);

  console.log(
    `Amplitude recovery cohort discovery: ${cohorts.length} cohort(s) visible. No cohort members downloaded.`
  );

  for (const result of results) {
    console.log(formatRecoveryCohortCheckLine(result));
  }

  if (results.some(result => !result.found)) {
    throw new Error(
      'One or more configured recovery cohorts were not discoverable to the configured Amplitude API key/project.'
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
