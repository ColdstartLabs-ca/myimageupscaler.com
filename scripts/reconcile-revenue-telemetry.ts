/**
 * Offline reconciliation of Stripe billing exports against Amplitude exports.
 *
 * This module deliberately has no SDK or network dependency. A caller supplies
 * read-only exports, selects exactly one Stripe mode, and receives a report that
 * never includes credentials or raw provider payloads.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export type TEnvironmentMode = 'test' | 'live';

export type TBillingRecordKind =
  | 'created_subscription'
  | 'paid_invoice'
  | 'renewal_invoice'
  | 'completed_checkout_session'
  | 'deleted_subscription'
  | 'failed_payment'
  | 'successful_charge';

export type TMismatchCategory =
  | 'producer'
  | 'webhook_delivery'
  | 'handler'
  | 'environment_routing'
  | 'ingestion'
  | 'taxonomy'
  | 'dashboard_query';

export type THandlerOutcome = 'emitted' | 'not_emitted' | 'failed' | 'not_invoked';

export const REVENUE_RECONCILIATION_TOLERANCE_RATIO = 0.005;

export const RECONCILIATION_SPECS = [
  {
    key: 'created_subscriptions',
    stripeKind: 'created_subscription',
    amplitudeEvent: 'subscription_created',
  },
  {
    key: 'paid_invoices',
    stripeKind: 'paid_invoice',
    amplitudeEvent: 'revenue_received',
  },
  {
    key: 'renewal_invoices',
    stripeKind: 'renewal_invoice',
    amplitudeEvent: 'subscription_renewed',
  },
  {
    key: 'completed_checkout_sessions',
    stripeKind: 'completed_checkout_session',
    amplitudeEvent: 'checkout_completed',
  },
  {
    key: 'deleted_subscriptions',
    stripeKind: 'deleted_subscription',
    amplitudeEvent: 'subscription_canceled',
  },
  {
    key: 'failed_payments',
    stripeKind: 'failed_payment',
    amplitudeEvent: 'payment_failed',
  },
  {
    key: 'successful_charges',
    stripeKind: 'successful_charge',
    amplitudeEvent: 'purchase_confirmed',
  },
] as const;

type TReconciliationSpec = (typeof RECONCILIATION_SPECS)[number];

export interface IStripeBillingRecord {
  kind: TBillingRecordKind;
  mode: TEnvironmentMode;
  occurredAt: string;
  stableId?: string;
  id?: string;
  amountCents?: number;
  currency?: string;
  zeroDollar?: boolean;
  webhookDelivered?: boolean;
  handlerOutcome?: THandlerOutcome;
}

export interface IAmplitudeBillingEvent {
  eventName: string;
  mode: TEnvironmentMode;
  occurredAt: string;
  stableId?: string;
  id?: string;
  amountCents?: number;
  currency?: string;
  properties?: Record<string, unknown>;
  zeroDollar?: boolean;
  ingestionStatus?: 'received' | 'missing' | 'failed';
  dashboardIncluded?: boolean;
}

export interface IReconciliationMetadata {
  deployedCommitSha?: string;
  amplitudeProjectLabel?: string;
  amplitudeProjectSelectedBy?: 'server_key' | 'client_key' | 'manual' | 'unknown';
  stripeWebhookEndpointMode?: TEnvironmentMode | 'unknown';
  enabledEventTypes?: string[];
  stripeObjectTotals30d?: Record<string, number>;
}

export interface IRevenueTelemetryInput {
  mode: TEnvironmentMode;
  windowStart: string;
  windowEnd: string;
  metadata: IReconciliationMetadata;
  stripeRecords: readonly IStripeBillingRecord[];
  amplitudeEvents: readonly IAmplitudeBillingEvent[];
}

export interface IReconciliationMismatch {
  stableId?: string;
  stripeKind?: TBillingRecordKind;
  amplitudeEvent?: string;
  category: TMismatchCategory;
  reason: string;
}

export interface IAmountComparison {
  stripeAmountCents: number;
  amplitudeAmountCents: number;
  differenceCents: number;
  differenceRatio: number | null;
  withinTolerance: boolean | null;
  knownStripeAmountCount: number;
  knownAmplitudeAmountCount: number;
}

export interface IReconciliationCheckResult {
  key: string;
  stripeKind: TBillingRecordKind;
  amplitudeEvent: string;
  stripe: {
    total: number;
    eligible: number;
    zeroDollar: number;
    missingStableId: number;
    amountCents: number;
    foreignMode: number;
    duplicateStableIds: string[];
  };
  amplitude: {
    total: number;
    eligible: number;
    zeroDollar: number;
    missingStableId: number;
    amountCents: number;
    foreignMode: number;
    duplicateStableIds: string[];
  };
  matchedStableIds: string[];
  unmatchedStripeStableIds: string[];
  unmatchedAmplitudeStableIds: string[];
  amountComparison: IAmountComparison;
  mismatches: IReconciliationMismatch[];
}

export interface IReconciliationReport {
  reportType: 'revenue_telemetry_reconciliation';
  readOnly: true;
  source: 'local_export';
  mode: TEnvironmentMode;
  windowStart: string;
  windowEnd: string;
  metadata: IReconciliationMetadata;
  modeSeparation: {
    stripeRecordsByMode: Record<TEnvironmentMode, number>;
    amplitudeEventsByMode: Record<TEnvironmentMode, number>;
    foreignStripeRecords: number;
    foreignAmplitudeEvents: number;
  };
  checks: IReconciliationCheckResult[];
  mismatchCategoryCounts: Record<TMismatchCategory, number>;
  unmatchedStableIds: Array<{
    check: string;
    stripe: string[];
    amplitude: string[];
  }>;
}

export interface IReadOnlyCliOptions {
  mode?: TEnvironmentMode;
  inputPath?: string;
  allowLiveRead: boolean;
  help: boolean;
}

const MISMATCH_CATEGORIES: readonly TMismatchCategory[] = [
  'producer',
  'webhook_delivery',
  'handler',
  'environment_routing',
  'ingestion',
  'taxonomy',
  'dashboard_query',
];

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asStableObjectId(value: unknown): string | undefined {
  const normalized = asNonEmptyString(value);
  return normalized && !normalized.includes('@') ? normalized : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function assertValidTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid ISO timestamp.`);
  }
  return parsed;
}

function isWithinWindow(timestamp: string, windowStart: number, windowEnd: number): boolean {
  const parsed = assertValidTimestamp(timestamp, 'Record timestamp');
  return parsed >= windowStart && parsed < windowEnd;
}

function isZeroDollar(amountCents: number | undefined, explicit: boolean | undefined): boolean {
  return explicit === true || amountCents === 0;
}

function getPropertyString(
  properties: Record<string, unknown> | undefined,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = asNonEmptyString(properties?.[key]);
    if (value) return value;
  }
  return undefined;
}

const AMPLITUDE_ID_KEYS: Record<string, readonly string[]> = {
  subscription_created: ['subscriptionId'],
  subscription_renewed: ['invoiceId', 'sourceObjectId'],
  subscription_canceled: ['subscriptionId'],
  revenue_received: ['sourceObjectId', 'invoiceId', 'chargeId'],
  checkout_completed: ['sessionId', 'stripeCheckoutSessionId'],
  payment_failed: ['sourceObjectId', 'chargeId', 'invoiceId', 'paymentIntentId'],
  purchase_confirmed: ['stripeCheckoutSessionId', 'invoiceId', 'sourceObjectId', 'chargeId'],
};

export function getStripeStableId(record: IStripeBillingRecord): string | undefined {
  return asStableObjectId(record.stableId) ?? asStableObjectId(record.id);
}

export function getAmplitudeStableId(event: IAmplitudeBillingEvent): string | undefined {
  return (
    asStableObjectId(event.stableId) ??
    asStableObjectId(event.id) ??
    asStableObjectId(
      getPropertyString(event.properties, AMPLITUDE_ID_KEYS[event.eventName] ?? ['sourceObjectId'])
    )
  );
}

function getSpecForKind(kind: TBillingRecordKind): TReconciliationSpec {
  const spec = RECONCILIATION_SPECS.find(candidate => candidate.stripeKind === kind);
  if (!spec) throw new Error(`Unsupported billing record kind: ${kind}`);
  return spec;
}

function createEmptyCategoryCounts(): Record<TMismatchCategory, number> {
  return MISMATCH_CATEGORIES.reduce(
    (counts, category) => ({ ...counts, [category]: 0 }),
    {} as Record<TMismatchCategory, number>
  );
}

function hasModeMismatch(
  mode: TEnvironmentMode,
  stripeRecord: IStripeBillingRecord | undefined,
  amplitudeEvent: IAmplitudeBillingEvent | undefined
): boolean {
  return Boolean(
    (stripeRecord && stripeRecord.mode !== mode) || (amplitudeEvent && amplitudeEvent.mode !== mode)
  );
}

/**
 * Classifies one mismatch from explicit evidence. Without causal evidence the
 * result is deliberately `producer` with a reason that asks for follow-up;
 * this is a category assignment, not a claim about production root cause.
 */
export function classifyMismatch({
  mode,
  expectedEventName,
  stripeRecord,
  amplitudeEvent,
}: {
  mode: TEnvironmentMode;
  expectedEventName: string;
  stripeRecord?: IStripeBillingRecord;
  amplitudeEvent?: IAmplitudeBillingEvent;
}): TMismatchCategory {
  if (hasModeMismatch(mode, stripeRecord, amplitudeEvent)) return 'environment_routing';
  if (amplitudeEvent && amplitudeEvent.eventName !== expectedEventName) return 'taxonomy';
  if (amplitudeEvent?.dashboardIncluded === false) return 'dashboard_query';
  if (amplitudeEvent?.ingestionStatus === 'failed') return 'ingestion';
  if (stripeRecord?.webhookDelivered === false) return 'webhook_delivery';
  if (
    stripeRecord?.handlerOutcome === 'failed' ||
    stripeRecord?.handlerOutcome === 'not_invoked' ||
    stripeRecord?.handlerOutcome === 'not_emitted'
  ) {
    return 'handler';
  }
  if (stripeRecord?.handlerOutcome === 'emitted' && !amplitudeEvent) return 'ingestion';
  return 'producer';
}

function describeMismatch(category: TMismatchCategory, hasStableId: boolean): string {
  const suffix = hasStableId ? '' : ' Stable ID is missing from the supplied export.';
  switch (category) {
    case 'environment_routing':
      return `Record belongs to the other Stripe/Amplitude mode.${suffix}`;
    case 'webhook_delivery':
      return `Stripe webhook delivery evidence says the event was not delivered.${suffix}`;
    case 'handler':
      return `Webhook handler evidence says the canonical event was not emitted.${suffix}`;
    case 'ingestion':
      return `Canonical event was emitted or expected, but ingestion evidence is incomplete or failed.${suffix}`;
    case 'taxonomy':
      return `An event with the stable ID used a different event name than the canonical mapping.${suffix}`;
    case 'dashboard_query':
      return `The event exists but dashboard inclusion evidence is false.${suffix}`;
    case 'producer':
    default:
      return `No more specific causal evidence was supplied; validate producer and handler records.${suffix}`;
  }
}

function countByStableId<T>(
  records: readonly T[],
  getId: (record: T) => string | undefined
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const stableId = getId(record);
    if (!stableId) continue;
    const existing = grouped.get(stableId) ?? [];
    existing.push(record);
    grouped.set(stableId, existing);
  }
  return grouped;
}

function duplicateIds<T>(
  records: readonly T[],
  getId: (record: T) => string | undefined
): string[] {
  return [...countByStableId(records, getId).entries()]
    .filter(([, grouped]) => grouped.length > 1)
    .map(([stableId]) => stableId)
    .sort();
}

function sumKnownAmounts<T>(
  records: readonly T[],
  getAmount: (record: T) => number | undefined
): { sum: number; knownCount: number } {
  return records.reduce(
    (result, record) => {
      const amount = getAmount(record);
      if (amount === undefined) return result;
      return { sum: result.sum + amount, knownCount: result.knownCount + 1 };
    },
    { sum: 0, knownCount: 0 }
  );
}

function compareAmounts(
  stripeRecords: readonly IStripeBillingRecord[],
  amplitudeEvents: readonly IAmplitudeBillingEvent[]
): IAmountComparison {
  const stripe = sumKnownAmounts(stripeRecords, record => asFiniteNumber(record.amountCents));
  const amplitude = sumKnownAmounts(amplitudeEvents, event => asFiniteNumber(event.amountCents));
  const differenceCents = amplitude.sum - stripe.sum;
  const differenceRatio =
    stripe.sum === 0 ? null : Math.abs(differenceCents) / Math.abs(stripe.sum);

  return {
    stripeAmountCents: stripe.sum,
    amplitudeAmountCents: amplitude.sum,
    differenceCents,
    differenceRatio,
    withinTolerance:
      stripe.knownCount === 0 || amplitude.knownCount === 0
        ? null
        : differenceRatio !== null && differenceRatio <= REVENUE_RECONCILIATION_TOLERANCE_RATIO,
    knownStripeAmountCount: stripe.knownCount,
    knownAmplitudeAmountCount: amplitude.knownCount,
  };
}

function assertSafeMetadata(metadata: IReconciliationMetadata): IReconciliationMetadata {
  for (const key of Object.keys(metadata)) {
    if (/secret|token|password|api.?key/i.test(key)) {
      throw new Error(
        'Reconciliation metadata cannot contain credentials or secret-bearing fields.'
      );
    }
  }

  return {
    ...metadata,
    enabledEventTypes: metadata.enabledEventTypes?.filter(value =>
      Boolean(asNonEmptyString(value))
    ),
    stripeObjectTotals30d: metadata.stripeObjectTotals30d
      ? Object.fromEntries(
          Object.entries(metadata.stripeObjectTotals30d).filter(
            ([, value]) => Number.isFinite(value) && value >= 0
          )
        )
      : undefined,
  };
}

function buildCheckResult(
  spec: TReconciliationSpec,
  mode: TEnvironmentMode,
  stripeRecords: readonly IStripeBillingRecord[],
  allStripeRecords: readonly IStripeBillingRecord[],
  amplitudeEvents: readonly IAmplitudeBillingEvent[],
  allAmplitudeEvents: readonly IAmplitudeBillingEvent[],
  categoryCounts: Record<TMismatchCategory, number>
): IReconciliationCheckResult {
  const stripeForSpec = stripeRecords.filter(record => record.kind === spec.stripeKind);
  const allStripeForSpec = allStripeRecords.filter(record => record.kind === spec.stripeKind);
  const amplitudeForSpec = amplitudeEvents.filter(event => event.eventName === spec.amplitudeEvent);
  const allAmplitudeForExpectedEvent = allAmplitudeEvents.filter(
    event => event.eventName === spec.amplitudeEvent
  );

  const eligibleStripe = stripeForSpec.filter(
    record => !isZeroDollar(record.amountCents, record.zeroDollar)
  );
  const eligibleAmplitude = amplitudeForSpec.filter(
    event => !isZeroDollar(event.amountCents, event.zeroDollar)
  );
  const stripeById = countByStableId(eligibleStripe, getStripeStableId);
  const amplitudeById = countByStableId(eligibleAmplitude, getAmplitudeStableId);
  const allAmplitudeById = countByStableId(allAmplitudeEvents, getAmplitudeStableId);
  const foreignStripe = allStripeForSpec.filter(record => record.mode !== mode);
  const foreignAmplitude = allAmplitudeForExpectedEvent.filter(event => event.mode !== mode);
  const mismatches: IReconciliationMismatch[] = [];
  const matchedStableIds = new Set<string>();
  const unmatchedStripeStableIds = new Set<string>();
  const unmatchedAmplitudeStableIds = new Set<string>();
  let missingStripeStableId = 0;
  let missingAmplitudeStableId = 0;

  for (const record of eligibleStripe) {
    const stableId = getStripeStableId(record);
    if (!stableId) {
      missingStripeStableId += 1;
      const category = classifyMismatch({
        mode,
        expectedEventName: spec.amplitudeEvent,
        stripeRecord: record,
      });
      categoryCounts[category] += 1;
      mismatches.push({
        stripeKind: record.kind,
        category,
        reason: describeMismatch(category, false),
      });
      continue;
    }

    const matchingEvents = amplitudeById.get(stableId) ?? [];
    if (matchingEvents.length === 0) {
      unmatchedStripeStableIds.add(stableId);
      const foreignEvent = foreignAmplitude.find(event => getAmplitudeStableId(event) === stableId);
      const wrongTaxonomyEvent = allAmplitudeById
        .get(stableId)
        ?.find(event => event.eventName !== spec.amplitudeEvent);
      const amplitudeEvent = foreignEvent ?? wrongTaxonomyEvent;
      const category = classifyMismatch({
        mode,
        expectedEventName: spec.amplitudeEvent,
        stripeRecord: record,
        amplitudeEvent,
      });
      categoryCounts[category] += 1;
      mismatches.push({
        stableId,
        stripeKind: record.kind,
        amplitudeEvent: amplitudeEvent?.eventName,
        category,
        reason: describeMismatch(category, true),
      });
      continue;
    }

    matchedStableIds.add(stableId);
    if (matchingEvents.length > 1 || (stripeById.get(stableId)?.length ?? 0) > 1) {
      categoryCounts.ingestion += 1;
      mismatches.push({
        stableId,
        stripeKind: record.kind,
        amplitudeEvent: spec.amplitudeEvent,
        category: 'ingestion',
        reason: 'Duplicate stable IDs were supplied for a canonical event.',
      });
    }

    const amplitudeEvent = matchingEvents[0];
    if (
      record.amountCents !== undefined &&
      amplitudeEvent.amountCents !== undefined &&
      record.amountCents !== amplitudeEvent.amountCents
    ) {
      categoryCounts.producer += 1;
      mismatches.push({
        stableId,
        stripeKind: record.kind,
        amplitudeEvent: spec.amplitudeEvent,
        category: 'producer',
        reason: 'Matched stable IDs have different supplied amounts.',
      });
    }
  }

  for (const event of eligibleAmplitude) {
    const stableId = getAmplitudeStableId(event);
    if (!stableId) {
      missingAmplitudeStableId += 1;
      const category = classifyMismatch({
        mode,
        expectedEventName: spec.amplitudeEvent,
        amplitudeEvent: event,
      });
      categoryCounts[category] += 1;
      mismatches.push({
        amplitudeEvent: event.eventName,
        category,
        reason: describeMismatch(category, false),
      });
      continue;
    }

    if (matchedStableIds.has(stableId)) continue;
    if (stripeById.has(stableId)) continue;

    unmatchedAmplitudeStableIds.add(stableId);
    const foreignStripe = allStripeForSpec.find(record => getStripeStableId(record) === stableId);
    const category = classifyMismatch({
      mode,
      expectedEventName: spec.amplitudeEvent,
      stripeRecord: foreignStripe,
      amplitudeEvent: event,
    });
    categoryCounts[category] += 1;
    mismatches.push({
      stableId,
      stripeKind: foreignStripe?.kind,
      amplitudeEvent: event.eventName,
      category,
      reason: describeMismatch(category, true),
    });
  }

  const duplicateStripeStableIds = duplicateIds(eligibleStripe, getStripeStableId);
  const duplicateAmplitudeStableIds = duplicateIds(eligibleAmplitude, getAmplitudeStableId);
  const amountComparison = compareAmounts(eligibleStripe, eligibleAmplitude);
  const amountMismatchAlreadyReported = mismatches.some(
    mismatch => mismatch.reason === 'Matched stable IDs have different supplied amounts.'
  );
  if (amountComparison.withinTolerance === false && !amountMismatchAlreadyReported) {
    categoryCounts.producer += 1;
    mismatches.push({
      stripeKind: spec.stripeKind,
      amplitudeEvent: spec.amplitudeEvent,
      category: 'producer',
      reason: 'Aggregate amounts exceed the 0.5% reconciliation tolerance.',
    });
  }

  return {
    key: spec.key,
    stripeKind: spec.stripeKind,
    amplitudeEvent: spec.amplitudeEvent,
    stripe: {
      total: allStripeForSpec.length,
      eligible: eligibleStripe.length,
      zeroDollar: allStripeForSpec.length - eligibleStripe.length,
      missingStableId: missingStripeStableId,
      amountCents: amountComparison.stripeAmountCents,
      foreignMode: foreignStripe.length,
      duplicateStableIds: duplicateStripeStableIds,
    },
    amplitude: {
      total: allAmplitudeForExpectedEvent.length,
      eligible: eligibleAmplitude.length,
      zeroDollar: allAmplitudeForExpectedEvent.length - eligibleAmplitude.length,
      missingStableId: missingAmplitudeStableId,
      amountCents: amountComparison.amplitudeAmountCents,
      foreignMode: foreignAmplitude.length,
      duplicateStableIds: duplicateAmplitudeStableIds,
    },
    matchedStableIds: [...matchedStableIds].sort(),
    unmatchedStripeStableIds: [...unmatchedStripeStableIds].sort(),
    unmatchedAmplitudeStableIds: [...unmatchedAmplitudeStableIds].sort(),
    amountComparison,
    mismatches,
  };
}

function filterRecordsByWindow<T extends { occurredAt: string }>(
  records: readonly T[],
  windowStart: number,
  windowEnd: number
): T[] {
  return records.filter(record => isWithinWindow(record.occurredAt, windowStart, windowEnd));
}

export function assertReadOnlyMode({
  mode,
  allowLiveRead,
}: {
  mode: TEnvironmentMode | undefined;
  allowLiveRead: boolean;
}): asserts mode is TEnvironmentMode {
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('An explicit --mode test or --mode live is required.');
  }
  if (mode === 'live' && !allowLiveRead) {
    throw new Error('Live mode requires the explicit --allow-live-read acknowledgment.');
  }
}

export function reconcileRevenueTelemetry(input: IRevenueTelemetryInput): IReconciliationReport {
  if (input.mode !== 'test' && input.mode !== 'live') {
    throw new Error('Reconciliation mode must be exactly test or live.');
  }
  const windowStart = assertValidTimestamp(input.windowStart, 'windowStart');
  const windowEnd = assertValidTimestamp(input.windowEnd, 'windowEnd');
  if (windowEnd <= windowStart) throw new Error('windowEnd must be after windowStart.');

  const allStripeRecords = filterRecordsByWindow(input.stripeRecords, windowStart, windowEnd);
  const allAmplitudeEvents = filterRecordsByWindow(input.amplitudeEvents, windowStart, windowEnd);
  const stripeRecords = allStripeRecords.filter(record => record.mode === input.mode);
  const amplitudeEvents = allAmplitudeEvents.filter(event => event.mode === input.mode);
  const mismatchCategoryCounts = createEmptyCategoryCounts();
  const checks = RECONCILIATION_SPECS.map(spec =>
    buildCheckResult(
      spec,
      input.mode,
      stripeRecords,
      allStripeRecords,
      amplitudeEvents,
      allAmplitudeEvents,
      mismatchCategoryCounts
    )
  );

  return {
    reportType: 'revenue_telemetry_reconciliation',
    readOnly: true,
    source: 'local_export',
    mode: input.mode,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    metadata: assertSafeMetadata(input.metadata),
    modeSeparation: {
      stripeRecordsByMode: {
        test: allStripeRecords.filter(record => record.mode === 'test').length,
        live: allStripeRecords.filter(record => record.mode === 'live').length,
      },
      amplitudeEventsByMode: {
        test: allAmplitudeEvents.filter(event => event.mode === 'test').length,
        live: allAmplitudeEvents.filter(event => event.mode === 'live').length,
      },
      foreignStripeRecords: allStripeRecords.filter(record => record.mode !== input.mode).length,
      foreignAmplitudeEvents: allAmplitudeEvents.filter(event => event.mode !== input.mode).length,
    },
    checks,
    mismatchCategoryCounts,
    unmatchedStableIds: checks.map(check => ({
      check: check.key,
      stripe: check.unmatchedStripeStableIds,
      amplitude: check.unmatchedAmplitudeStableIds,
    })),
  };
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/reconcile-revenue-telemetry.ts --mode test|live --input <export.json> [--allow-live-read]

Reads a local, read-only Stripe/Amplitude export. It never writes data or calls an API.
--allow-live-read is required only when the local export is explicitly marked live.`);
}

export function parseCliArgs(argv: string[]): IReadOnlyCliOptions {
  let mode: TEnvironmentMode | undefined;
  let inputPath: string | undefined;
  let allowLiveRead = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--mode') {
      const value = argv[index + 1];
      if (value !== 'test' && value !== 'live') throw new Error('--mode must be test or live.');
      mode = value;
      index += 1;
      continue;
    }
    if (argument === '--input') {
      inputPath = argv[index + 1];
      if (!inputPath) throw new Error('--input requires a local JSON path.');
      index += 1;
      continue;
    }
    if (argument === '--allow-live-read') {
      allowLiveRead = true;
      continue;
    }
    throw new Error(`Unknown argument ${argument}. Use --help for usage.`);
  }

  if (!help) {
    assertReadOnlyMode({ mode, allowLiveRead });
    if (!inputPath) throw new Error('--input requires a local JSON path.');
  }

  return { mode, inputPath, allowLiveRead, help };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const raw = JSON.parse(await readFile(options.inputPath!, 'utf8')) as IRevenueTelemetryInput;
  if (raw.mode !== options.mode) {
    throw new Error('Input mode must exactly match the explicit CLI --mode value.');
  }
  const report = reconcileRevenueTelemetry(raw);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Unable to build reconciliation report.';
    console.error(message);
    process.exit(1);
  });
}
