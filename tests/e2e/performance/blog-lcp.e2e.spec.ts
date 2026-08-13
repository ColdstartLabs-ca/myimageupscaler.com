import { expect, test } from '@playwright/test';

test.describe('blog LCP image delivery', () => {
  test('should serve a mobile-sized hero on a 390px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const imageResponses = new Map<string, import('@playwright/test').Response>();
    page.on('response', response => {
      if (response.request().resourceType() === 'image') {
        imageResponses.set(response.url(), response);
      }
    });

    await page.goto('/blog/image-resolution-for-printing-complete-guide', {
      waitUntil: 'domcontentloaded',
    });

    const hero = page.locator('figure img').first();
    await expect(hero).toBeVisible({ timeout: 15000 });
    await hero.evaluate(async element => {
      const image = element as HTMLImageElement;
      if (!image.complete) await image.decode();
    });

    const srcset = await hero.getAttribute('srcset');
    expect(srcset).toMatch(/images\.unsplash\.com/);

    const currentSrc = await hero.evaluate(element => (element as HTMLImageElement).currentSrc);
    const selectedUrl = new URL(currentSrc);
    expect(selectedUrl.hostname).toBe('images.unsplash.com');
    const widthParam = selectedUrl.searchParams.get('w');
    expect(widthParam).not.toBeNull();
    const width = Number(widthParam);
    expect(Number.isFinite(width)).toBe(true);
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThanOrEqual(640);
    expect(selectedUrl.searchParams.get('h')).toBeNull();
    expect(selectedUrl.searchParams.get('fm')).toBe('avif');

    const networkResponse = imageResponses.get(currentSrc);
    const response = networkResponse || (await page.request.get(currentSrc));
    expect(response.ok()).toBe(true);
    expect((await response.body()).byteLength).toBeLessThan(60 * 1024);
  });
});
