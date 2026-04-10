import {
  getAmplitudeEventTotals,
  type TAmplitudeDashboardMetric,
} from '@server/analytics/dashboardApi';

const DEFAULT_EVENTS = ['purchase_confirmed', 'checkout_completed', 'credit_pack_purchased'];

interface ICliOptions {
  start: string;
  end: string;
  metric: TAmplitudeDashboardMetric;
  events: string[];
}

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
  console.log(`Usage: npx tsx scripts/check-amplitude-events.ts [options] [event_name...]

Options:
  --start YYYYMMDD    Start date, defaults to yesterday
  --end YYYYMMDD      End date, defaults to start date
  --metric totals     Metric to query: totals or uniques (default: totals)
  --help              Show this help text

Examples:
  yarn amplitude:check -- purchase_confirmed
  yarn amplitude:check:prod -- --start 20260409 --end 20260409 purchase_confirmed checkout_completed
`);
}

function parseArgs(argv: string[]): ICliOptions {
  let start = getYesterday();
  let end = '';
  let metric: TAmplitudeDashboardMetric = 'totals';
  const events: string[] = [];

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

    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
    }

    events.push(arg);
  }

  const resolvedEnd = end || start;
  return {
    start,
    end: resolvedEnd,
    metric,
    events: events.length > 0 ? events : DEFAULT_EVENTS,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(
    `Amplitude event totals for ${options.start} to ${options.end} (${options.metric}):`
  );

  const results = await Promise.all(
    options.events.map(eventType =>
      getAmplitudeEventTotals({
        eventType,
        startDate: options.start,
        endDate: options.end,
        metric: options.metric,
      })
    )
  );

  for (const result of results) {
    const dailySummary =
      result.xValues.length > 0
        ? result.xValues
            .map((date, index) => `${date}=${result.dailyTotals[index] ?? 0}`)
            .join(', ')
        : 'no data points returned';

    console.log(`${result.eventType}: total=${result.total} | ${dailySummary}`);
  }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
