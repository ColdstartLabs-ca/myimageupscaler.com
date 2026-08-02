import { describe, expect, it } from 'vitest';
import { buildMonetizationSurfaceEvent } from '@client/analytics/analyticsClient';

describe('canonical monetization surface events', () => {
  it('normalizes a prompt impression into bounded KPI properties', () => {
    const event = buildMonetizationSurfaceEvent('upgrade_prompt_shown', {
      trigger: 'After Upscale',
      selectedType: 'credit_pack',
      priceId: 'price_pack_small',
      priceCents: 499,
      pricingRegion: 'South Asia',
      funnelAttemptId: 'fa_surface_123',
      landingPage: 'https://private.example/?email=user@example.com',
    });

    expect(event).toEqual({
      eventName: 'monetization_surface_shown',
      properties: {
        surface: 'after_upscale',
        trigger: 'after_upscale',
        offerType: 'credit_pack',
        priceId: 'price_pack_small',
        priceCents: 499,
        pricingRegion: 'south_asia',
        funnelAttemptId: 'fa_surface_123',
      },
    });
    expect(JSON.stringify(event)).not.toContain('private.example');
  });

  it('normalizes a CTA click and creates a stable fallback attempt ID', () => {
    const event = buildMonetizationSurfaceEvent('upgrade_prompt_clicked', {
      trigger: 'model gate',
      destination: 'billing modal',
      selectedKey: 'pro',
    });

    expect(event.eventName).toBe('monetization_surface_clicked');
    expect(event.properties).toEqual(
      expect.objectContaining({
        surface: 'model_gate',
        trigger: 'model_gate',
        cta: 'pro',
        destination: 'billing_modal',
      })
    );
    expect(event.properties.funnelAttemptId).toMatch(/^session_/);
  });
});
