import { readFileSync } from 'node:fs';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type APIRequestContext, type APIResponse, type Page } from '@playwright/test';
import { clientEnv, serverEnv } from '@shared/config/env';

const TEST_PASSWORD = 'AccountCreationE2E!123';
const TEST_EMAIL_DOMAIN = 'test.local';
const SETUP_TIMEOUT_MS = 20_000;

export interface IAccountCreationUser {
  id: string;
  email: string;
  password: string;
}

export interface IAccountCreationIdentity {
  country?: string;
  ip?: string;
}

export interface IAccountCreationState {
  profile: {
    region_tier: string | null;
    subscription_credits_balance: number | null;
    purchased_credits_balance: number | null;
    subscription_status: string | null;
    subscription_tier: string | null;
  };
  grants: Array<{
    user_id: string | null;
    granted_credits: number;
  }>;
  transactions: Array<{
    amount: number;
    reference_id: string | null;
  }>;
}

interface ICreateUserOptions {
  subscriptionStatus?: 'active' | 'trialing';
}

interface ICompleteBrowserSetupOptions {
  pauseSetup?: boolean;
  setupStatus?: number;
}

interface IDeferred {
  promise: Promise<void>;
  resolve: () => void;
}

function createDeferred(): IDeferred {
  let resolve!: () => void;
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function buildTestHeaders(
  userId: string,
  identity: IAccountCreationIdentity,
  headers: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer test_token_${userId}`,
    'Content-Type': 'application/json',
    'x-test-env': 'true',
    'x-playwright-test': 'true',
    ...(identity.country ? { 'x-test-country': identity.country } : {}),
    ...(identity.ip ? { 'CF-Connecting-IP': identity.ip } : {}),
    ...headers,
  };
}

function getSupabaseStorageKey(): string {
  const projectRef = new URL(clientEnv.SUPABASE_URL).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token`;
}

export function createSpoofedIpAllocator(): () => string {
  let index = 1;

  return () => {
    const current = index++;
    return `198.18.${Math.floor((current - 1) / 254)}.${((current - 1) % 254) + 1}`;
  };
}

/**
 * Uses real, disposable users in the dedicated Supabase test project. API requests
 * use test-only bearer tokens so identity headers can be set independently from the
 * browser's real Supabase session.
 */
export class AccountCreationHarness {
  private readonly admin: SupabaseClient;
  private readonly auth: SupabaseClient;
  private readonly userIds = new Set<string>();
  private pausedSetup?: IDeferred;

  constructor() {
    if (serverEnv.ENV !== 'test') {
      throw new Error('AccountCreationHarness may only run with ENV=test');
    }
    if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for account-creation E2E tests');
    }

    this.admin = createClient(clientEnv.SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.auth = createClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async createUser(options: ICreateUserOptions = {}): Promise<IAccountCreationUser> {
    const email = `account-creation-${crypto.randomUUID()}@${TEST_EMAIL_DOMAIN}`;
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`Unable to create account-creation E2E user: ${error?.message}`);
    }

    const user: IAccountCreationUser = { id: data.user.id, email, password: TEST_PASSWORD };
    this.userIds.add(user.id);
    await this.waitForProfile(user.id);
    await this.resetUserState(user.id, options.subscriptionStatus);
    return user;
  }

  async setup(
    request: APIRequestContext,
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity,
    headers: Record<string, string> = {}
  ): Promise<APIResponse> {
    return request.post('/api/users/setup', {
      data: {},
      headers: buildTestHeaders(user.id, identity, headers),
    });
  }

  async expectSetupComplete(
    request: APIRequestContext,
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity,
    headers: Record<string, string> = {}
  ): Promise<void> {
    const response = await this.setup(request, user, identity, headers);
    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      setupStatus: 'complete',
    });
  }

  async completeEmailConfirmation(
    page: Page,
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity,
    options: ICompleteBrowserSetupOptions = {}
  ): Promise<void> {
    await this.completeBrowserSetup(page, '/auth/confirm', user, identity, options);
  }

  async completeOAuthCallback(
    page: Page,
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity,
    options: ICompleteBrowserSetupOptions = {}
  ): Promise<void> {
    await this.completeBrowserSetup(page, '/auth/callback', user, identity, options);
  }

  async releasePausedSetup(): Promise<void> {
    if (!this.pausedSetup) {
      throw new Error('No account setup request is paused');
    }

    this.pausedSetup.resolve();
    this.pausedSetup = undefined;
  }

  async assertDashboardCredits(page: Page, credits: number): Promise<void> {
    await page.waitForURL(/\/dashboard/, { timeout: SETUP_TIMEOUT_MS });
    const display = page.getByTestId('credits-display');
    await expect(display).toBeVisible({ timeout: SETUP_TIMEOUT_MS });
    await expect(display.getByText(String(credits), { exact: true })).toBeVisible();
  }

  async assertDecision(
    userId: string,
    expected: {
      tier: 'standard' | 'restricted' | 'paywalled';
      grantedCredits: number;
      transactionCount: number;
    }
  ): Promise<void> {
    const state = await this.readState(userId);

    expect(state.profile.region_tier).toBe(expected.tier);
    expect(state.profile.subscription_credits_balance).toBe(expected.grantedCredits);
    expect(state.profile.purchased_credits_balance).toBe(0);
    expect(state.grants).toHaveLength(1);
    expect(state.grants[0]).toMatchObject({
      user_id: userId,
      granted_credits: expected.grantedCredits,
    });
    expect(state.transactions).toHaveLength(expected.transactionCount);
    expect(state.transactions).toEqual(
      expected.transactionCount === 0
        ? []
        : [
            expect.objectContaining({
              amount: expected.grantedCredits,
              reference_id: `free_grant:${userId}`,
            }),
          ]
    );
  }

  async assertNoDecision(userId: string): Promise<void> {
    const state = await this.readState(userId);
    expect(state.grants).toEqual([]);
    expect(state.transactions).toEqual([]);
  }

  async readState(userId: string): Promise<IAccountCreationState> {
    const [profileResult, grantsResult, transactionsResult] = await Promise.all([
      this.admin
        .from('profiles')
        .select(
          'region_tier, subscription_credits_balance, purchased_credits_balance, subscription_status, subscription_tier'
        )
        .eq('id', userId)
        .single(),
      this.admin
        .from('free_credit_grants')
        .select('user_id, granted_credits')
        .eq('user_id', userId),
      this.admin
        .from('credit_transactions')
        .select('amount, reference_id')
        .eq('user_id', userId)
        .order('created_at', { ascending: true }),
    ]);

    if (profileResult.error || !profileResult.data) {
      throw new Error(`Unable to read test profile: ${profileResult.error?.message}`);
    }
    if (grantsResult.error) {
      throw new Error(`Unable to read free-credit grants: ${grantsResult.error.message}`);
    }
    if (transactionsResult.error) {
      throw new Error(`Unable to read credit transactions: ${transactionsResult.error.message}`);
    }

    return {
      profile: profileResult.data,
      grants: grantsResult.data ?? [],
      transactions: transactionsResult.data ?? [],
    };
  }

  async expectStateUnchanged(userId: string, before: IAccountCreationState): Promise<void> {
    expect(await this.readState(userId)).toEqual(before);
  }

  async expectErrorCode(response: APIResponse, code: string): Promise<void> {
    expect(response.status()).toBe(code === 'ACCOUNT_SETUP_PENDING' ? 409 : 402);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  }

  async backgroundRemoval(
    request: APIRequestContext,
    user: IAccountCreationUser
  ): Promise<APIResponse> {
    return request.post('/api/bg-removal/deduct', {
      data: {},
      headers: buildTestHeaders(user.id, {}),
    });
  }

  async upscale(request: APIRequestContext, user: IAccountCreationUser): Promise<APIResponse> {
    return request.post('/api/upscale', {
      data: {
        imageData: VALID_UPSCALE_IMAGE,
        mimeType: 'image/jpeg',
        config: {
          scale: 2,
          qualityTier: 'quick',
          additionalOptions: {
            smartAnalysis: false,
            enhance: false,
            enhanceFaces: false,
            preserveText: false,
          },
        },
      },
      headers: buildTestHeaders(user.id, {}),
    });
  }

  async expectCheckoutCreated(
    request: APIRequestContext,
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity
  ): Promise<void> {
    const response = await request.post('/api/checkout', {
      data: { priceId: 'price_test_account_creation_12345' },
      headers: buildTestHeaders(user.id, identity),
    });

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { mock: true },
    });
  }

  async cleanup(): Promise<void> {
    const userIds = [...this.userIds];
    this.userIds.clear();

    const failures: string[] = [];
    for (const userId of userIds) {
      const [grantResult, transactionResult] = await Promise.all([
        this.admin.from('free_credit_grants').delete().eq('user_id', userId),
        this.admin.from('credit_transactions').delete().eq('user_id', userId),
      ]);
      if (grantResult.error)
        failures.push(`grant cleanup for ${userId}: ${grantResult.error.message}`);
      if (transactionResult.error) {
        failures.push(`transaction cleanup for ${userId}: ${transactionResult.error.message}`);
      }

      const { error } = await this.admin.auth.admin.deleteUser(userId);
      if (error) failures.push(`user cleanup for ${userId}: ${error.message}`);
    }

    if (failures.length > 0) {
      throw new Error(`Account-creation E2E cleanup failed: ${failures.join('; ')}`);
    }
  }

  private async completeBrowserSetup(
    page: Page,
    path: '/auth/callback' | '/auth/confirm',
    user: IAccountCreationUser,
    identity: IAccountCreationIdentity,
    options: ICompleteBrowserSetupOptions
  ): Promise<void> {
    const session = await this.signIn(user);
    await this.installBrowserSession(page, session);
    await page.setExtraHTTPHeaders({
      'x-test-env': 'true',
      'x-playwright-test': 'true',
      ...(identity.country ? { 'x-test-country': identity.country } : {}),
      ...(identity.ip ? { 'CF-Connecting-IP': identity.ip } : {}),
    });

    if (options.setupStatus) {
      await page.route('**/api/users/setup', route =>
        route.fulfill({
          status: options.setupStatus,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forced setup failure' }),
        })
      );
    }

    if (options.pauseSetup) {
      this.pausedSetup = createDeferred();
      const setupStarted = createDeferred();
      await page.route('**/api/users/setup', async route => {
        setupStarted.resolve();
        await this.pausedSetup?.promise;
        await route.continue();
      });

      void page.goto(path);
      await setupStarted.promise;
      return;
    }

    await page.goto(path);

    if (options.setupStatus) {
      return;
    }

    await page.waitForURL(/\/dashboard/, { timeout: SETUP_TIMEOUT_MS });
  }

  private async installBrowserSession(page: Page, session: Session): Promise<void> {
    const storageKey = getSupabaseStorageKey();
    const encodedSession = `base64-${Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')}`;
    await page.addInitScript(
      ({ key, authSession, cookieValue }) => {
        localStorage.setItem(key, JSON.stringify(authSession));
        document.cookie = `${key}=${cookieValue}; path=/; max-age=3600; SameSite=Lax`;
        document.cookie = `supabase.auth.token=${cookieValue}; path=/; max-age=3600; SameSite=Lax`;
      },
      { key: storageKey, authSession: session, cookieValue: encodedSession }
    );
  }

  private async signIn(user: IAccountCreationUser): Promise<Session> {
    const { data, error } = await this.auth.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });

    if (error || !data.session) {
      throw new Error(`Unable to sign in account-creation E2E user: ${error?.message}`);
    }

    return data.session;
  }

  private async resetUserState(
    userId: string,
    subscriptionStatus: ICreateUserOptions['subscriptionStatus']
  ): Promise<void> {
    const [grantResult, transactionResult] = await Promise.all([
      this.admin.from('free_credit_grants').delete().eq('user_id', userId),
      this.admin.from('credit_transactions').delete().eq('user_id', userId),
    ]);

    if (grantResult.error || transactionResult.error) {
      throw new Error(
        `Unable to reset account-creation E2E user: ${grantResult.error?.message ?? transactionResult.error?.message}`
      );
    }

    const { error } = await this.admin
      .from('profiles')
      .update({
        region_tier: null,
        signup_country: null,
        subscription_credits_balance: 0,
        purchased_credits_balance: 0,
        subscription_status: subscriptionStatus ?? null,
        subscription_tier: subscriptionStatus ? 'pro' : null,
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Unable to reset account-creation E2E profile: ${error.message}`);
    }
  }

  private async waitForProfile(userId: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const { data, error } = await this.admin
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
          if (error) throw new Error(`Unable to look up new test profile: ${error.message}`);
          return data?.id;
        },
        { timeout: SETUP_TIMEOUT_MS }
      )
      .toBe(userId);
  }
}

const VALID_UPSCALE_IMAGE = `data:image/jpeg;base64,${Buffer.from(
  readFileSync('tests/fixtures/sample.jpg')
).toString('base64')}`;
