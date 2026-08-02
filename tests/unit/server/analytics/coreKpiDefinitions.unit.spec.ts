import { describe, expect, it } from 'vitest';
import {
  CORE_KPI_EVENT_DEFINITIONS,
  CORE_KPI_EVENT_NAMES,
  CORE_KPI_RELEASE_ANNOTATION,
  getCoreKpiDefinition,
} from '@server/analytics/coreKpiDefinitions';

describe('core KPI definitions', () => {
  it('contains exactly the PRD section 6 core event set', () => {
    expect(CORE_KPI_EVENT_DEFINITIONS).toHaveLength(19);
    expect(CORE_KPI_EVENT_NAMES).toEqual([
      'account_created',
      'monetization_surface_shown',
      'monetization_surface_clicked',
      'plan_selected',
      'checkout_opened',
      'checkout_error',
      'image_upscaled',
      'processing_failed',
      'checkout_completed',
      'purchase_confirmed',
      'revenue_received',
      'subscription_created',
      'subscription_renewed',
      'subscription_cancel_scheduled',
      'subscription_cancel_reversed',
      'subscription_canceled',
      'payment_failed',
      'payment_recovery_started',
      'payment_recovered',
    ]);
  });

  it('defines owners, source, status, required properties, and KPI role for every event', () => {
    for (const definition of CORE_KPI_EVENT_DEFINITIONS) {
      expect(definition.owner).toBeTruthy();
      expect(definition.source).toBeTruthy();
      expect(definition.status).toBe('active');
      expect(definition.requiredProperties.length).toBeGreaterThan(0);
      expect(definition.kpiRole).toBeTruthy();
    }
  });

  it('keeps revenue and conversion definitions distinct', () => {
    expect(getCoreKpiDefinition('purchase_confirmed')?.kpiRole).toBe('purchase_conversion');
    expect(getCoreKpiDefinition('revenue_received')?.requiredProperties).toContain(
      'sourceObjectId'
    );
    expect(getCoreKpiDefinition('checkout_completed')?.kpiRole).toBe('checkout_funnel_only');
  });

  it('publishes the release annotation used by dashboard consumers', () => {
    expect(CORE_KPI_RELEASE_ANNOTATION.releaseDate).toBe('2026-08-01');
    expect(CORE_KPI_RELEASE_ANNOTATION.preReleaseInterval).toContain('unreliable');
  });
});
