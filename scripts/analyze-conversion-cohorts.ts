/**
 * Offline February-vs-June cohort decomposition.
 *
 * Input is a local JSON export matching ICohortAnalysisInput. The default privacy/stability
 * threshold suppresses segments with fewer than 20 signups in either compared cohort.
 * This module performs no network requests and must not be imported by request-path code.
 */
import dayjs from 'dayjs';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MIN_SEGMENT_SIGNUPS = 20;
export const MATURITY_WINDOWS_DAYS = [7, 30] as const;

export interface ISignupCohortRow {
  signupId: string;
  signedUpAt: string;
  activatedAt?: string;
  upgradeClickedAt?: string;
  checkoutOpenedAt?: string;
  sourceMedium: string;
  landingPageFamily: string;
  pricingTier: string;
  region: string;
  device: string;
  authState: string;
  isPseo: boolean;
  isInternal?: boolean;
  isTest?: boolean;
}

export interface IPurchaseCohortRow {
  purchaseId: string;
  signupId: string | null;
  confirmedAt: string;
  refunded: boolean;
  isInternal: boolean;
  isTest: boolean;
}

export interface ICohortAnalysisInput {
  asOf: string;
  baselineMonth: string;
  comparisonMonth: string;
  signups: ISignupCohortRow[];
  purchases: IPurchaseCohortRow[];
  minSegmentSignups?: number;
}

interface IFunnelCounts {
  activated: number;
  upgradeClicked: number;
  checkoutOpened: number;
  purchased: number;
}

interface ICohortSummary extends IFunnelCounts {
  month: string;
  signupCount: number;
  rates: IFunnelCounts;
}

interface ISegmentDimensions {
  sourceMedium: string;
  landingPageFamily: string;
  pricingTier: string;
  region: string;
  device: string;
  authState: string;
  isPseo: boolean;
}

type TSegmentDimension = keyof ISegmentDimensions;

type TAction =
  | { kind: 'prd_phase'; prd: string; phase: string; reason: string }
  | { kind: 'no_action'; reason: string };

interface IRankedSegment {
  dimension: TSegmentDimension;
  value: string | boolean;
  baselineSignups: number;
  comparisonSignups: number;
  baselineBuyers: number;
  actualBuyers: number;
  baselineConversionRate: number;
  comparisonConversionRate: number;
  expectedBuyers: number;
  lostBuyers: number;
  action: TAction;
}

interface IWindowAnalysis {
  maturityDays: (typeof MATURITY_WINDOWS_DAYS)[number];
  cohorts: ICohortSummary[];
  decomposition: {
    baselineRate: number;
    comparisonRate: number;
    counterfactualRateAtBaselineSegmentRates: number;
    mixEffectBuyers: number;
    withinSegmentEffectBuyers: number;
    comparableComparisonSignups: number;
  };
  segmentThreshold: number;
  suppressedSegmentCount: number;
  nonComparableSegmentCount: number;
  rankedLostBuyerSegments: IRankedSegment[];
}

export interface ICohortAnalysisResult {
  definitions: {
    cohort: string;
    maturityWindowsDays: readonly [7, 30];
    exclusions: string[];
    segmentThreshold: number;
  };
  purchaseJoinCoverage: {
    eligiblePurchaseCount: number;
    joinedPurchaseCount: number;
    unmatchedPurchaseCount: number;
    joinRate: number;
    meetsNinetyPercentTarget: boolean;
    unmatchedByReason: Record<string, number>;
  };
  windows: IWindowAnalysis[];
}

interface IPreparedSignup {
  row: ISignupCohortRow;
  month: string;
  dimensions: ISegmentDimensions;
}

const rate = (count: number, denominator: number): number =>
  denominator === 0 ? 0 : count / denominator;

function monthOf(timestamp: string): string {
  const value = dayjs(timestamp);
  if (Number.isNaN(value.toDate().getTime())) throw new Error(`Invalid timestamp: ${timestamp}`);
  return value.toDate().toISOString().slice(0, 7);
}

function dimensionsFor(row: ISignupCohortRow): ISegmentDimensions {
  return {
    sourceMedium: row.sourceMedium,
    landingPageFamily: row.landingPageFamily,
    pricingTier: row.pricingTier,
    region: row.region,
    device: row.device,
    authState: row.authState,
    isPseo: row.isPseo,
  };
}

function isWithinWindow(timestamp: string | undefined, signupAt: string, days: number): boolean {
  if (!timestamp) return false;
  const eventTime = dayjs(timestamp).toDate().getTime();
  const signupTime = dayjs(signupAt).toDate().getTime();
  return (
    Number.isFinite(eventTime) &&
    eventTime >= signupTime &&
    eventTime <= signupTime + days * 24 * 60 * 60 * 1000
  );
}

function funnelCounts(
  signups: IPreparedSignup[],
  days: number,
  firstPurchaseBySignup: Map<string, IPurchaseCohortRow>
): IFunnelCounts {
  return signups.reduce<IFunnelCounts>(
    (counts, signup) => {
      const { row } = signup;
      if (isWithinWindow(row.activatedAt, row.signedUpAt, days)) counts.activated += 1;
      if (isWithinWindow(row.upgradeClickedAt, row.signedUpAt, days)) counts.upgradeClicked += 1;
      if (isWithinWindow(row.checkoutOpenedAt, row.signedUpAt, days)) counts.checkoutOpened += 1;
      const purchase = firstPurchaseBySignup.get(row.signupId);
      if (purchase && isWithinWindow(purchase.confirmedAt, row.signedUpAt, days)) {
        counts.purchased += 1;
      }
      return counts;
    },
    { activated: 0, upgradeClicked: 0, checkoutOpened: 0, purchased: 0 }
  );
}

function summarize(
  month: string,
  signups: IPreparedSignup[],
  counts: IFunnelCounts
): ICohortSummary {
  return {
    month,
    signupCount: signups.length,
    ...counts,
    rates: {
      activated: rate(counts.activated, signups.length),
      upgradeClicked: rate(counts.upgradeClicked, signups.length),
      checkoutOpened: rate(counts.checkoutOpened, signups.length),
      purchased: rate(counts.purchased, signups.length),
    },
  };
}

function chooseAction(
  baseline: ICohortSummary,
  comparison: ICohortSummary,
  dimension: TSegmentDimension,
  value: string | boolean
): TAction {
  const regression = {
    activation: baseline.rates.activated - comparison.rates.activated,
    upgrade: baseline.rates.upgradeClicked - comparison.rates.upgradeClicked,
    checkout: baseline.rates.checkoutOpened - comparison.rates.checkoutOpened,
    purchase: baseline.rates.purchased - comparison.rates.purchased,
  };
  const [stage, loss] = Object.entries(regression).sort((left, right) => right[1] - left[1])[0];
  if (loss <= 0) {
    return { kind: 'no_action', reason: 'No within-segment funnel-stage regression was observed.' };
  }
  if (stage === 'activation') {
    return {
      kind: 'prd_phase',
      prd: 'post-download-model-gallery-funnel.md',
      phase: 'Change 2: FirstDownloadCelebration.tsx',
      reason: 'Activation/first-success rate has the largest within-segment decline.',
    };
  }
  if (stage === 'upgrade') {
    return {
      kind: 'prd_phase',
      prd: 'revenue-funnel-telemetry-and-checkout-repair.md',
      phase: 'Phase 4: Upgrade Prompt Attribution and Prompt Mix',
      reason: 'Upgrade-prompt engagement has the largest within-segment decline.',
    };
  }
  if (stage === 'checkout') {
    return {
      kind: 'prd_phase',
      prd: 'click-to-checkout-conversion-fix.md',
      phase:
        dimension === 'device' && value === 'mobile'
          ? 'Phase 3 — Mobile Checkout Audit + Fix'
          : 'Phase 1 — model_gate Direct Checkout',
      reason: 'Checkout entry has the largest within-segment decline.',
    };
  }
  return {
    kind: 'prd_phase',
    prd: 'revenue-funnel-telemetry-and-checkout-repair.md',
    phase: 'Phase 3: Checkout-to-Purchase Failure Audit and Diagnostics',
    reason: 'Checkout-to-confirmed-purchase has the largest within-segment decline.',
  };
}

function analyzeWindow(
  input: ICohortAnalysisInput,
  prepared: IPreparedSignup[],
  firstPurchaseBySignup: Map<string, IPurchaseCohortRow>,
  maturityDays: (typeof MATURITY_WINDOWS_DAYS)[number]
): IWindowAnalysis {
  const asOfTime = dayjs(input.asOf).toDate().getTime();
  const mature = prepared.filter(
    signup =>
      dayjs(signup.row.signedUpAt).toDate().getTime() + maturityDays * 24 * 60 * 60 * 1000 <=
      asOfTime
  );
  const baselineRows = mature.filter(row => row.month === input.baselineMonth);
  const comparisonRows = mature.filter(row => row.month === input.comparisonMonth);
  const baseline = summarize(
    input.baselineMonth,
    baselineRows,
    funnelCounts(baselineRows, maturityDays, firstPurchaseBySignup)
  );
  const comparison = summarize(
    input.comparisonMonth,
    comparisonRows,
    funnelCounts(comparisonRows, maturityDays, firstPurchaseBySignup)
  );
  // Source/medium is the primary mutually-exclusive decomposition axis. Combining every
  // dimension into one key creates hundreds of tiny cells and makes the counterfactual unstable.
  const groups = new Map<string, { baseline: IPreparedSignup[]; comparison: IPreparedSignup[] }>();
  for (const signup of [...baselineRows, ...comparisonRows]) {
    const key = signup.dimensions.sourceMedium;
    const group = groups.get(key) ?? {
      baseline: [],
      comparison: [],
    };
    group[signup.month === input.baselineMonth ? 'baseline' : 'comparison'].push(signup);
    groups.set(key, group);
  }

  const comparable = [...groups.values()].filter(
    group => group.baseline.length > 0 && group.comparison.length > 0
  );
  const comparableComparisonSignups = comparable.reduce(
    (total, group) => total + group.comparison.length,
    0
  );
  let expectedBuyers = 0;
  for (const group of comparable) {
    const baselineSegment = summarize(
      input.baselineMonth,
      group.baseline,
      funnelCounts(group.baseline, maturityDays, firstPurchaseBySignup)
    );
    const comparisonSegment = summarize(
      input.comparisonMonth,
      group.comparison,
      funnelCounts(group.comparison, maturityDays, firstPurchaseBySignup)
    );
    const expected = group.comparison.length * baselineSegment.rates.purchased;
    expectedBuyers += expected;
  }

  // Rank each business dimension independently. Each row remains interpretable and satisfies
  // the minimum sample threshold without hiding losses inside a sparse cross-product.
  const dimensions: TSegmentDimension[] = [
    'sourceMedium',
    'landingPageFamily',
    'pricingTier',
    'region',
    'device',
    'authState',
    'isPseo',
  ];
  const dimensionGroups = new Map<
    string,
    {
      dimension: TSegmentDimension;
      value: string | boolean;
      baseline: IPreparedSignup[];
      comparison: IPreparedSignup[];
    }
  >();
  for (const signup of [...baselineRows, ...comparisonRows]) {
    for (const dimension of dimensions) {
      const value = signup.dimensions[dimension];
      const key = `${dimension}:${String(value)}`;
      const group = dimensionGroups.get(key) ?? {
        dimension,
        value,
        baseline: [],
        comparison: [],
      };
      group[signup.month === input.baselineMonth ? 'baseline' : 'comparison'].push(signup);
      dimensionGroups.set(key, group);
    }
  }
  const ranked = [...dimensionGroups.values()]
    .filter(group => group.baseline.length > 0 && group.comparison.length > 0)
    .map(group => {
      const baselineSegment = summarize(
        input.baselineMonth,
        group.baseline,
        funnelCounts(group.baseline, maturityDays, firstPurchaseBySignup)
      );
      const comparisonSegment = summarize(
        input.comparisonMonth,
        group.comparison,
        funnelCounts(group.comparison, maturityDays, firstPurchaseBySignup)
      );
      const expected = group.comparison.length * baselineSegment.rates.purchased;
      return {
        dimension: group.dimension,
        value: group.value,
        baselineSignups: group.baseline.length,
        comparisonSignups: group.comparison.length,
        baselineBuyers: baselineSegment.purchased,
        actualBuyers: comparisonSegment.purchased,
        baselineConversionRate: baselineSegment.rates.purchased,
        comparisonConversionRate: comparisonSegment.rates.purchased,
        expectedBuyers: expected,
        lostBuyers: expected - comparisonSegment.purchased,
        action: chooseAction(baselineSegment, comparisonSegment, group.dimension, group.value),
      };
    });
  const threshold = input.minSegmentSignups ?? MIN_SEGMENT_SIGNUPS;
  const visible = ranked
    .filter(row => row.baselineSignups >= threshold && row.comparisonSignups >= threshold)
    .sort((left, right) => Math.abs(right.lostBuyers) - Math.abs(left.lostBuyers));
  const counterfactualRate = rate(expectedBuyers, comparableComparisonSignups);
  const comparableActualBuyers = comparable.reduce(
    (total, group) =>
      total + funnelCounts(group.comparison, maturityDays, firstPurchaseBySignup).purchased,
    0
  );

  return {
    maturityDays,
    cohorts: [baseline, comparison],
    decomposition: {
      baselineRate: baseline.rates.purchased,
      comparisonRate: comparison.rates.purchased,
      counterfactualRateAtBaselineSegmentRates: counterfactualRate,
      mixEffectBuyers:
        comparableComparisonSignups * (counterfactualRate - baseline.rates.purchased),
      withinSegmentEffectBuyers: comparableActualBuyers - expectedBuyers,
      comparableComparisonSignups,
    },
    segmentThreshold: threshold,
    suppressedSegmentCount: ranked.length - visible.length,
    nonComparableSegmentCount: dimensionGroups.size - ranked.length,
    rankedLostBuyerSegments: visible,
  };
}

export function analyzeConversionCohorts(input: ICohortAnalysisInput): ICohortAnalysisResult {
  if (Number.isNaN(dayjs(input.asOf).toDate().getTime())) {
    throw new Error(`Invalid asOf timestamp: ${input.asOf}`);
  }
  if (!/^\d{4}-\d{2}$/.test(input.baselineMonth) || !/^\d{4}-\d{2}$/.test(input.comparisonMonth)) {
    throw new Error('baselineMonth and comparisonMonth must use YYYY-MM.');
  }
  const signupById = new Map<string, ISignupCohortRow>();
  const prepared = input.signups
    .filter(row => !row.isInternal && !row.isTest)
    .map(row => {
      if (signupById.has(row.signupId)) throw new Error(`Duplicate signupId: ${row.signupId}`);
      signupById.set(row.signupId, row);
      const dimensions = dimensionsFor(row);
      return {
        row,
        month: monthOf(row.signedUpAt),
        dimensions,
      };
    });

  const eligiblePurchases = input.purchases.filter(
    row => !row.refunded && !row.isInternal && !row.isTest
  );
  const unmatchedByReason: Record<string, number> = {};
  const joined: IPurchaseCohortRow[] = [];
  for (const purchase of eligiblePurchases) {
    let reason: string | null = null;
    if (!purchase.signupId) reason = 'missing_signup_id';
    else if (!signupById.has(purchase.signupId)) {
      const excluded = input.signups.some(row => row.signupId === purchase.signupId);
      reason = excluded ? 'excluded_signup' : 'signup_not_found';
    }
    if (reason) unmatchedByReason[reason] = (unmatchedByReason[reason] ?? 0) + 1;
    else joined.push(purchase);
  }
  const firstPurchaseBySignup = new Map<string, IPurchaseCohortRow>();
  for (const purchase of joined.sort((left, right) =>
    left.confirmedAt.localeCompare(right.confirmedAt)
  )) {
    if (purchase.signupId && !firstPurchaseBySignup.has(purchase.signupId)) {
      firstPurchaseBySignup.set(purchase.signupId, purchase);
    }
  }
  const joinRate = rate(joined.length, eligiblePurchases.length);

  return {
    definitions: {
      cohort: 'UTC calendar month of signup; first eligible confirmed purchase only',
      maturityWindowsDays: MATURITY_WINDOWS_DAYS,
      exclusions: ['internal signups/purchases', 'test signups/purchases', 'refunded purchases'],
      segmentThreshold: input.minSegmentSignups ?? MIN_SEGMENT_SIGNUPS,
    },
    purchaseJoinCoverage: {
      eligiblePurchaseCount: eligiblePurchases.length,
      joinedPurchaseCount: joined.length,
      unmatchedPurchaseCount: eligiblePurchases.length - joined.length,
      joinRate,
      meetsNinetyPercentTarget: joinRate >= 0.9,
      unmatchedByReason,
    },
    windows: MATURITY_WINDOWS_DAYS.map(days =>
      analyzeWindow(input, prepared, firstPurchaseBySignup, days)
    ),
  };
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  if (!inputPath)
    throw new Error('Usage: npx tsx scripts/analyze-conversion-cohorts.ts <input.json>');
  const input = JSON.parse(await readFile(inputPath, 'utf8')) as ICohortAnalysisInput;
  console.log(JSON.stringify(analyzeConversionCohorts(input), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
