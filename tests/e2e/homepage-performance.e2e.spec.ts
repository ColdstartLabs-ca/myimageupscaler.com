import { expect, test } from '../test-fixtures';

test.describe('Homepage loading contracts', () => {
  test('loads both visible hero images eagerly without loading Stripe', async ({ page }) => {
    const htmlResponse = await page.request.get('/');
    expect(htmlResponse.ok()).toBe(true);
    const initialHtml = await htmlResponse.text();
    const eagerAfterImage = initialHtml.match(
      /<img[^>]+alt="AI-enhanced mountain photo after upscaling"[^>]*>/
    )?.[0];
    const eagerBeforeImage = initialHtml.match(/<img[^>]+alt="Before"[^>]*>/)?.[0];

    expect(eagerAfterImage).toBeDefined();
    expect(eagerBeforeImage).toBeDefined();
    expect(eagerAfterImage).not.toContain('loading="lazy"');
    expect(eagerBeforeImage).not.toContain('loading="lazy"');
    expect(eagerAfterImage).toContain('/cdn-cgi/image/');
    expect(eagerBeforeImage).toContain('/cdn-cgi/image/');
    expect(initialHtml).toMatch(
      /<link[^>]+rel="preload"[^>]+as="image"[^>]+imageSrcSet="[^"]*hero-image-regular\.webp/
    );
    expect(initialHtml).toMatch(
      /<link[^>]+rel="preload"[^>]+as="image"[^>]+imageSrcSet="[^"]*hero-image-blurred\.webp/
    );
    expect(initialHtml).not.toMatch(
      /<link[^>]+rel="preload"[^>]+as="image"[^>]+[^>]*horizontal-logo-(compact|full)\.png/
    );
    expect(initialHtml).not.toMatch(/<script[^>]+src="[^"]*js\.stripe\.com/);

    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));

    await page.setViewportSize({ width: 412, height: 823 });
    await page.goto('/');

    const hero = page.locator('section.hero-section').first();
    await expect(hero).toBeVisible();

    const imageState = await hero.evaluate(section => {
      const after = section.querySelector<HTMLImageElement>(
        'img[alt="AI-enhanced mountain photo after upscaling"]'
      );
      const before = section.querySelector<HTMLImageElement>('img[alt="Before"]');

      return {
        afterLoading: after?.getAttribute('loading'),
        beforeLoading: before?.getAttribute('loading'),
        afterSrc: after?.currentSrc || after?.src,
        beforeSrc: before?.currentSrc || before?.src,
        afterCount: section.querySelectorAll(
          'img[alt="AI-enhanced mountain photo after upscaling"]'
        ).length,
        duplicateAfterCount: section.querySelectorAll('img[alt="After"]').length,
      };
    });

    expect(imageState.afterLoading).not.toBe('lazy');
    expect(imageState.beforeLoading).not.toBe('lazy');
    expect(imageState.afterSrc).toContain('/cdn-cgi/image/');
    expect(imageState.beforeSrc).toContain('/cdn-cgi/image/');
    expect(imageState.afterCount).toBe(1);
    expect(imageState.duplicateAfterCount).toBe(0);
    expect(requests.some(url => url.includes('js.stripe.com'))).toBe(false);
  });

  test('requests only the responsive navbar logo selected by the viewport', async ({ page }) => {
    const logoRequests: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/logo/horizontal-logo-')) {
        logoRequests.push(request.url());
      }
    });

    for (const width of [375, 412]) {
      await page.setViewportSize({ width, height: 823 });
      logoRequests.length = 0;
      await page.goto('/');

      const mobileLogo = await page
        .locator('header picture img')
        .evaluate(image => image.currentSrc);
      expect(mobileLogo).toContain('horizontal-logo-compact.png');
      expect(mobileLogo).toContain('/cdn-cgi/image/');
      expect(
        logoRequests.filter(url => url.includes('horizontal-logo-compact.png')).length
      ).toBeGreaterThan(0);
      expect(logoRequests.some(url => url.includes('horizontal-logo-full.png'))).toBe(false);
    }

    await page.setViewportSize({ width: 800, height: 823 });
    logoRequests.length = 0;
    await page.goto('/');

    const desktopLogo = await page
      .locator('header picture img')
      .evaluate(image => image.currentSrc);
    expect(desktopLogo).toContain('horizontal-logo-full.png');
    expect(desktopLogo).toContain('/cdn-cgi/image/');
    expect(
      logoRequests.filter(url => url.includes('horizontal-logo-full.png')).length
    ).toBeGreaterThan(0);
    expect(logoRequests.some(url => url.includes('horizontal-logo-compact.png'))).toBe(false);
  });
});
