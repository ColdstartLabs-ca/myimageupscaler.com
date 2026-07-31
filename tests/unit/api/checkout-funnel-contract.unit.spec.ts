import { describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/checkout/route';
import { parseFunnelCheckoutAttribution } from '@app/api/checkout/funnel-attribution';

describe('checkout funnel contract', () => {
  test('should preserve acquisition and landing-page fields through checkout', () => {
    expect(
      parseFunnelCheckoutAttribution({
        funnel_schema_version: '1',
        funnel_attempt_id: 'fa_checkout_123',
        entry_surface: 'post_download_explore',
        checkout_trigger: 'model_gate',
        checkout_originating_trigger: 'post_download_explore',
        checkout_attribution_chain: 'post_download_explore,model_gate',
        first_touch_source: 'google',
        first_touch_medium: 'cpc',
        first_touch_landing_page: '/tools/ai-image-upscaler',
        landing_page_family: 'tools',
        device_type: 'mobile',
        is_pseo_landing: 'true',
      })
    ).toEqual({
      funnel_schema_version: '1',
      funnel_attempt_id: 'fa_checkout_123',
      entry_surface: 'post_download_explore',
      checkout_trigger: 'model_gate',
      checkout_originating_trigger: 'post_download_explore',
      checkout_attribution_chain: 'post_download_explore,model_gate',
      first_touch_source: 'google',
      first_touch_medium: 'cpc',
      first_touch_landing_page: '/tools/ai-image-upscaler',
      landing_page_family: 'tools',
      device_type: 'mobile',
      is_pseo_landing: 'true',
    });
  });

  test('should reject invalid funnel schema version', async () => {
    const request = new NextRequest('http://localhost/api/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        priceId: 'price_test_valid_format',
        metadata: {
          funnel_schema_version: '999',
          first_touch_source: 'google',
        },
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INVALID_FUNNEL_ATTRIBUTION' },
    });
  });

  test('should reject funnel metadata that exceeds Stripe metadata limits', () => {
    expect(() =>
      parseFunnelCheckoutAttribution({
        funnel_schema_version: '1',
        first_touch_landing_page: 'x'.repeat(501),
      })
    ).toThrow('too long');
  });

  test('should reject invalid attempt IDs and attribution chains longer than five surfaces', () => {
    expect(() =>
      parseFunnelCheckoutAttribution({
        funnel_schema_version: '1',
        funnel_attempt_id: 'user@example.com',
      })
    ).toThrow('Invalid funnel attempt ID');

    expect(() =>
      parseFunnelCheckoutAttribution({
        funnel_schema_version: '1',
        funnel_attempt_id: 'fa_valid_123',
        checkout_attribution_chain: 'one,two,three,four,five,six',
      })
    ).toThrow('Invalid funnel attribution chain');
  });
});
