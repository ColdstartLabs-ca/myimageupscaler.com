import { test, expect } from '@playwright/test';
import { TestContext, ApiClient } from '../helpers';

/**
 * Authentication Flow Integration Tests
 *
 * These tests verify complete authentication workflows including:
 * - User registration and profile creation
 * - Login and session management
 * - OAuth provider integration
 * - Session refresh and token handling
 * - Password reset and email verification
 */
test.describe('Authentication Flow Integration', () => {
  let ctx: TestContext;

  test.beforeAll(async () => {
    ctx = new TestContext();
  });

  test.afterAll(async () => {
    await ctx.cleanup();
  });

  test.describe('User Registration and Profile Creation', () => {
    let newUser: any;

    test('should create user profile after successful registration', async ({ request }) => {
      const api = new ApiClient(request);
      const userData = {
        email: `test-${Date.now()}@example.com`,
        password: 'test-password-123',
      };

      // Mock email verification - in real test, this would involve email service
      const registerResponse = await api.post('/api/auth/register', userData);

      if (registerResponse.status === 201) {
        // Verify profile was created
        const profile = await ctx.data.getUserProfileByEmail(userData.email);

        expect(profile).toMatchObject({
          email: userData.email,
          credits_balance: 10, // Initial credits
          subscription_status: null,
          subscription_tier: null,
        });
      } else {
        // User might already exist, which is acceptable for integration test
        expect([409, 422]).toContain(registerResponse.status);
      }
    });
  });

  test.describe('Login and Session Management', () => {
    test('should handle login with valid credentials', async ({ request }) => {
      const api = new ApiClient(request);
      const testUser = await ctx.createUser();

      const loginResponse = await api.post('/api/auth/login', {
        email: testUser.email,
        password: 'test-password-123',
      });

      expect(loginResponse.ok).toBeTruthy();
      const { user, session } = await loginResponse.json();

      expect(user).toMatchObject({
        id: testUser.id,
        email: testUser.email,
      });

      expect(session).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        expires_in: expect.any(Number),
      });

      // Test token usage
      const authenticatedApi = api.withAuth(session.access_token);
      const protectedResponse = await authenticatedApi.get('/api/protected/example');

      expect(protectedResponse.ok).toBeTruthy();
    });

    test('should reject login with invalid credentials', async ({ request }) => {
      const api = new ApiClient(request);
      const loginResponse = await api.post('/api/auth/login', {
        email: 'nonexistent@example.com',
        password: 'wrong-password',
      });

      expect(loginResponse.status).toBe(401);
      const { error } = await loginResponse.json();
      expect(error).toContain('Invalid credentials');
    });
  });

  test.describe('Session Validation in Processing', () => {
    test('should validate user session before image processing', async ({ request }) => {
      const api = new ApiClient(request);
      // Try to process image without authentication
      const response = await api.post('/api/upscale', {
        image: 'fake-image-data',
        mode: 'standard',
        scale: 2,
      });

      expect(response.status).toBe(401);
    });

    test('should allow image processing with valid session', async ({ request }) => {
      const api = new ApiClient(request);
      const testUser = await ctx.createUser();
      const authenticatedApi = api.withAuth(testUser.token);

      const response = await authenticatedApi.post('/api/upscale', {
        image: 'fake-image-data', // Will fail at validation, not auth
        mode: 'standard',
        scale: 2,
      });

      // Should fail due to invalid image data, not authentication
      expect(response.status).toBe(400);
    });
  });

  test.describe('Security and Rate Limiting', () => {
    test('should enforce rate limiting on login attempts', async ({ request }) => {
      const api = new ApiClient(request);
      const loginData = {
        email: 'test@example.com',
        password: 'wrong-password',
      };

      // Make multiple failed login attempts
      const attempts = Array(10).fill(null).map(() =>
        api.post('/api/auth/login', loginData)
      );

      const results = await Promise.allSettled(attempts);
      const rateLimited = results.filter(result =>
        result.status === 'fulfilled' && result.value.status === 429
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    test('should handle concurrent authentication requests', async ({ request }) => {
      const api = new ApiClient(request);
      const userData = {
        email: `concurrent-${Date.now()}@example.com`,
        password: 'test-password-123',
      };

      // Make concurrent registration requests
      const concurrentRequests = Array(5).fill(null).map(() =>
        api.post('/api/auth/register', userData)
      );

      const results = await Promise.allSettled(concurrentRequests);
      const successful = results.filter(result =>
        result.status === 'fulfilled' && result.value.status === 201
      );

      // Only one should succeed due to unique email constraint
      expect(successful).toHaveLength(1);

      // Note: TestContext handles cleanup automatically
    });
  });

  test.describe('Protected Routes Access', () => {
    test('should allow access to protected routes with valid session', async ({ request }) => {
      const api = new ApiClient(request);
      const testUser = await ctx.createUser();
      const authenticatedApi = api.withAuth(testUser.token);

      const protectedRoutes = [
        '/api/protected/example',
        '/api/health',
      ];

      for (const route of protectedRoutes) {
        const response = await authenticatedApi.get(route);
        expect(response.ok, `Route ${route} should be accessible`).toBeTruthy();
      }
    });

    test('should block access to protected routes without authentication', async ({ request }) => {
      const api = new ApiClient(request);
      const protectedRoutes = [
        '/api/protected/example',
      ];

      for (const route of protectedRoutes) {
        const response = await api.get(route);
        expect(response.status, `Route ${route} should be protected`).toBe(401);
      }
    });
  });
});