import { test, expect } from '@playwright/test';

/**
 * Post-deploy smoke test: payment checkout pipeline
 *
 * Tests:
 * 1. Pricing page renders with CTAs
 * 2. End-to-end: auth → checkout API → Stripe session created
 *
 * Credentials: paymente2etest@gmail.com / paymente2etest@@
 * (dedicated smoke test account, free tier)
 */

const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || 'paymente2etest@gmail.com';
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || 'paymente2etest@@';
const SUPABASE_URL = 'https://xqysaylskffsfwunczbd.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxeXNheWxza2Zmc2Z3dW5jemJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2OTY2NDYsImV4cCI6MjA3OTI3MjY0Nn0.xAaMqqb05EbFmSn7Pi4piHR22Eibiha0tgTYpcVo9mM';

// Starter plan — cheapest paid plan, smoke test account should be on free tier
const STARTER_PRICE_ID = process.env.SMOKE_PRICE_ID || 'price_1TPoss1I7KzZir1ikF1Wk48f';

test.describe('Checkout smoke tests', () => {
  test('pricing page loads with plan CTAs', async ({ page }) => {
    await page.goto('/pricing');

    const ctaButtons = page.getByRole('button', {
      name: /get started|subscribe|buy now|start for free/i,
    });
    await expect(ctaButtons.first()).toBeVisible({ timeout: 20000 });
  });

  test('checkout pipeline works end-to-end', async ({ request }) => {
    // Step 1: Authenticate directly against Supabase to get access token
    const authRes = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });

    expect(authRes.status(), 'Smoke test account login failed — check credentials').toBe(200);
    const { access_token } = await authRes.json();

    // Step 2: Call checkout API with the real auth token
    // This is the critical check: validates that Stripe secret key + price IDs are correct
    const checkoutRes = await request.post(
      `${process.env.SMOKE_BASE_URL || 'https://myimageupscaler.com'}/api/checkout`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${access_token}`,
        },
        data: { priceId: STARTER_PRICE_ID },
      }
    );

    const body = await checkoutRes.json();

    expect(
      checkoutRes.status(),
      `Checkout API failed (${checkoutRes.status()}): ${JSON.stringify(body?.error)}`
    ).toBe(200);

    // Session created successfully if either clientSecret (embedded) or url (hosted) is present
    const hasSession = body?.data?.clientSecret || body?.data?.url;
    expect(
      hasSession,
      `No session data — Stripe session not created. Response: ${JSON.stringify(body)}`
    ).toBeTruthy();
  });
});
