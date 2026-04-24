/**
 * Extension Authentication Tests
 *
 * Tests for the browser extension authentication bridge page:
 * - Extension auth page (/extension-auth) behavior
 * - Redirect flow for unauthenticated users
 * - Session passing to extension for authenticated users
 * - Locale routing bypass (extension-auth is not localized)
 *
 * PRD #100: Browser Extension v1
 */

import { test, expect } from '@playwright/test';

test.describe('Extension Auth Page - Unauthenticated Flow', () => {
  test('redirects to login when not authenticated', async ({ page }) => {
    // Navigate to extension-auth without auth
    await page.goto('/extension-auth');

    // Should redirect to home page with login parameter
    await page.waitForURL('**/?login=1*', { timeout: 10000 });

    const url = page.url();
    expect(url).toContain('/?login=');
    expect(url).toContain('next=/extension-auth');
  });

  test('extension-auth bypasses locale routing', async ({ page }) => {
    // Direct access without locale prefix should work
    await page.goto('/extension-auth');

    // Should not add locale prefix (no /en/extension-auth redirect)
    // Instead should redirect to login
    await page.waitForURL('**/?login=1*', { timeout: 10000 });

    const url = page.url();
    expect(url).not.toContain('/en/extension-auth');
    expect(url).toContain('/?login=');
  });
});

test.describe('Extension Auth Page - Query Parameters', () => {
  test('handles action=install parameter', async ({ page }) => {
    // Should redirect unauthenticated users to login
    await page.goto('/extension-auth?action=install');

    await page.waitForURL('**/?login=1*', { timeout: 10000 });
    const url = page.url();
    expect(url).toContain('next=/extension-auth');
  });

  test('handles action=signin parameter', async ({ page }) => {
    // Should redirect unauthenticated users to login
    await page.goto('/extension-auth?action=signin');

    await page.waitForURL('**/?login=1*', { timeout: 10000 });
    const url = page.url();
    expect(url).toContain('next=/extension-auth');
  });
});

test.describe('Extension Auth Page - Security', () => {
  test('does not leak sensitive data in URL', async ({ page }) => {
    await page.goto('/extension-auth');

    // Wait for redirect
    await page.waitForURL('**/?login=1*', { timeout: 10000 });

    // Check that token is NOT in the URL
    const url = page.url();
    expect(url).not.toContain('access_token');
    expect(url).not.toContain('Bearer');
  });
});
