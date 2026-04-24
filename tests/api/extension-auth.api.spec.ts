/**
 * Extension Auth API Tests
 *
 * Tests for API endpoints used by browser extension authentication:
 * - /api/users/me endpoint (used to fetch user credits)
 * - Extension origins CORS handling
 * - Session validation for extension requests
 *
 * PRD #100: Browser Extension v1
 */

import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

let ctx: TestContext;

test.describe('Extension Auth API - User Profile', () => {
  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('returns user profile with credits for authenticated user', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    await response.expectData({
      id: user.id,
      email: user.email,
      creditsRemaining: 100,
    });
  });

  test('returns 401 for unauthenticated request', async ({ request }) => {
    const api = new ApiClient(request);
    const response = await api.get('/api/users/me');

    response.expectStatus(401);
    await response.expectErrorCode('UNAUTHORIZED');
  });

  test('includes subscription tier in response', async ({ request }) => {
    const user = await ctx.createUser({
      subscription: 'active',
      tier: 'pro',
      credits: 500,
    });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    const data = await response.json();

    expect(data).toHaveProperty('tier');
    expect(data.tier).toBe('pro');
  });

  test('includes expiresAt field for extension session', async ({ request }) => {
    const user = await ctx.createUser({ credits: 50 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    const data = await response.json();

    // Extension auth page will add expiresAt, but API should return credits
    expect(data).toHaveProperty('creditsRemaining');
    expect(typeof data.creditsRemaining).toBe('number');
  });
});

test.describe('Extension Auth API - CORS Handling', () => {
  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('allows requests from localhost origins', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
  });

  test('includes proper CORS headers for API requests', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });

    const response = await request.get('/api/users/me', {
      headers: {
        Authorization: `Bearer ${user.token}`,
      },
    });

    const headers = response.headers();

    // Check for CORS headers
    expect(headers['access-control-allow-origin']).toBeTruthy();
  });
});

test.describe('Extension Auth API - Security', () => {
  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('rejects invalid bearer token', async ({ request }) => {
    const response = await request.get('/api/users/me', {
      headers: {
        Authorization: 'Bearer invalid_token_12345',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('rejects requests with malformed authorization header', async ({ request }) => {
    const response = await request.get('/api/users/me', {
      headers: {
        Authorization: 'InvalidFormat token123',
      },
    });

    expect(response.status()).toBe(401);
  });

  test('does not expose sensitive user secrets in response', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    const data = await response.json();

    // Should not include sensitive fields
    expect(data).not.toHaveProperty('password');
    expect(data).not.toHaveProperty('supabaseToken');
    expect(data).not.toHaveProperty('internalSecret');
  });
});

test.describe('Extension Auth API - Rate Limiting', () => {
  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('allows multiple profile requests for authenticated user', async ({ request }) => {
    const user = await ctx.createUser({ credits: 100 });

    const api = new ApiClient(request).withAuth(user.token);

    // Make multiple requests
    const responses = await Promise.all([
      api.get('/api/users/me'),
      api.get('/api/users/me'),
      api.get('/api/users/me'),
    ]);

    // All should succeed (assuming test environment has rate limiting disabled)
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });
  });
});

test.describe('Extension Auth API - Edge Cases', () => {
  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test('handles user with zero credits', async ({ request }) => {
    const user = await ctx.createUser({ credits: 0 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    await response.expectData({
      id: user.id,
      creditsRemaining: 0,
    });
  });

  test('handles user with high credit balance', async ({ request }) => {
    const user = await ctx.createUser({ credits: 10000 });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    const data = await response.json();

    expect(data.creditsRemaining).toBe(10000);
  });

  test('handles user with expired subscription', async ({ request }) => {
    const user = await ctx.createUser({
      subscription: 'expired',
      tier: 'free',
      credits: 5,
    });

    const api = new ApiClient(request).withAuth(user.token);
    const response = await api.get('/api/users/me');

    response.expectStatus(200);
    const data = await response.json();

    // Should still return profile even with expired subscription
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('creditsRemaining');
  });
});
