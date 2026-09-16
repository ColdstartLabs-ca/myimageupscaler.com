/**
 * Read-only weekly paid-funnel scorecard.
 *
 * Reconciles the traced client -> modal -> checkout -> webhook stages against
 * Stripe settlement, and audits recovery-email delivery. Reads only: no event is
 * emitted, no email is sent, no row is written.
 *
 * Caveats recorded on purpose:
 * - The Amplitude segmentation API answers in the Amplitude *project* time zone,
 *   while the `--start`/`--end` window and the Stripe calls below are UTC. Day
 *   boundaries can disagree until the project time zone is verified.
 * - Distinct counts are whole-interval values taken from `seriesCollapsed` (never a
 *   sum of overlapping daily uniques). The ratios printed at the bottom are
 *   aggregate period ratios, not a cohort conversion funnel.
 */
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import {
  AmplitudeDashboardApiError,
  getAmplitudeEventTotals,
} from '@server/analytics/dashboardApi';
import { serverEnv } from '@shared/config/env';

/** Ordered paid-funnel stages. `kpiRole` mirrors `server/analytics/coreKpiDefinitions.ts`. */
export const PAID_FUNNEL_STAGES = [
  { event: 'monetization_surface_shown', role: 'ctr_denominator' },
  { event: 'purchase_modal_opened', role: 'surface_detail' },
  { event: 'monetization_surface_clicked', role: 'ctr_numerator' },
  { event: 'checkout_modal_mounted', role: 'checkout_surface' },
  { event: 'checkout_opened', role: 'checkout_start' },
  { event: 'checkout_error', role: 'checkout_friction' },
  { event: 'checkout_abandoned', role: 'checkout_friction' },
  { event: 'checkout_completed', role: 'checkout_funnel_only' },
  { event: 'purchase_confirmed', role: 'purchase_conversion' },
  { event: 'revenue_received', role: 'recognized_revenue' },
] as const;

/**
 * `monetization_surface_clicked` destinations that can reach a checkout. Clicks to
 * other destinations belong to the CTR numerator but cannot convert in the same step,
 * so a click-to-purchase rate computed over all clicks understates checkout intent.
 */
export const CHECKOUT_BOUND_DESTINATIONS = [
  'upgrade_plan_modal',
  'upgrade_modal',
  'checkout_direct',
] as const;

export interface IScorecardWindow {
  startDate: string;
  endDate: string;
}

/** Whole-interval value, or UNKNOWN when Amplitude cannot resolve the event/chart. */
export type TStageValue = number | 'UNKNOWN';

const UNKNOWN = 'UNKNOWN' as const;

const PAGE_SIZE = 1_000;
// ponytail: fixed 50k-row ceiling. Exceeding it throws an explicit truncation error
// instead of returning a partial audit; raise the ceiling or narrow the window if a
// real audit ever needs more.
const MAX_ROWS = 50_000;

/** `YYYYMMDD` -> inclusive unix-second bounds for that UTC day range. */
export function toUnixRange(window: IScorecardWindow): { gte: number; lte: number } {
  const iso = (day: string, time: string) =>
    Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${time}Z`);
  return {
    gte: Math.floor(iso(window.startDate, '00:00:00') / 1000),
    lte: Math.floor(iso(window.endDate, '23:59:59') / 1000),
  };
}

export function formatRate(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : 'n/a';
}

/**
 * Stripe's minor-unit rules, not ISO/`Intl`: `Intl` is used for display only, never to
 * derive the scale. Most currencies are two-decimal; the set below are Stripe's
 * zero-decimal currencies, where the amount is already the whole unit. ISK and UGX are
 * ISO zero-decimal but Stripe represents them as two-decimal (`500` = 5), so they are
 * deliberately absent; MGA is ISO two-decimal but Stripe treats it as zero-decimal.
 * https://docs.stripe.com/currencies
 */
const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

export function formatMinorUnits(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const digits = STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount / 10 ** digits);
}

function amplitudeAuth(): { apiKey: string; secretKey: string } {
  if (!serverEnv.AMPLITUDE_API_KEY || !serverEnv.AMPLITUDE_SECRET_KEY) {
    throw new Error('Paid-funnel scorecard requires AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY.');
  }
  return { apiKey: serverEnv.AMPLITUDE_API_KEY, secretKey: serverEnv.AMPLITUDE_SECRET_KEY };
}

const show = (value: TStageValue) => (value === UNKNOWN ? UNKNOWN : String(value)).padStart(7);

function ratio(numerator: TStageValue, denominator: TStageValue): string {
  if (numerator === UNKNOWN || denominator === UNKNOWN) return 'UNKNOWN';
  return `${formatRate(numerator, denominator)} (${numerator}/${denominator})`;
}

/**
 * Whole-interval count for one event. Amplitude's 400 "Invalid chart definition" cannot
 * be told apart from a fabricated event name, so it becomes UNKNOWN — never a synthetic
 * zero and never a "NEVER ingested" assertion. Every other failure (missing/expired
 * credentials, 401/429/5xx, network, schema) is rethrown sanitized so the run fails
 * loudly instead of reporting a misleading success.
 */
async function eventTotal(
  eventType: string,
  window: IScorecardWindow,
  metric: 'totals' | 'uniques',
  filters?: {
    subprop_type: string;
    subprop_key: string;
    subprop_op: string;
    subprop_value: string[];
  }[]
): Promise<TStageValue> {
  try {
    const result = await getAmplitudeEventTotals(
      { eventType, startDate: window.startDate, endDate: window.endDate, metric, filters },
      amplitudeAuth()
    );
    return result.total;
  } catch (error) {
    if (error instanceof AmplitudeDashboardApiError && error.unknownEvent) return UNKNOWN;
    throw new Error(
      `Amplitude ${metric} query failed for "${eventType}"${
        error instanceof AmplitudeDashboardApiError ? ` (HTTP ${error.status})` : ''
      }.`,
      { cause: error }
    );
  }
}

async function printFunnel(window: IScorecardWindow): Promise<void> {
  console.log(
    `\nPaid funnel ${window.startDate}-${window.endDate} (Amplitude, project time zone; window UTC)`
  );
  console.log('  totals  uniques  event                          kpi role');

  const uniques: Record<string, TStageValue> = {};
  for (const { event, role } of PAID_FUNNEL_STAGES) {
    const [totals, unique] = await Promise.all([
      eventTotal(event, window, 'totals'),
      eventTotal(event, window, 'uniques'),
    ]);
    uniques[event] = unique;
    console.log(`${show(totals)}  ${show(unique)}  ${event.padEnd(30)} ${role}`);
  }

  // One OR-filtered query over all destination values: separate per-destination counts
  // overlap and cannot be summed into a distinct-user base.
  const checkoutBound = await eventTotal('monetization_surface_clicked', window, 'uniques', [
    {
      subprop_type: 'event',
      subprop_key: 'destination',
      subprop_op: 'is',
      subprop_value: [...CHECKOUT_BOUND_DESTINATIONS],
    },
  ]);
  console.log(
    `\n  checkout-bound clickers (one OR filter: ${CHECKOUT_BOUND_DESTINATIONS.join(', ')}):`
  );
  console.log(`    ${show(checkoutBound)}  distinct users`);

  const paid = uniques.purchase_confirmed;
  console.log(
    '\n  Aggregate period ratios (distinct-user numerators/denominators, not a cohort funnel):'
  );
  console.log(
    `    purchase_confirmed / all monetization clicks:  ${ratio(paid, uniques.monetization_surface_clicked)}`
  );
  console.log(`    purchase_confirmed / checkout-bound clickers:  ${ratio(paid, checkoutBound)}`);
}

async function printStripe(window: IScorecardWindow): Promise<void> {
  if (!serverEnv.STRIPE_SECRET_KEY)
    throw new Error('Paid-funnel scorecard requires STRIPE_SECRET_KEY.');
  const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
    apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
  });
  const created = toUnixRange(window);

  const chargesByCurrency: Record<string, { count: number; gross: number; refunded: number }> = {};
  for await (const charge of stripe.charges.list({ created, limit: 100 })) {
    if (charge.status !== 'succeeded') continue;
    const row = (chargesByCurrency[charge.currency] ??= { count: 0, gross: 0, refunded: 0 });
    row.count += 1;
    row.gross += charge.amount;
    row.refunded += charge.amount_refunded;
  }

  const settled: Record<string, { gross: number; fee: number; count: number }> = {};
  for await (const tx of stripe.balanceTransactions.list({ created, limit: 100 })) {
    if (tx.type !== 'charge' && tx.type !== 'payment') continue;
    settled[tx.currency] ??= { gross: 0, fee: 0, count: 0 };
    settled[tx.currency].gross += tx.amount;
    settled[tx.currency].fee += tx.fee;
    settled[tx.currency].count += 1;
  }

  console.log(`\nStripe ${window.startDate}-${window.endDate} (UTC; by object creation time)`);
  console.log('  Charges created in the window, grouped by charge currency:');
  for (const [currency, row] of Object.entries(chargesByCurrency)) {
    console.log(
      `    ${currency.toUpperCase()}: ${row.count} succeeded, gross ${formatMinorUnits(row.gross, currency)}, ` +
        `refunded ${formatMinorUnits(row.refunded, currency)} (refunds currently recorded, not window-bounded)`
    );
  }
  console.log(
    '  Settlement balance transactions created in the window, grouped by settlement currency:'
  );
  for (const [currency, row] of Object.entries(settled)) {
    console.log(
      `    ${currency.toUpperCase()}: n=${row.count} gross=${formatMinorUnits(row.gross, currency)} ` +
        `fees=${formatMinorUnits(row.fee, currency)} rate=${formatRate(row.fee, row.gross)} ` +
        `avg_fee=${row.count ? formatMinorUnits(row.fee / row.count, currency) : 'n/a'}`
    );
  }
  console.log(
    '  Labels: charges are charge-creation-time; settlement rows are transaction-creation-time;'
  );
  console.log('  refunds are current cumulative amounts. These are cash movements, not profit.');
}

/**
 * Pages a bounded query with a stable order. Throws when the row ceiling is reached so
 * a truncated read can never be reported as a complete audit.
 */
export async function collectPages(
  fetchPage: (from: number, to: number) => Promise<Record<string, unknown>[]>,
  label: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    if (from + PAGE_SIZE > MAX_ROWS) {
      throw new Error(
        `${label}: more than ${MAX_ROWS} rows in the frozen window; refusing a silently truncated audit.`
      );
    }
    const page = await fetchPage(from, from + PAGE_SIZE - 1);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function printRecoveryDelivery(days: number): Promise<void> {
  if (!serverEnv.SUPABASE_URL || !serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Paid-funnel scorecard requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  const db = createClient(serverEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const snapshotUpper = new Date().toISOString();

  // Frozen [since, snapshotUpper] window. Not snapshot-isolated: rows can still be
  // updated mid-read, but nothing created after the captured upper bound is included.
  // Ordering by (timestamp, id) is deterministic so paging cannot drop or repeat rows.
  async function pageAll(table: string, columns: string, sinceColumn: string) {
    return collectPages(async (from, to) => {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .gte(sinceColumn, since)
        .lte(sinceColumn, snapshotUpper)
        .order(sinceColumn, { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return (data as unknown as Record<string, unknown>[]) ?? [];
    }, `${table} (${sinceColumn})`);
  }

  const tally = (rows: Record<string, unknown>[], key: string) =>
    rows.reduce<Record<string, number>>((acc, row) => {
      const value = String(row[key] ?? 'null');
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});

  const showCounts = (title: string, counts: Record<string, number>) => {
    console.log(`  ${title}`);
    for (const [key, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(6)}  ${key}`);
    }
  };

  const intents = await pageAll(
    'revenue_recovery_intents',
    'id, status, audience_key, queued_at, converted_at, first_seen_at',
    'first_seen_at'
  );
  const queue = await pageAll(
    'email_lifecycle_queue',
    'id, campaign_key, status, reason, scheduled_for, created_at',
    'created_at'
  );

  console.log(
    `\nRecovery delivery, frozen ${since.slice(0, 10)} to ${snapshotUpper.slice(0, 10)} UTC (${days}-day lower bound)`
  );
  console.log(
    `  revenue_recovery_intents: ${intents.length} rows   email_lifecycle_queue: ${queue.length} rows`
  );
  showCounts('intents by status', tally(intents, 'status'));
  showCounts('queue by status', tally(queue, 'status'));
  showCounts(
    'queue by skip/cancel reason',
    tally(
      queue.filter(row => row.reason),
      'reason'
    )
  );

  const overdue = queue.filter(
    row =>
      row.status === 'pending' &&
      row.scheduled_for &&
      new Date(row.scheduled_for as string) < new Date()
  );
  console.log(
    `  pending past scheduled_for: ${overdue.length} of ${queue.filter(r => r.status === 'pending').length} pending`
  );
}

/** Last fully elapsed 30-day UTC window ending yesterday. */
export function getDefaultWindow(now: Date = new Date()): IScorecardWindow {
  const day = (offset: number) =>
    new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
  return { startDate: day(30), endDate: day(1) };
}

const DATE_PATTERN = /^\d{8}$/;

/** Validates a strict `YYYYMMDD` calendar date (rejects rollovers like 20260230). */
export function parseCalendarDate(value: string, flag: string): string {
  if (!DATE_PATTERN.test(value)) throw new Error(`${flag} must be YYYYMMDD; got "${value}".`);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${flag} is not a real calendar date: "${value}".`);
  }
  return value;
}

export function parseRecoveryDays(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`--recovery-days must be a positive integer; got "${value}".`);
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days <= 0) {
    throw new Error(`--recovery-days must be a positive integer; got "${value}".`);
  }
  return days;
}

export interface IScorecardArgs {
  window: IScorecardWindow;
  recoveryDays: number;
}

/** Parses and validates CLI args before any external API request is made. */
export function parseScorecardArgs(argv: string[], now: Date = new Date()): IScorecardArgs {
  const withValues = new Set(['--start', '--end', '--recovery-days']);
  const raw: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!withValues.has(arg)) throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value.`);
    raw[arg] = value;
    index += 1;
  }

  const fallback = getDefaultWindow(now);
  const startDate = raw['--start']
    ? parseCalendarDate(raw['--start'], '--start')
    : fallback.startDate;
  const endDate = raw['--end'] ? parseCalendarDate(raw['--end'], '--end') : fallback.endDate;
  if (startDate > endDate) throw new Error(`--start ${startDate} is after --end ${endDate}.`);

  const recoveryDays = parseRecoveryDays(raw['--recovery-days'] ?? '30');
  // A huge-but-safe integer still overflows the Date range, which would otherwise throw
  // only after the external Amplitude/Stripe calls have already run.
  if (Number.isNaN(new Date(now.getTime() - recoveryDays * 86_400_000).getTime())) {
    throw new Error(`--recovery-days ${recoveryDays} is too large to form a valid Date.`);
  }

  return { window: { startDate, endDate }, recoveryDays };
}

export async function runScorecard(argv: string[]): Promise<void> {
  if (argv.includes('--help')) {
    console.log(
      'Usage: yarn diag:paid-funnel [--start YYYYMMDD] [--end YYYYMMDD] [--recovery-days 30]'
    );
    return;
  }

  const { window, recoveryDays } = parseScorecardArgs(argv);
  await printFunnel(window);
  await printStripe(window);
  await printRecoveryDelivery(recoveryDays);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runScorecard(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
