import { describe, expect, it } from 'vitest';
import {
  getRetentionKpiDefinition,
  RETENTION_KPI_DEFINITIONS,
} from '@server/analytics/retentionKpiDefinitions';

describe('retention KPI definitions', () => {
  it('covers the PRD decision metric, guardrails, and product-return metrics', () => {
    const keys = RETENTION_KPI_DEFINITIONS.map(definition => definition.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'effective_churn_30d',
        'effective_churn_60d',
        'renewal_rate',
        'incremental_retained_net_revenue_60d',
        'later_cancellation_rate',
        'refund_chargeback_rate',
        'support_complaint_rate',
        'successful_processing_days_before_renewal',
        'second_successful_job_rate',
        'd7_return_rate',
        'd30_return_rate',
        'credits_used_before_renewal',
      ])
    );
  });

  it('keeps formulas and source events present for every metric', () => {
    for (const definition of RETENTION_KPI_DEFINITIONS) {
      expect(definition.formula).toBeTruthy();
      expect(definition.sourceEvents.length).toBeGreaterThan(0);
      expect([
        'denominator',
        'primary_leading',
        'primary_decision',
        'leading',
        'guardrail',
        'product_return',
      ]).toContain(definition.role);
    }
    expect(getRetentionKpiDefinition('effective_churn_60d')?.role).toBe('primary_decision');
  });
});
