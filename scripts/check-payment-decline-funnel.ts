import {
  getAmplitudeEventTotals,
  type IAmplitudeEventFilter,
  type IAmplitudeEventTotalsResult,
  type TAmplitudeDashboardMetric,
} from '@server/analytics/dashboardApi';
import { pathToFileURL } from 'url';

interface ICheckDefinition {
  label: string;
  eventType: string;
  filters?: IAmplitudeEventFilter[];
  critical?: boolean;
}

interface ICliOptions {
  start: string;
  end: string;
  metric: TAmplitudeDashboardMetric;
  strict: boolean;
  minCriticalRatio: number;
}

type TCheckStatus = 'OK' | 'WARN' | 'FAIL';

const MODEL_GATE_FILTER: IAmplitudeEventFilter = {
  subprop_type: 'event',
  subprop_key: 'trigger',
  subprop_op: 'is',
  subprop_value: ['model_gate'],
};

const DIRECT_CHECKOUT_FILTER: IAmplitudeEventFilter = {
  subprop_type: 'event',
  subprop_key: 'destination',
  subprop_op: 'is',
  subprop_value: ['checkout_direct'],
};

const CHECKOUT_ENTRY_SOURCE_FILTER: IAmplitudeEventFilter = {
  subprop_type: 'event',
  subprop_key: 'source',
  subprop_op: 'is',
  subprop_value: ['direct_checkout', 'post_auth_redirect'],
};

const CHECKS: ICheckDefinition[] = [
  {
    label: 'model_gate upgrade clicks to checkout_direct',
    eventType: 'upgrade_prompt_clicked',
    filters: [MODEL_GATE_FILTER, DIRECT_CHECKOUT_FILTER],
    critical: true,
  },
  {
    label: 'direct checkout started',
    eventType: 'checkout_direct_started',
    filters: [MODEL_GATE_FILTER],
    critical: true,
  },
  {
    label: 'checkout opened',
    eventType: 'checkout_opened',
    filters: [MODEL_GATE_FILTER, CHECKOUT_ENTRY_SOURCE_FILTER],
    critical: true,
  },
  {
    label: 'checkout modal mounted',
    eventType: 'checkout_modal_mounted',
    filters: [MODEL_GATE_FILTER, CHECKOUT_ENTRY_SOURCE_FILTER],
    critical: true,
  },
  {
    label: 'checkout auth required',
    eventType: 'checkout_auth_required',
    filters: [MODEL_GATE_FILTER, CHECKOUT_ENTRY_SOURCE_FILTER],
  },
  {
    label: 'checkout session requested',
    eventType: 'checkout_session_requested',
    filters: [MODEL_GATE_FILTER],
    critical: true,
  },
  {
    label: 'checkout session created',
    eventType: 'checkout_session_created',
    filters: [MODEL_GATE_FILTER],
    critical: true,
  },
  {
    label: 'direct checkout unavailable fallback',
    eventType: 'checkout_direct_unavailable',
    filters: [MODEL_GATE_FILTER],
  },
  {
    label: 'purchase confirmed with model_gate attribution',
    eventType: 'purchase_confirmed',
    filters: [MODEL_GATE_FILTER],
  },
];

function formatDateForAmplitude(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function getYesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return formatDateForAmplitude(date);
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/check-payment-decline-funnel.ts [options]

Options:
  --start YYYYMMDD    Start date, defaults to yesterday
  --end YYYYMMDD      End date, defaults to start date
  --metric totals     Metric to query: totals or uniques (default: totals)
  --min-critical-ratio N
                     Minimum downstream/direct-click ratio for critical events (default: 0.8)
  --strict            Exit non-zero when no direct clicks exist, or when a critical downstream event is missing or below ratio
  --help              Show this help text

Examples:
  npx tsx scripts/check-payment-decline-funnel.ts --start 20260520 --end 20260521 --strict
  npx tsx scripts/check-payment-decline-funnel.ts --start 20260520 --strict --min-critical-ratio 0.5
`);
}

function parseArgs(argv: string[]): ICliOptions {
  let start = getYesterday();
  let end = '';
  let metric: TAmplitudeDashboardMetric = 'totals';
  let strict = false;
  let minCriticalRatio = 0.8;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--start') {
      start = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--end') {
      end = argv[index + 1] || '';
      index += 1;
      continue;
    }

    if (arg === '--metric') {
      const metricArg = argv[index + 1];
      if (metricArg !== 'totals' && metricArg !== 'uniques') {
        throw new Error(`Unsupported metric "${metricArg}". Use "totals" or "uniques".`);
      }
      metric = metricArg;
      index += 1;
      continue;
    }

    if (arg === '--min-critical-ratio') {
      const ratioArg = argv[index + 1];
      const parsedRatio = Number(ratioArg);
      if (!Number.isFinite(parsedRatio) || parsedRatio < 0 || parsedRatio > 1) {
        throw new Error(
          `Unsupported minimum critical ratio "${ratioArg}". Use a number from 0 to 1.`
        );
      }
      minCriticalRatio = parsedRatio;
      index += 1;
      continue;
    }

    if (arg === '--strict') {
      strict = true;
      continue;
    }

    throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
  }

  return { start, end: end || start, metric, strict, minCriticalRatio };
}

export function getCheckStatus({
  check,
  result,
  directClicks,
  minCriticalRatio,
}: {
  check: ICheckDefinition;
  result: IAmplitudeEventTotalsResult;
  directClicks: number;
  minCriticalRatio: number;
}): TCheckStatus {
  if (!check.critical) {
    return result.total > 0 ? 'OK' : 'WARN';
  }

  if (directClicks <= 0) {
    return result.total > 0 ? 'OK' : 'WARN';
  }

  if (result.total === 0) {
    return 'FAIL';
  }

  const ratio = result.total / directClicks;
  if (ratio < minCriticalRatio) {
    return 'FAIL';
  }

  return 'OK';
}

export function getFailureReason({
  check,
  result,
  directClicks,
  minCriticalRatio,
}: {
  check: ICheckDefinition;
  result: IAmplitudeEventTotalsResult;
  directClicks: number;
  minCriticalRatio: number;
}): string {
  if (!check.critical || directClicks <= 0) {
    return `${check.label} (${check.eventType})`;
  }

  if (result.total === 0) {
    return `${check.label} (${check.eventType}) missing`;
  }

  const ratio = result.total / directClicks;
  if (ratio < minCriticalRatio) {
    return `${check.label} (${check.eventType}) below ratio ${ratio.toFixed(2)} < ${minCriticalRatio}`;
  }

  return `${check.label} (${check.eventType})`;
}

export function shouldExitWithFailure({
  directClicks,
  failures,
  strict,
}: {
  directClicks: number;
  failures: string[];
  strict: boolean;
}): boolean {
  if (!strict) {
    return false;
  }

  return directClicks === 0 || failures.length > 0;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  console.log(
    `Payment-decline funnel check for ${options.start} to ${options.end} (${options.metric}, min critical ratio ${options.minCriticalRatio})`
  );

  const results = await Promise.all(
    CHECKS.map(async check => ({
      check,
      result: await getAmplitudeEventTotals({
        eventType: check.eventType,
        startDate: options.start,
        endDate: options.end,
        metric: options.metric,
        filters: check.filters,
      }),
    }))
  );

  const directClicks = results[0]?.result.total ?? 0;
  const failures: string[] = [];

  for (const { check, result } of results) {
    const dailySummary =
      result.xValues.length > 0
        ? result.xValues
            .map((date, index) => `${date}=${result.dailyTotals[index] ?? 0}`)
            .join(', ')
        : 'no data points returned';

    const status = getCheckStatus({
      check,
      result,
      directClicks,
      minCriticalRatio: options.minCriticalRatio,
    });

    if (status === 'FAIL') {
      failures.push(
        getFailureReason({
          check,
          result,
          directClicks,
          minCriticalRatio: options.minCriticalRatio,
        })
      );
    }

    const ratio =
      check.critical && directClicks > 0
        ? ` | directRatio=${(result.total / directClicks).toFixed(2)}`
        : '';

    console.log(`${status} ${check.label}: total=${result.total}${ratio} | ${dailySummary}`);
  }

  if (directClicks === 0) {
    console.log(
      'WARN No model_gate checkout_direct clicks found. Run again after production traffic reaches the fixed flow.'
    );
  }

  if (failures.length > 0) {
    console.log(`FAIL Missing critical downstream events: ${failures.join(', ')}`);
  }

  if (shouldExitWithFailure({ directClicks, failures, strict: options.strict })) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
