import { expect, test } from '@playwright/test';
import { resetTestUser } from '../helpers/test-user-reset';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe('API: Subscription Change Flow', () => {
  test.describe('Preview Change', () => {
    test('should reject requests without authorization', async ({ request }) => {
      const response = await request.post('/api/subscription/preview-change', {
        data: { targetPriceId: 'price_test_123' },
      });
      expect(response.status()).toBe(401);
    });

    test('should reject requests without targetPriceId', async ({ request }) => {
      const testUser = await resetTestUser();
      const response = await request.post('/api/subscription/preview-change', {
        data: {},
        headers: {
          authorization: `Bearer ${testUser.access_token}`,
        },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('MISSING_PRICE_ID');
    });

    test('should reject requests with invalid targetPriceId', async ({ request }) => {
      const testUser = await resetTestUser();
      const response = await request.post('/api/subscription/preview-change', {
        data: { targetPriceId: 'price_invalid_123' },
        headers: {
          authorization: `Bearer ${testUser.access_token}`,
        },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('INVALID_PRICE_ID');
    });
  });

  test.describe('Execute Change', () => {
    test('should reject requests without authorization', async ({ request }) => {
      const response = await request.post('/api/subscription/change', {
        data: { targetPriceId: 'price_test_123' },
      });
      expect(response.status()).toBe(401);
    });

    test('should reject requests without targetPriceId', async ({ request }) => {
      const testUser = await resetTestUser();
      const response = await request.post('/api/subscription/change', {
        data: {},
        headers: {
          authorization: `Bearer ${testUser.access_token}`,
        },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('MISSING_PRICE_ID');
    });

    test('should reject requests with invalid targetPriceId', async ({ request }) => {
      const testUser = await resetTestUser();
      const response = await request.post('/api/subscription/change', {
        data: { targetPriceId: 'price_invalid_123' },
        headers: {
          authorization: `Bearer ${testUser.access_token}`,
        },
      });
      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('INVALID_PRICE_ID');
    });

    test('should reject change if user has no active subscription', async ({ request }) => {
      const testUser = await resetTestUser();

      // Ensure user has stripe customer id but no subscription
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!);
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: 'cus_test_no_sub' })
        .eq('id', testUser.id);

      // Get a valid price ID
      const { STRIPE_PRICES } = await import('@shared/config/stripe');

      const response = await request.post('/api/subscription/change', {
        data: { targetPriceId: STRIPE_PRICES.PRO_MONTHLY },
        headers: {
          authorization: `Bearer ${testUser.access_token}`,
        },
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error.code).toBe('NO_ACTIVE_SUBSCRIPTION');
    });
  });
});
