import { test, expect } from '@playwright/test';

test.describe.configure({ timeout: 90000 });

function isIgnoredConsoleError(msg: string): boolean {
  return (
    msg.includes('Failed to load resource') ||
    msg.includes('Error fetching posts from database') ||
    msg.includes('favicon.ico') ||
    msg.includes('api.amplitude.com') ||
    msg.includes('googletagmanager.com') ||
    msg.includes('google-analytics.com') ||
    msg.includes('fonts.googleapis.com') ||
    msg.includes('fonts.gstatic.com') ||
    msg.includes('cloudflareinsights.com') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('net::ERR_')
  );
}

async function setupClsTracking(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    (window as any).__clsScore = 0;
    try {
      const observer = new PerformanceObserver(entryList => {
        for (const entry of entryList.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            (window as any).__clsScore += (entry as any).value;
          }
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      // Fallback if layout-shift not supported
    }
  });
}

test.describe('Web Vitals Fixes E2E', () => {
  test.describe('A. Pricing CLS - Mobile', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Pricing CLS is below 0.1 on mobile (default tab)', async ({ page }) => {
      await setupClsTracking(page);
      await page.goto('/pricing', { waitUntil: 'load' });
      await page.waitForLoadState('networkidle').catch(() => {});

      const creditPacksSection = page.locator('[data-testid="credit-packs-section"]');
      await expect(creditPacksSection).toBeVisible({ timeout: 20000 });

      const cls = await page.evaluate(() => (window as any).__clsScore || 0);
      console.log(`[Pricing CLS] mobile (390x844): total CLS = ${cls}`);
      expect(cls).toBeLessThan(0.1);

      await page.screenshot({
        path: 'test-results/web-vitals/pricing-default-mobile.png',
        fullPage: true,
      });
    });
  });

  test.describe('A. Pricing CLS - Desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('Pricing CLS is below 0.1 on desktop (default tab)', async ({ page }) => {
      await setupClsTracking(page);
      await page.goto('/pricing', { waitUntil: 'load' });
      await page.waitForLoadState('networkidle').catch(() => {});

      const creditPacksSection = page.locator('[data-testid="credit-packs-section"]');
      await expect(creditPacksSection).toBeVisible({ timeout: 20000 });

      const cls = await page.evaluate(() => (window as any).__clsScore || 0);
      console.log(`[Pricing CLS] desktop (1280x800): total CLS = ${cls}`);
      expect(cls).toBeLessThan(0.1);

      await page.screenshot({
        path: 'test-results/web-vitals/pricing-default-desktop.png',
        fullPage: true,
      });
    });
  });

  test('B. Streaming structure includes heading, credit packs, and suspense fallback when pending', async ({
    request,
  }) => {
    const res = await request.get('/pricing');
    const html = await res.text();

    expect(html).toMatch(
      /Choose the Perfect Plan|Simple, Transparent Pricing|Pricing Plans|Credits/i
    );
    expect(html).toContain('data-testid="credit-packs-section"');

    if (html.includes('<template id="B:')) {
      expect(html).toContain('data-testid="pricing-suspense-fallback"');
      expect(html).toContain('min-h-screen');
    }
  });

  test('C. Tool hero h1 and intro visibility and opacity with JS disabled and enabled', async ({
    browser,
  }) => {
    const noJsContext = await browser.newContext({ javaScriptEnabled: false });
    const noJsPage = await noJsContext.newPage();
    try {
      await noJsPage.goto('/tools/ai-image-upscaler', { waitUntil: 'domcontentloaded' });
      const h1 = noJsPage.locator('h1').first();
      await expect(h1).toBeVisible();

      const h1Opacity = await h1.evaluate(el => window.getComputedStyle(el).opacity);
      expect(h1Opacity).toBe('1');

      const intro = noJsPage.locator('p:has-text("AI image upscaler to enlarge")').first();
      await expect(intro).toBeVisible();
      const introOpacity = await intro.evaluate(el => window.getComputedStyle(el).opacity);
      expect(introOpacity).toBe('1');
    } finally {
      await noJsContext.close();
    }

    const jsContext = await browser.newContext({ javaScriptEnabled: true });
    const jsPage = await jsContext.newPage();
    try {
      await jsPage.setViewportSize({ width: 1280, height: 800 });
      await jsPage.goto('/tools/ai-image-upscaler', { waitUntil: 'domcontentloaded' });

      const h1 = jsPage.locator('h1').first();
      await expect(h1).toBeVisible();
      const h1Opacity = await h1.evaluate(el => window.getComputedStyle(el).opacity);
      expect(h1Opacity).toBe('1');

      const intro = jsPage.locator('p:has-text("AI image upscaler to enlarge")').first();
      await expect(intro).toBeVisible();
      const introOpacity = await intro.evaluate(el => window.getComputedStyle(el).opacity);
      expect(introOpacity).toBe('1');

      const badge = jsPage.locator('text="AI-Powered Tool"').first();
      const ctaLink = jsPage.locator('a[href*="signup"]').first();
      await expect(badge).toBeVisible();
      await expect(ctaLink).toBeVisible();

      const badgeBox = await badge.boundingBox();
      const introBox = await intro.boundingBox();
      const ctaBox = await ctaLink.boundingBox();

      expect(badgeBox).not.toBeNull();
      expect(introBox).not.toBeNull();
      expect(ctaBox).not.toBeNull();

      expect(badgeBox!.y).toBeLessThan(introBox!.y);
      expect(introBox!.y).toBeLessThan(ctaBox!.y);

      await jsPage.waitForLoadState('load');
      await jsPage.screenshot({
        path: 'test-results/web-vitals/tool-hero-desktop.png',
        fullPage: true,
      });

      await jsPage.setViewportSize({ width: 390, height: 844 });
      // Let the CTA entrance animation finish so the review screenshot is representative.
      await expect(jsPage.getByRole('link', { name: /free credits/i }).first()).toBeVisible();
      await jsPage.screenshot({
        path: 'test-results/web-vitals/tool-hero-mobile.png',
        fullPage: true,
      });
    } finally {
      await jsContext.close();
    }
  });

  test('D. Smoke: /, /pricing, /tools/ai-image-upscaler load without console errors', async ({
    page,
  }) => {
    const pagesToTest = ['/', '/pricing', '/tools/ai-image-upscaler'];

    for (const urlPath of pagesToTest) {
      const pageErrors: string[] = [];
      const consoleErrors: string[] = [];

      page.on('pageerror', err => {
        pageErrors.push(err.message);
      });

      page.on('console', msg => {
        if (msg.type() === 'error') {
          const text = msg.text();
          if (!isIgnoredConsoleError(text)) {
            consoleErrors.push(text);
          }
        }
      });

      await page.goto(urlPath, { waitUntil: 'load' });
      await expect(page.locator('body')).toBeVisible();

      if (urlPath === '/') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: 'test-results/web-vitals/home-mobile.png',
          fullPage: true,
        });
      }

      expect(pageErrors).toEqual([]);
      expect(consoleErrors).toEqual([]);
    }
  });
});
