import { describe, expect, test } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@app/api/checkout/route';
import { parseFunnelCheckoutAttribution } from '@app/api/checkout/funnel-attribution';

describe('checkout funnel contract', () => {
  test('should preserve acquisition and landing-page fields through checkout', () => {
    expect(
      parseFunnelCheckoutAttribution({
        funnel_schema_version: '1',
        first_touch_source: 'google',
        first_touch_medium: 'cpc',
        first_touch_landing_page: '/tools/ai-image-upscaler',
        landing_page_family: 'tools',
        device_type: 'mobile',
        is_pseo_landing: 'true',
      })
    ).toEqual({
      funnel_schema_version: '1',
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
});
