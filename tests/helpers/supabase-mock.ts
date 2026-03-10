/**
 * Supabase mocking helpers for E2E tests
 *
 * These helpers mock Supabase REST API calls that the frontend makes:
 * - supabase.from('profiles').select('*') → /rest/v1/profiles?id=eq.{userId}
 * - supabase.from('subscriptions').select('*') → /rest/v1/subscriptions?user_id=eq.{userId}...
 * - supabase.rpc('get_user_data', ...) → /rest/v1/rpc/get_user_data
 */

import type { ISubscription, IUserProfile } from '@/shared/types/stripe.types';
import type { ITestUserData } from './auth-helpers';

/**
 * Mock Supabase REST calls for profiles and subscriptions
 * This handles the billing page's direct Supabase calls
 */
export async function mockSupabaseBillingData(
  page: import('@playwright/test').Page,
  userData: Partial<ITestUserData>
): Promise<void> {
  const userId = userData.id || 'test-user-id';
  const profile = userData.profile;
  const subscription = userData.subscription;

  // Mock profiles REST call: /rest/v1/profiles?id=eq.{userId}
  await page.route(`**/rest/v1/profiles?id=eq.${userId}&*`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(profile ? [profile] : []),
    });
  });

  // Also handle profiles call without filters (some code patterns)
  await page.route(`**/rest/v1/profiles**`, async route => {
    const url = route.request().url();
    // Only handle requests for this specific user
    if (url.includes(`id=eq.${userId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile ? [profile] : []),
      });
    } else {
      await route.continue();
    }
  });

  // Mock subscriptions REST call: /rest/v1/subscriptions?user_id=eq.{userId}&status=in.(active,trialing)&order=created_at.desc&limit=1
  await page.route(`**/rest/v1/subscriptions**`, async route => {
    const url = route.request().url();
    // Only handle requests for this specific user
    if (url.includes(`user_id=eq.${userId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(subscription ? [subscription] : []),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock Supabase RPC call for get_user_data
 * This handles the userStore's fetchUserData call
 */
export async function mockSupabaseRpc(
  page: import('@playwright/test').Page,
  userData: Partial<ITestUserData>
): Promise<void> {
  const userId = userData.id || 'test-user-id';
  const profile = userData.profile;
  const subscription = userData.subscription;

  // Mock RPC call: /rest/v1/rpc/get_user_data?target_user_id={userId}
  await page.route(`**/rest/v1/rpc/get_user_data**`, async route => {
    const url = route.request().url();
    // Only handle requests for this specific user
    if (url.includes(`target_user_id=${userId}`) || url.includes(`target_user_id="${userId}"`)) {
      const rpcResponse = {
        profile: profile || null,
        subscription: subscription || null,
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(rpcResponse),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Mock Supabase auth session and user endpoints with correct user ID
 * This fixes the hardcoded 'test-user-id' issue in the original setupAuthenticatedState
 */
export async function mockSupabaseAuth(
  page: import('@playwright/test').Page,
  userData: Partial<ITestUserData>
): Promise<void> {
  const userId = userData.id || 'test-user-id';
  const email = userData.email || 'test@example.com';

  // Mock /auth/v1/session
  await page.route('**/auth/v1/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          access_token: 'fake-test-token',
          user: { id: userId, email, aud: 'authenticated' },
        },
      }),
    });
  });

  // Mock /auth/v1/user
  await page.route('**/auth/v1/user**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: userId,
        email,
        aud: 'authenticated',
      }),
    });
  });
}

/**
 * Mock credit history API endpoint
 */
export async function mockCreditHistory(
  page: import('@playwright/test').Page,
  transactions: Array<{ id: string; amount: number; type: string; created_at: string }> = []
): Promise<void> {
  await page.route('**/api/credits/history**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          transactions,
          pagination: { limit: 50, offset: 0, total: transactions.length },
        },
      }),
    });
  });
}

/**
 * Mock all Supabase-related calls for a test user
 * This is a convenience function that combines all the above mocks
 */
export async function mockSupabaseForUser(
  page: import('@playwright/test').Page,
  userData: Partial<ITestUserData>
): Promise<void> {
  await mockSupabaseAuth(page, userData);
  await mockSupabaseBillingData(page, userData);
  await mockSupabaseRpc(page, userData);
  await mockCreditHistory(page, []);
}

/**
 * Mock Stripe API endpoints for subscription operations
 */
export async function mockStripeSubscriptionEndpoints(
  page: import('@playwright/test').Page,
  options: {
    tier?: string;
    credits?: number;
    status?: string;
    priceId?: string;
    stripeCustomerId?: string;
  } = {}
): Promise<void> {
  const {
    tier = 'hobby',
    credits = 200,
    status = 'active',
    priceId = 'price_hobby_monthly',
    stripeCustomerId = 'cus_test',
  } = options;

  // Mock /api/stripe/profile (if any code still uses this)
  await page.route('**/api/stripe/profile', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        subscription_credits_balance: credits,
        purchased_credits_balance: 0,
        subscription_tier: tier,
        subscription_status: status,
        stripe_customer_id: stripeCustomerId,
      }),
    });
  });

  // Mock /api/stripe/subscription
  await page.route('**/api/stripe/subscription', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `sub_test_${tier}`,
        status,
        price_id: priceId,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        cancel_at_period_end: false,
      }),
    });
  });

  // Mock /api/credits/history (with the correct URL pattern)
  await page.route('**/api/credits/history*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          transactions: [],
          pagination: { limit: 50, offset: 0, total: 0 },
        },
      }),
    });
  });
}
