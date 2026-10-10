import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90000 });

const SDK_MARKER = 'GoTrueClient';

interface IScriptProbe {
  bodies: string[];
  pageErrors: string[];
}

/**
 * Collect every script body the page downloads plus uncaught page errors.
 * 'GoTrueClient' only ships inside supabase-js bundles, so its presence proves
 * the SDK reached the browser.
 */
function probeScripts(page: Page): IScriptProbe {
  const probe: IScriptProbe = { bodies: [], pageErrors: [] };
  page.on('response', response => {
    if (response.request().resourceType() !== 'script') return;
    void response
      .body()
      .then(buffer => probe.bodies.push(buffer.toString('utf8')))
      .catch(() => {});
  });
  page.on('pageerror', error => probe.pageErrors.push(error.message));
  return probe;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('Supabase client stays out of anonymous payloads', () => {
  test('a. anonymous tool page never downloads the Supabase SDK', async ({ page }) => {
    const probe = probeScripts(page);
    await page.goto('/tools/ai-image-upscaler', { waitUntil: 'load' });
    await settle(page);

    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.some(body => body.includes(SDK_MARKER))).toBe(false);
    expect(probe.pageErrors).toEqual([]);
  });

  test('b. a stored session cookie does load the Supabase SDK', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await context.addCookies([
        { name: 'sb-test-auth-token', value: 'x', domain: 'localhost', path: '/' },
      ]);
      const probe = probeScripts(page);
      await page.goto('/tools/ai-image-upscaler', { waitUntil: 'load' });
      await settle(page);

      await expect
        .poll(() => probe.bodies.some(body => body.includes(SDK_MARKER)), { timeout: 30000 })
        .toBe(true);
      expect(probe.pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test('c. an anonymous visitor can still open the auth modal', async ({ page }) => {
    const probe = probeScripts(page);
    await page.goto('/tools/ai-image-upscaler', { waitUntil: 'load' });
    await settle(page);

    await page.getByRole('button', { name: 'Get Started' }).first().click();
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    expect(probe.pageErrors).toEqual([]);
  });

  test('d. anonymous pricing still renders its plans without page errors', async ({ page }) => {
    const probe = probeScripts(page);
    await page.goto('/pricing', { waitUntil: 'load' });
    await settle(page);

    await expect(page.locator('[data-testid="credit-packs-section"]')).toBeVisible({
      timeout: 20000,
    });
    expect(probe.bodies.length).toBeGreaterThan(0);
    expect(probe.bodies.some(body => body.includes(SDK_MARKER))).toBe(false);
    expect(probe.pageErrors).toEqual([]);
  });

  test('e. a stored session cookie loads the Supabase SDK on pricing', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await context.addCookies([
        { name: 'sb-test-auth-token', value: 'x', domain: 'localhost', path: '/' },
      ]);
      const probe = probeScripts(page);
      await page.goto('/pricing', { waitUntil: 'load' });
      await settle(page);

      await expect
        .poll(() => probe.bodies.some(body => body.includes(SDK_MARKER)), { timeout: 30000 })
        .toBe(true);
      expect(probe.pageErrors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
