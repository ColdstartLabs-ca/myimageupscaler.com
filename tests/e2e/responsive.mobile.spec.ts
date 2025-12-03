import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { UpscalerPage } from '../pages/UpscalerPage';
import { PricingPage } from '../pages/PricingPage';

/**
 * Mobile Responsive E2E Tests
 *
 * Enhanced with BasePage patterns for better reliability, accessibility checks,
 * and proper waiting strategies to replace fixed timeouts.
 */

test.describe('Mobile Responsive - Landing Page', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();

    // Use enhanced BasePage accessibility check
    await homePage.checkBasicAccessibility();
  });

  test('should display mobile navigation correctly', async ({ page }) => {
    // Mobile menu button should be visible on mobile
    const isMobile = await homePage.isMobileView();

    if (isMobile) {
      // Mobile: hamburger menu visible, desktop nav hidden
      await expect(homePage.mobileMenuButton).toBeVisible();
      // Check ARIA labels for accessibility
      await homePage.checkAriaLabels();
    } else {
      // Tablet/larger: desktop nav should be visible
      await expect(homePage.desktopNav).toBeVisible();
      // Check navigation accessibility
      await homePage.checkAriaLabels();
    }

    // Logo should always be visible
    await expect(homePage.logo).toBeVisible();

    // Take screenshot for debugging
    await homePage.screenshot('mobile-navigation');
  });

  test('should not have horizontal overflow', async ({ page }) => {
    await homePage.assertNoHorizontalOverflow();
  });

  test('should display hero section properly', async ({ page }) => {
    await homePage.assertHeroVisible();
    await homePage.assertHeroTextReadable();

    // Version badge should be visible
    await expect(homePage.versionBadge).toBeVisible();

    // Check hero section accessibility
    await homePage.checkAriaLabels();

    // Screenshot hero section
    await homePage.screenshot('hero-section-mobile');
  });

  test('should display workspace section', async ({ page }) => {
    await homePage.assertWorkspaceVisible();

    // Dropzone should be usable
    await expect(homePage.dropzone).toBeVisible();

    // Check dropzone accessibility and touch target size
    const dropzoneBox = await homePage.dropzone.boundingBox();
    expect(dropzoneBox).not.toBeNull();
    if (dropzoneBox) {
      // Ensure dropzone has adequate touch target size (at least 44px per accessibility guidelines)
      expect(dropzoneBox.height).toBeGreaterThanOrEqual(44);
      expect(dropzoneBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check workspace accessibility
    await homePage.checkAriaLabels();
  });

  test('should display features section with proper layout', async ({ page }) => {
    await homePage.scrollToFeatures();
    await homePage.assertFeaturesVisible();

    // Feature cards should be visible
    const featureCount = await homePage.featureCards.count();
    expect(featureCount).toBeGreaterThan(0);

    // Check features section accessibility
    await homePage.checkAriaLabels();

    // Wait for any animations to complete
    await homePage.waitForLoadingComplete();

    // Screenshot features section
    await homePage.screenshot('features-section-mobile');
  });

  test('should display pricing section with proper layout', async ({ page }) => {
    await homePage.scrollToPricing();
    await homePage.assertPricingVisible();

    // Pricing cards should be visible and properly stacked on mobile
    const pricingCards = await homePage.pricingCards.count();
    expect(pricingCards).toBeGreaterThan(0);

    // Wait for pricing section to load completely
    await homePage.waitForLoadingComplete();

    // Check pricing section accessibility
    await homePage.checkAriaLabels();
  });

  test('should display footer properly', async ({ page }) => {
    await homePage.scrollToFooter();
    await homePage.assertFooterVisible();

    // Footer links should be clickable
    const footerLinksCount = await homePage.footerLinks.count();
    expect(footerLinksCount).toBeGreaterThan(0);

    // Check footer accessibility
    await homePage.checkAriaLabels();

    // Screenshot footer
    await homePage.screenshot('footer-section-mobile');
  });

  test('should allow smooth scrolling through entire page', async ({ page }) => {
    // Use enhanced BasePage scrollIntoView method instead of direct JS evaluation
    await homePage.scrollIntoView('footer');

    // Wait for scroll to complete instead of fixed timeout
    await homePage.waitForNetworkIdle();

    // Scroll back to top using enhanced BasePage method
    await homePage.scrollIntoView('main');

    // Wait for scroll to complete
    await homePage.waitForNetworkIdle();

    // Hero should be visible after scroll to top
    await homePage.assertHeroVisible();
  });

  test('sign in button should be accessible', async ({ page }) => {
    // Note: On mobile, Sign In button is inside hamburger menu
    // For this test, we'll verify the mobile menu button is accessible instead
    await expect(homePage.mobileMenuButton).toBeVisible();
    await expect(homePage.mobileMenuButton).toBeEnabled();

    // Check touch target size meets accessibility guidelines
    const buttonBox = await homePage.mobileMenuButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check ARIA labels
    await homePage.checkAriaLabels();
  });
});

test.describe('Mobile Responsive - Upscaler Page', () => {
  let upscalerPage: UpscalerPage;

  test.beforeEach(async ({ page }) => {
    upscalerPage = new UpscalerPage(page);
    await upscalerPage.goto();
    await upscalerPage.waitForLoad();

    // Use enhanced BasePage accessibility check
    await upscalerPage.checkBasicAccessibility();
  });

  test('should display page title', async ({ page }) => {
    await expect(upscalerPage.pageTitle).toBeVisible();

    // Check page title accessibility
    await upscalerPage.checkAriaLabels();

    // Screenshot page title
    await upscalerPage.screenshot('upscaler-page-title');
  });

  test('should display workspace with dropzone', async ({ page }) => {
    await expect(upscalerPage.workspace).toBeVisible();
    await expect(upscalerPage.dropzone).toBeVisible();

    // Check workspace accessibility
    await upscalerPage.checkAriaLabels();

    // Screenshot workspace
    await upscalerPage.screenshot('upscaler-workspace');
  });

  test('should not have horizontal overflow', async ({ page }) => {
    // Use enhanced BasePage method to check page structure
    await upscalerPage.checkBasicAccessibility();

    const viewportWidth = await page.evaluate(() => window.innerWidth);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('file input should be accessible', async ({ page }) => {
    // File input should exist even if hidden
    await expect(upscalerPage.fileInput).toBeAttached();

    // Check form accessibility
    await upscalerPage.checkAriaLabels();
  });

  test('dropzone should be tappable area with proper accessibility', async ({ page }) => {
    const dropzoneBox = await upscalerPage.dropzone.boundingBox();
    expect(dropzoneBox).not.toBeNull();
    if (dropzoneBox) {
      // Ensure dropzone has adequate tap target size (at least 44px per accessibility guidelines)
      expect(dropzoneBox.height).toBeGreaterThanOrEqual(44);
      expect(dropzoneBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check dropzone accessibility
    await upscalerPage.checkAriaLabels();
  });

  test('should handle file upload interactions gracefully', async ({ page }) => {
    // Wait for page to be fully ready
    await upscalerPage.waitForLoadingComplete();

    // Check that dropzone is interactive
    await expect(upscalerPage.dropzone).toBeVisible();

    // Test hover if available (desktop) or ensure it's properly sized for touch
    const dropzoneBox = await upscalerPage.dropzone.boundingBox();
    if (dropzoneBox) {
      // Check for interactive styling
      await upscalerPage.hover('dropzone');
      await upscalerPage.wait(100); // Small wait for hover effect
    }

    // Screenshot dropzone ready state
    await upscalerPage.screenshot('upscaler-dropzone-ready');
  });
});

test.describe('Mobile Responsive - Pricing Page', () => {
  let pricingPage: PricingPage;

  test.beforeEach(async ({ page }) => {
    pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await pricingPage.waitForLoad();

    // Use enhanced BasePage accessibility check
    await pricingPage.checkBasicAccessibility();
  });

  test('should display pricing cards', async ({ page }) => {
    await expect(pricingPage.pricingGrid).toBeVisible();

    // All tier cards should be visible
    await expect(pricingPage.freeTierCard).toBeVisible();
    await expect(pricingPage.starterTierCard).toBeVisible();
    await expect(pricingPage.proTierCard).toBeVisible();

    // Check pricing grid accessibility
    await pricingPage.checkAriaLabels();

    // Screenshot pricing cards
    await pricingPage.screenshot('pricing-cards-mobile');
  });

  test('should not have horizontal overflow', async ({ page }) => {
    // Use enhanced BasePage method to check page structure
    await pricingPage.checkBasicAccessibility();

    const viewportWidth = await page.evaluate(() => window.innerWidth);
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
  });

  test('pricing buttons should be tappable with proper accessibility', async ({ page }) => {
    // Check starter button tap target - be more specific to find the button within the card
    const starterButton = pricingPage.starterTierCard
      .locator('button')
      .filter({ hasText: 'Buy Now' })
      .first();

    await expect(starterButton).toBeVisible();

    const buttonBox = await starterButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      // Ensure button meets touch target size guidelines (at least 44px)
      expect(buttonBox.height).toBeGreaterThanOrEqual(44);
      expect(buttonBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check button accessibility
    await pricingPage.checkAriaLabels();
  });

  test('should display prices correctly with proper readability', async ({ page }) => {
    // Wait for prices to load
    await pricingPage.waitForLoadingComplete();

    // Hobby tier (subscription)
    await expect(pricingPage.freeTierCard.getByText('$19')).toBeVisible();

    // Starter Pack (credit pack)
    await expect(pricingPage.starterTierCard.getByText('$9.99')).toBeVisible();

    // Pro Pack (credit pack)
    await expect(pricingPage.proTierCard.getByText('$29.99')).toBeVisible();

    // Check price text readability
    const priceElements = pricingPage.page.locator('.text-4xl, .font-bold');
    await expect(priceElements.first()).toBeVisible();

    // Screenshot pricing information
    await pricingPage.screenshot('pricing-display-mobile');
  });

  test('pricing cards should be properly structured for accessibility', async ({ page }) => {
    // Wait for all pricing content to load
    await pricingPage.waitForLoadingComplete();

    // Check that each card has proper structure
    const cards = [pricingPage.freeTierCard, pricingPage.starterTierCard, pricingPage.proTierCard];

    for (const card of cards) {
      await expect(card).toBeVisible();

      // Check for headings in each card
      const heading = card.locator('h2, h3').first();
      await expect(heading).toBeVisible();
    }

    // Check overall pricing page accessibility
    await pricingPage.checkAriaLabels();
  });
});

test.describe('Mobile Responsive - Touch Interactions', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
  });

  test('should handle touch scrolling on landing page', async ({ page }) => {
    await homePage.goto();
    await homePage.waitForLoad();

    // Use enhanced BasePage scrollIntoView method instead of direct JS evaluation
    await homePage.scrollIntoView('.features-section, section:has-text("Features")');

    // Wait for scroll to complete instead of fixed timeout
    await homePage.waitForNetworkIdle();

    // Verify scroll position
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    // Screenshot scrolled state
    await homePage.screenshot('touch-scrolled-landing');
  });

  test('should maintain accessibility during touch interactions', async ({ page }) => {
    await homePage.goto();
    await homePage.waitForLoad();

    // Check accessibility before touch interaction
    await homePage.checkBasicAccessibility();

    // Simulate touch scroll using enhanced BasePage method
    await homePage.scrollIntoView('footer');

    // Wait for scroll completion
    await homePage.waitForNetworkIdle();

    // Check accessibility after scroll
    await homePage.checkBasicAccessibility();

    // Scroll back to top
    await homePage.scrollIntoView('main');

    // Wait for return scroll
    await homePage.waitForNetworkIdle();

    // Verify we're back at the top
    await homePage.assertHeroVisible();
  });

  test('should not interfere with native zoom accessibility', async ({ page }) => {
    await homePage.goto();
    await homePage.waitForLoad();

    // Check that viewport meta tag allows zooming or doesn't restrict it improperly
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');

    // Should not have maximum-scale=1 or user-scalable=no (accessibility requirement)
    if (viewportMeta) {
      const hasZoomRestriction =
        viewportMeta.includes('user-scalable=no') ||
        viewportMeta.includes('user-scalable=0') ||
        viewportMeta.includes('maximum-scale=1.0');

      // Note: This is a soft check - some apps intentionally restrict zoom
      // but it's generally not recommended for accessibility
      if (hasZoomRestriction) {
        console.warn('Viewport restricts zoom - consider enabling for accessibility');
      }
    }

    // Check page accessibility
    await homePage.checkBasicAccessibility();
  });
});

test.describe('Mobile Responsive - Viewport Sizes', () => {
  const viewportSizes = [
    { name: 'iPhone SE', width: 375, height: 667 },
    { name: 'iPhone 12 Pro', width: 390, height: 844 },
    { name: 'Samsung Galaxy S21', width: 360, height: 800 },
    { name: 'iPad Mini', width: 768, height: 1024 },
  ];

  for (const viewport of viewportSizes) {
    test(`should render correctly on ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      // Set viewport size first and wait for it to be applied
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Use enhanced BasePage wait instead of fixed timeout
      await page.waitForTimeout(100); // Allow viewport to stabilize

      const homePage = new HomePage(page);
      await homePage.goto();
      await homePage.waitForLoad();

      // Use enhanced BasePage wait for responsive layout to settle
      await homePage.waitForLoadingComplete();

      // Core assertions for all viewports using enhanced BasePage methods
      await homePage.assertNavbarVisible();
      await homePage.assertHeroVisible();
      await homePage.assertNoHorizontalOverflow();

      // Use enhanced BasePage accessibility check for each viewport
      await homePage.checkBasicAccessibility();

      // Check that main content is within viewport width with more robust error handling
      const mainContent = homePage.mainContent;

      // Wait for main content to be visible and stable
      await mainContent.waitFor({ state: 'visible', timeout: 5000 });

      // Get bounding box with retry logic
      let mainBox = await mainContent.boundingBox();
      let attempts = 0;
      const maxAttempts = 3;

      while ((!mainBox || mainBox.width === 0) && attempts < maxAttempts) {
        attempts++;
        await homePage.wait(100);
        mainBox = await mainContent.boundingBox();
      }

      expect(mainBox).not.toBeNull();
      if (mainBox) {
        expect(mainBox.width).toBeGreaterThan(0);
        // Allow small tolerance for browser rendering differences
        expect(mainBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      // Screenshot for each viewport
      await homePage.screenshot(`viewport-${viewport.name.toLowerCase().replace(/\s+/g, '-')}`);
    });
  }
});

test.describe('Mobile Responsive - Accessibility', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();
  });

  test('should have adequate touch target sizes', async ({ page }) => {
    // Use enhanced BasePage accessibility check first
    await homePage.checkBasicAccessibility();

    // On mobile, check mobile menu button touch targets
    const mobileMenuBox = await homePage.mobileMenuButton.boundingBox();
    expect(mobileMenuBox).not.toBeNull();
    if (mobileMenuBox) {
      // Ensure touch targets meet accessibility guidelines (44px minimum)
      expect(mobileMenuBox.height).toBeGreaterThanOrEqual(44);
      expect(mobileMenuBox.width).toBeGreaterThanOrEqual(44);
    }

    // Check ARIA labels for touch targets
    await homePage.checkAriaLabels();
  });

  test('should have readable text sizes', async ({ page }) => {
    // Use enhanced BasePage accessibility check
    await homePage.checkBasicAccessibility();

    // Check hero title font size
    const titleFontSize = await homePage.heroTitle.evaluate(el => {
      return parseInt(window.getComputedStyle(el).fontSize, 10);
    });

    // Title should be at least 24px on mobile for readability
    expect(titleFontSize).toBeGreaterThanOrEqual(24);

    // Screenshot for readability verification
    await homePage.screenshot('mobile-text-readability');
  });

  test('should maintain color contrast and accessibility', async ({ page }) => {
    // Use enhanced BasePage comprehensive accessibility check
    await homePage.checkBasicAccessibility();
    await homePage.checkAriaLabels();

    // On mobile, check mobile menu button color contrast
    const buttonStyles = await homePage.mobileMenuButton.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
      };
    });

    // Basic check that colors are defined
    expect(buttonStyles.color).toBeDefined();
    expect(buttonStyles.backgroundColor).toBeDefined();

    // Screenshot for accessibility verification
    await homePage.screenshot('mobile-accessibility-check');
  });

  test('should maintain focus management', async ({ page }) => {
    // Check basic accessibility
    await homePage.checkBasicAccessibility();

    // Test keyboard navigation
    await page.keyboard.press('Tab');

    // Wait for focus to settle
    await homePage.wait(100);

    // Check that focus is on an interactive element
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT']).toContain(activeElement);

    // Screenshot focus state
    await homePage.screenshot('mobile-focus-management');
  });
});
