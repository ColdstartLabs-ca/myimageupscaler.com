/**
 * Authentication helpers for E2E tests
 *
 * These functions help set up authenticated state in tests by injecting
 * user data directly into localStorage, which the userStore reads on initialization.
 */

export interface ITestUserData {
  id: string;
  email: string;
  name?: string;
  provider: string;
  role: 'user' | 'admin';
  profile: {
    id: string;
    email: string;
    role: 'user' | 'admin';
    subscription_credits_balance: number;
    purchased_credits_balance: number;
    subscription_status?: string | null;
    subscription_tier?: string | null;
    stripe_customer_id?: string | null;
    created_at?: string;
    updated_at?: string;
  } | null;
  subscription: {
    id: string;
    user_id?: string;
    status: string;
    price_id: string;
    current_period_start?: string;
    current_period_end?: string;
    trial_end?: string | null;
    cancel_at_period_end?: boolean;
    canceled_at?: string | null;
    created_at?: string;
    updated_at?: string;
    scheduled_price_id?: string | null;
    scheduled_change_date?: string | null;
  } | null;
}

/**
 * Generate the localStorage key for user cache
 * Matches the key used in client/store/userStore.ts
 */
function getUserCacheKey(): string {
  // Uses the same prefix as in the app
  const prefix = process.env.NEXT_PUBLIC_CACHE_USER_KEY_PREFIX || 'myimageupscaler';
  return `${prefix}_user_cache`;
}

/**
 * Generate the Supabase auth storage key used by supabase-js in the browser.
 * Without this, userStore can briefly hydrate from its own cache and then be
 * reset by Supabase's INITIAL_SESSION event with a null session.
 */
function getSupabaseAuthStorageKey(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';

  try {
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return 'sb-example-auth-token';
  }
}

/**
 * Create test user data with default values
 */
export function createTestUser(overrides?: Partial<ITestUserData>): ITestUserData {
  const defaultUser: ITestUserData = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    provider: 'email',
    role: 'user',
    profile: {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      subscription_credits_balance: 1000,
      purchased_credits_balance: 0,
    },
    subscription: null,
  };

  return { ...defaultUser, ...overrides };
}

/**
 * Generate the init script to inject authenticated user state into localStorage
 * This script runs before the page loads, ensuring the userStore finds cached user data
 */
export function getAuthInitScript(userData?: Partial<ITestUserData>): string {
  const user = createTestUser(userData);

  const cacheKey = getUserCacheKey();
  const supabaseAuthKey = getSupabaseAuthStorageKey();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const cacheValue = JSON.stringify({
    version: 1,
    timestamp: Date.now(),
    user: user,
  });
  const supabaseAuthValue = JSON.stringify({
    access_token: 'fake-test-token',
    refresh_token: 'fake-test-refresh-token',
    expires_in: 3600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      app_metadata: { provider: user.provider, providers: [user.provider] },
      user_metadata: { name: user.name },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });
  const supabaseAuthCookieValue = `base64-${Buffer.from(supabaseAuthValue, 'utf8').toString('base64url')}`;

  return `
    // Inject test environment markers
    window.__TEST_ENV__ = true;
    window.playwrightTest = true;

    // Inject authenticated user into localStorage
    // This will be picked up by userStore.initialize() via loadUserCache()
    localStorage.setItem('${cacheKey}', ${JSON.stringify(cacheValue)});
    localStorage.setItem('${supabaseAuthKey}', ${JSON.stringify(supabaseAuthValue)});
    document.cookie = '${supabaseAuthKey}=${supabaseAuthCookieValue}; path=/; max-age=31536000; SameSite=Lax';

    // Store test marker for middleware to check
    localStorage.setItem('__test_mode__', 'true');
  `;
}

/**
 * Check if the current request is from a test
 * Can be used to add test-specific headers to requests
 */
export function getTestHeaders(): Record<string, string> {
  return {
    'x-test-env': 'true',
    'x-playwright-test': 'true',
  };
}

/**
 * Initialize authenticated state for a page
 * Call this before navigating to any protected route
 *
 * @deprecated Use setupAuthenticatedStateWithSupabase instead for proper Supabase mocking
 * This function has a known issue where auth endpoints return hardcoded 'test-user-id'
 */
export async function setupAuthenticatedState(
  page: import('@playwright/test').Page,
  userData?: Partial<ITestUserData>
): Promise<void> {
  const user = createTestUser(userData);
  const testHeaders = getTestHeaders();

  // Add the init script to inject auth state before page loads
  await page.addInitScript(getAuthInitScript(userData));

  // Add test headers without installing a catch-all route that can shadow
  // test-specific route mocks.
  await page.setExtraHTTPHeaders(testHeaders);

  // Also set up route handlers for any API calls that might be made
  // Use the actual user ID from userData, not hardcoded
  await page.route('**/auth/v1/session', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          access_token: 'fake-test-token',
          user: { id: user.id, email: user.email, aud: 'authenticated' },
        },
      }),
    });
  });

  await page.route('**/auth/v1/user**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        aud: 'authenticated',
      }),
    });
  });
}

/**
 * Initialize authenticated state with proper Supabase mocking
 * This is the recommended function for tests that need billing/subscription data
 *
 * Sets up:
 * - Auth session with correct user ID
 * - Supabase REST calls (profiles, subscriptions)
 * - Supabase RPC calls (get_user_data)
 * - Credit history API
 */
export async function setupAuthenticatedStateWithSupabase(
  page: import('@playwright/test').Page,
  userData?: Partial<ITestUserData>
): Promise<void> {
  const user = createTestUser(userData);
  const testHeaders = getTestHeaders();

  // Add the init script to inject auth state before page loads
  await page.addInitScript(getAuthInitScript(userData));

  // Add test headers without installing a catch-all route that can shadow
  // test-specific route mocks.
  await page.setExtraHTTPHeaders(testHeaders);

  // Import and use the Supabase mock helpers
  const {
    mockSupabaseAuth,
    mockSupabaseBillingData,
    mockSupabaseRpc,
    mockCreditHistory,
    mockCheckoutEndpoint,
  } = await import('./supabase-mock');

  // Mock all Supabase-related calls
  await mockSupabaseAuth(page, user);
  await mockSupabaseBillingData(page, user);
  await mockSupabaseRpc(page, user);
  await mockCreditHistory(page, []);
  await mockCheckoutEndpoint(page);
}

/**
 * Create a user with specific credit balance for testing
 */
export function createUserWithCredits(credits: number): Partial<ITestUserData> {
  return {
    profile: {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      subscription_credits_balance: credits,
      purchased_credits_balance: 0,
    },
  };
}

/**
 * Create an admin user for testing
 */
export function createAdminUser(): Partial<ITestUserData> {
  return {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
    profile: {
      id: 'admin-user-id',
      email: 'admin@example.com',
      role: 'admin',
      subscription_credits_balance: 10000,
      purchased_credits_balance: 0,
    },
  };
}
