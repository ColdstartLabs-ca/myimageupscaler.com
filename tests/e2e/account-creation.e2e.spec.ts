import { test, expect } from '../test-fixtures';
import {
  AccountCreationHarness,
  createSpoofedIpAllocator,
  type IAccountCreationUser,
} from '../helpers/account-creation-e2e';

const nextIp = createSpoofedIpAllocator();

test.describe('Account creation free-credit hardening', () => {
  let harness: AccountCreationHarness;

  test.beforeEach(() => {
    harness = new AccountCreationHarness();
  });

  test.afterEach(async () => {
    await harness.cleanup();
  });

  test('should grant five credits after standard email confirmation', async ({ page }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.completeEmailConfirmation(page, user, identity);

    await harness.assertDashboardCredits(page, 5);
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should grant three credits to a restricted-country signup', async ({ page }) => {
    const user = await harness.createUser();
    const identity = { country: 'BR', ip: nextIp() };

    await harness.completeEmailConfirmation(page, user, identity);

    await harness.assertDashboardCredits(page, 3);
    await harness.assertDecision(user.id, {
      tier: 'restricted',
      grantedCredits: 3,
      transactionCount: 1,
    });
  });

  test('should record a terminal zero for a paywalled country while leaving purchase available', async ({
    page,
    request,
  }) => {
    const user = await harness.createUser();
    const identity = { country: 'IN', ip: nextIp() };

    await harness.completeEmailConfirmation(page, user, identity);

    await harness.assertDashboardCredits(page, 0);
    await expect(page.getByTestId('nav-upgrade-button')).toBeVisible();
    await harness.assertDecision(user.id, {
      tier: 'paywalled',
      grantedCredits: 0,
      transactionCount: 0,
    });
    await harness.expectCheckoutCreated(request, user, identity);
  });

  test('should give OAuth completion the same single grant decision as confirmation replay', async ({
    page,
  }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.completeOAuthCallback(page, user, identity);
    await harness.completeEmailConfirmation(page, user, identity);

    await harness.assertDashboardCredits(page, 5);
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should keep a setup retry idempotent', async ({ request }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.expectSetupComplete(request, user, identity);
    const retry = await harness.setup(request, user, identity);

    expect(retry.status()).toBe(200);
    await expect(retry.json()).resolves.toMatchObject({
      success: true,
      setupStatus: 'complete',
      alreadySetup: true,
    });
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should issue one grant when setup requests race', async ({ request }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    const responses = await Promise.all([
      harness.setup(request, user, identity),
      harness.setup(request, user, identity),
      harness.setup(request, user, identity),
    ]);

    expect(responses.map(response => response.status())).toEqual([200, 200, 200]);
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should not duplicate a grant when the callback page is reloaded', async ({ page }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.completeOAuthCallback(page, user, identity);
    await harness.completeOAuthCallback(page, user, identity);

    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should apply the 5/3/0 identity ladder without retroactively reducing the first account', async ({
    request,
  }) => {
    const sharedIp = nextIp();
    const identity = { country: 'US', ip: sharedIp };
    const [first, second, third] = await Promise.all([
      harness.createUser(),
      harness.createUser(),
      harness.createUser(),
    ]);

    await harness.expectSetupComplete(request, first, identity);
    await harness.expectSetupComplete(request, second, identity);
    await harness.expectSetupComplete(request, third, identity);

    await harness.assertDecision(first.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
    await harness.assertDecision(second.id, {
      tier: 'standard',
      grantedCredits: 3,
      transactionCount: 1,
    });
    await harness.assertDecision(third.id, {
      tier: 'standard',
      grantedCredits: 0,
      transactionCount: 0,
    });
    await harness.expectCheckoutCreated(request, third, identity);
  });

  test('should keep the confirmation page in an error state after setup returns 500, then grant on retry', async ({
    page,
    request,
  }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.completeEmailConfirmation(page, user, identity, { setupStatus: 500 });

    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Account Setup Error' })).toBeVisible();
    await harness.assertNoDecision(user.id);

    await harness.expectSetupComplete(request, user, identity);
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should keep a missing-country setup pending without burning the eventual grant', async ({
    page,
    request,
  }) => {
    const user = await harness.createUser();
    const ip = nextIp();

    await harness.completeOAuthCallback(page, user, { ip });

    await expect(page).not.toHaveURL(/\/dashboard/);
    await expect(page.getByRole('heading', { name: 'Sign In Error' })).toBeVisible();
    await harness.assertNoDecision(user.id);

    await harness.expectSetupComplete(request, user, { country: 'US', ip });
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should return ACCOUNT_SETUP_PENDING without mutations before a decision exists', async ({
    request,
  }) => {
    const user = await harness.createUser();
    const before = await harness.readState(user.id);

    const [upscale, backgroundRemoval] = await Promise.all([
      harness.upscale(request, user),
      harness.backgroundRemoval(request, user),
    ]);

    await harness.expectErrorCode(upscale, 'ACCOUNT_SETUP_PENDING');
    await harness.expectErrorCode(backgroundRemoval, 'ACCOUNT_SETUP_PENDING');
    await harness.expectStateUnchanged(user.id, before);
  });

  test('should return the purchase gate, not pending, for a terminal-zero account', async ({
    request,
  }) => {
    const user = await harness.createUser();
    const identity = { country: 'IN', ip: nextIp() };

    await harness.expectSetupComplete(request, user, identity);
    const before = await harness.readState(user.id);
    const upscale = await harness.upscale(request, user);

    await harness.expectErrorCode(upscale, 'FREE_LIMIT_EXCEEDED');
    await harness.expectStateUnchanged(user.id, before);
  });

  test('should show setup loading rather than settled zero while a grant is pending', async ({
    page,
  }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };

    await harness.completeOAuthCallback(page, user, identity, { pauseSetup: true });

    await expect(page.getByText('Completing sign in...')).toBeVisible();
    await expect(page.getByTestId('credits-display')).not.toBeVisible();

    await harness.releasePausedSetup();
    await harness.assertDashboardCredits(page, 5);
    await harness.assertDecision(user.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
  });

  test('should reject unauthenticated setup and ignore a forged X-User-Id header', async ({
    request,
  }) => {
    const [authenticatedUser, forgedUser] = await Promise.all([
      harness.createUser(),
      harness.createUser(),
    ]);
    const identity = { country: 'US', ip: nextIp() };

    const unauthenticated = await request.post('/api/users/setup', {
      data: {},
      headers: { 'X-User-Id': forgedUser.id },
    });
    expect(unauthenticated.status()).toBe(401);

    await harness.expectSetupComplete(request, authenticatedUser, identity, {
      'X-User-Id': forgedUser.id,
    });
    await harness.assertDecision(authenticatedUser.id, {
      tier: 'standard',
      grantedCredits: 5,
      transactionCount: 1,
    });
    await harness.assertNoDecision(forgedUser.id);
  });

  test('should not expose request identity in setup responses', async ({ request }) => {
    const user = await harness.createUser();
    const identity = { country: 'US', ip: nextIp() };
    const response = await harness.setup(request, user, identity, {
      'user-agent': 'account-creation-e2e-private-agent',
    });

    expect(response.status()).toBe(200);
    const serializedResponse = JSON.stringify(await response.json());
    expect(serializedResponse).not.toContain(identity.ip);
    expect(serializedResponse).not.toContain('account-creation-e2e-private-agent');
    expect(serializedResponse).not.toContain('identity_hash');
  });

  test('should not issue a welcome grant to active or trialing accounts', async ({ request }) => {
    const scenarios: Array<{
      status: 'active' | 'trialing';
      user: IAccountCreationUser;
    }> = [
      { status: 'active', user: await harness.createUser({ subscriptionStatus: 'active' }) },
      { status: 'trialing', user: await harness.createUser({ subscriptionStatus: 'trialing' }) },
    ];

    for (const { status, user } of scenarios) {
      await harness.expectSetupComplete(request, user, { country: 'US', ip: nextIp() });
      await harness.assertNoDecision(user.id);
      const state = await harness.readState(user.id);
      expect(state.profile.subscription_status).toBe(status);
      expect(state.transactions).toHaveLength(0);
    }
  });
});
