import { describe, expect, test } from 'vitest';
import {
  assertReadOnlyMode,
  getAmplitudeStableId,
  getStripeStableId,
  parseCliArgs,
  reconcileRevenueTelemetry,
  type IRevenueTelemetryInput,
} from '@/scripts/reconcile-revenue-telemetry';

const WINDOW_START = '2026-07-01T00:00:00.000Z';
const WINDOW_END = '2026-08-01T00:00:00.000Z';

function baseInput(overrides: Partial<IRevenueTelemetryInput> = {}): IRevenueTelemetryInput {
  return {
    mode: 'test',
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    metadata: {
      deployedCommitSha: 'abc123',
      amplitudeProjectLabel: 'local fixture project',
      amplitudeProjectSelectedBy: 'manual',
      stripeWebhookEndpointMode: 'test',
      enabledEventTypes: ['checkout.session.completed'],
      stripeObjectTotals30d: { paid_invoices: 2 },
    },
    stripeRecords: [],
    amplitudeEvents: [],
    ...overrides,
  };
}

describe('reconcile-revenue-telemetry script helpers', () => {
  test('matches stable billing IDs and keeps test/live records explicitly separated', () => {
    const report = reconcileRevenueTelemetry(
      baseInput({
        stripeRecords: [
          {
            kind: 'paid_invoice',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:00.000Z',
            stableId: 'in_test_1',
            amountCents: 500,
          },
          {
            kind: 'paid_invoice',
            mode: 'live',
            occurredAt: '2026-07-10T12:00:00.000Z',
            stableId: 'in_live_1',
            amountCents: 900,
          },
        ],
        amplitudeEvents: [
          {
            eventName: 'revenue_received',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:01.000Z',
            properties: { sourceObjectId: 'in_test_1' },
            amountCents: 500,
          },
          {
            eventName: 'revenue_received',
            mode: 'live',
            occurredAt: '2026-07-10T12:00:01.000Z',
            properties: { sourceObjectId: 'in_live_1' },
            amountCents: 900,
          },
        ],
      })
    );

    const paidInvoices = report.checks.find(check => check.key === 'paid_invoices')!;
    expect(paidInvoices.matchedStableIds).toEqual(['in_test_1']);
    expect(paidInvoices.unmatchedStripeStableIds).toEqual([]);
    expect(paidInvoices.unmatchedAmplitudeStableIds).toEqual([]);
    expect(report.modeSeparation).toMatchObject({
      stripeRecordsByMode: { test: 1, live: 1 },
      amplitudeEventsByMode: { test: 1, live: 1 },
      foreignStripeRecords: 1,
      foreignAmplitudeEvents: 1,
    });
    expect(report.readOnly).toBe(true);
  });

  test('reports unmatched IDs, amount mismatches, and the default producer category', () => {
    const report = reconcileRevenueTelemetry(
      baseInput({
        stripeRecords: [
          {
            kind: 'paid_invoice',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:00.000Z',
            stableId: 'in_1',
            amountCents: 500,
          },
          {
            kind: 'paid_invoice',
            mode: 'test',
            occurredAt: '2026-07-10T12:01:00.000Z',
            stableId: 'in_2',
            amountCents: 500,
          },
        ],
        amplitudeEvents: [
          {
            eventName: 'revenue_received',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:01.000Z',
            properties: { sourceObjectId: 'in_1' },
            amountCents: 400,
          },
          {
            eventName: 'revenue_received',
            mode: 'test',
            occurredAt: '2026-07-10T12:02:00.000Z',
            properties: { sourceObjectId: 'in_3' },
            amountCents: 500,
          },
        ],
      })
    );

    const paidInvoices = report.checks.find(check => check.key === 'paid_invoices')!;
    expect(paidInvoices.unmatchedStripeStableIds).toEqual(['in_2']);
    expect(paidInvoices.unmatchedAmplitudeStableIds).toEqual(['in_3']);
    expect(paidInvoices.amountComparison.withinTolerance).toBe(false);
    expect(paidInvoices.mismatches.some(mismatch => mismatch.category === 'producer')).toBe(true);
    expect(report.mismatchCategoryCounts.producer).toBeGreaterThan(0);
  });

  test('separates zero-dollar records and reports missing stable IDs without exposing payloads', () => {
    const report = reconcileRevenueTelemetry(
      baseInput({
        stripeRecords: [
          {
            kind: 'paid_invoice',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:00.000Z',
            stableId: 'in_zero',
            amountCents: 0,
          },
          {
            kind: 'paid_invoice',
            mode: 'test',
            occurredAt: '2026-07-10T12:01:00.000Z',
            amountCents: 500,
            handlerOutcome: 'emitted',
          },
        ],
        amplitudeEvents: [
          {
            eventName: 'revenue_received',
            mode: 'test',
            occurredAt: '2026-07-10T12:00:01.000Z',
            properties: { sourceObjectId: 'in_zero' },
            amountCents: 0,
          },
        ],
      })
    );

    const paidInvoices = report.checks.find(check => check.key === 'paid_invoices')!;
    expect(paidInvoices.stripe.zeroDollar).toBe(1);
    expect(paidInvoices.amplitude.zeroDollar).toBe(1);
    expect(paidInvoices.stripe.eligible).toBe(1);
    expect(paidInvoices.stripe.missingStableId).toBe(1);
    expect(paidInvoices.amplitude.missingStableId).toBe(0);
    expect(JSON.stringify(report)).not.toContain('handler secret');
  });

  test('requires explicit mode separation and a live-read acknowledgment', () => {
    expect(() => assertReadOnlyMode({ mode: undefined, allowLiveRead: false })).toThrow(
      'explicit --mode'
    );
    expect(() => parseCliArgs(['--mode', 'live', '--input', 'export.json'])).toThrow(
      '--allow-live-read'
    );
    expect(parseCliArgs(['--mode', 'live', '--input', 'export.json', '--allow-live-read'])).toEqual(
      {
        mode: 'live',
        inputPath: 'export.json',
        allowLiveRead: true,
        help: false,
      }
    );
  });

  test('rejects secret-bearing metadata fields', () => {
    expect(() =>
      reconcileRevenueTelemetry(
        baseInput({ metadata: { stripeApiKey: 'must-not-be-printed' } as never })
      )
    ).toThrow('credentials');
  });

  test('does not use email addresses as stable billing correlation IDs', () => {
    expect(
      getStripeStableId({
        kind: 'paid_invoice',
        mode: 'test',
        occurredAt: WINDOW_START,
        stableId: 'customer@example.com',
      })
    ).toBeUndefined();
    expect(
      getAmplitudeStableId({
        eventName: 'revenue_received',
        mode: 'test',
        occurredAt: WINDOW_START,
        properties: { sourceObjectId: 'customer@example.com' },
      })
    ).toBeUndefined();
  });
});
