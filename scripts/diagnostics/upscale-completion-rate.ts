import { pathToFileURL } from 'node:url';
export {
  buildUpscaleHealthReport,
  calculateUpscaleCompletionRate,
  getCompleteDayRange,
  getUpscaleHealthReport,
  UPSCALE_COMPLETION_RATE_THRESHOLD,
} from '@server/services/upscale-completion-health.service';
export type {
  IUpscaleHealthDateRange,
  IUpscaleHealthDay,
  IUpscaleHealthReport,
} from '@server/services/upscale-completion-health.service';
import {
  getCompleteDayRange,
  getUpscaleHealthReport,
  UPSCALE_COMPLETION_RATE_THRESHOLD,
  type IUpscaleHealthReport,
} from '@server/services/upscale-completion-health.service';

export function formatUpscaleHealthReport(report: IUpscaleHealthReport): string {
  const lines = [
    `Upscale completion health (${report.startDate}–${report.endDate})`,
    'date       started  completed  processing_failed  completion_rate  unaccounted',
  ];

  for (const day of report.days) {
    lines.push(
      [
        day.date,
        String(day.started).padStart(7),
        String(day.completed).padStart(10),
        String(day.processingFailed).padStart(18),
        day.completionRate === null
          ? 'N/A'.padStart(16)
          : day.completionRate.toFixed(2).padStart(16),
        String(day.unaccounted).padStart(12),
      ].join('  ')
    );
  }

  const latest = report.lastCompleteDay;
  lines.push(
    latest
      ? `Last complete day: ${latest.date} ratio=${latest.completionRate?.toFixed(2) ?? 'N/A'} threshold=${report.threshold.toFixed(2)}`
      : 'Last complete day: no upscale attempts found'
  );
  return lines.join('\n');
}

interface IUpscaleHealthCliOptions {
  startDate?: string;
  endDate?: string;
  threshold: number;
  help: boolean;
}

function printHelp(): void {
  console.log(`Usage: yarn diag:upscale-health [options]

Reads the last complete UTC days from Amplitude and exits 1 when the latest
complete-day upscale ratio is below 0.95.

Options:
  --start YYYYMMDD    Override the first day in the report
  --end YYYYMMDD      Override the last day in the report
  --threshold 0.95    Override the completion-rate threshold
  --help              Show this help text
`);
}

function parseCliArgs(argv: string[]): IUpscaleHealthCliOptions {
  let startDate: string | undefined;
  let endDate: string | undefined;
  let threshold = UPSCALE_COMPLETION_RATE_THRESHOLD;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--start') {
      startDate = argv[++index];
      continue;
    }
    if (argument === '--end') {
      endDate = argv[++index];
      continue;
    }
    if (argument === '--threshold') {
      threshold = Number(argv[++index]);
      continue;
    }
    throw new Error(`Unknown argument "${argument}". Use --help for usage.`);
  }

  if (startDate && !/^\d{8}$/.test(startDate)) throw new Error('--start must be YYYYMMDD.');
  if (endDate && !/^\d{8}$/.test(endDate)) throw new Error('--end must be YYYYMMDD.');
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error('--threshold must be between 0 and 1.');
  }
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw new Error('--start and --end must be provided together.');
  }

  return { startDate, endDate, threshold, help };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const range =
    options.startDate && options.endDate
      ? { startDate: options.startDate, endDate: options.endDate }
      : getCompleteDayRange();
  const report = await getUpscaleHealthReport(range, options.threshold);
  console.log(formatUpscaleHealthReport(report));

  if (!report.lastCompleteDay || report.lastCompleteDay.completionRate === null) {
    process.exitCode = 1;
  } else if (report.lastCompleteDay.completionRate < report.threshold) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
