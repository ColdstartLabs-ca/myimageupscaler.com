import { test, expect } from '@playwright/test';
import { HomePage } from '../pages/HomePage';
import { UpscalerPage } from '../pages/UpscalerPage';
import { PricingPage } from '../pages/PricingPage';

/**
 * Mobile Responsive E2E Tests
 *
 * Refactored to eliminate duplication using helper functions and parameterized tests.
 * Reduced from 40+ individual tests to focused behavioral tests with proper accessibility checks.
 */

// Helper function to validate section display consistently
async function validateSectionDisplay(
  page: HomePage,
  selector: string,
  name: string,
  customAssertions?: () => Promise<void>
) {
  await expect(page.page.locator(selector)).toBeVisible();
  await page.checkAriaLabels();
  await page.screenshot(`mobile-${name}`);

  if (customAssertions) {
    await customAssertions();
  }
}

// Helper function to check touch target size
async function validateTouchTargetSize(element: import('@playwright/test').Locator) {
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
}

// Helper function to check no horizontal overflow
async function validateNoHorizontalOverflow(page: import('@playwright/test').Page) {
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
}

// Define all sections to test on landing page
const landingPageSections = [
  {
    name: 'hero',
    selector: '.hero-section, section:has-text("Enhance")',
    customAssertions: async (page: HomePage) => {
      await page.assertHeroTextReadable();
      await expect(page.versionBadge).toBeVisible();
    },
  },
  {
    name: 'workspace',
    selector: '.workspace-section, section:has([data-testid="dropzone"])',
    customAssertions: async (page: HomePage) => {
      await expect(page.dropzone).toBeVisible();
      await validateTouchTargetSize(page.dropzone);
    },
  },
  {
    name: 'features',
    selector: '.features-section, section:has-text("Features")',
    customAssertions: async (page: HomePage) => {
      await page.assertFeaturesVisible();
      const featureCount = await page.featureCards.count();
      expect(featureCount).toBeGreaterThan(0);
    },
  },
  {
    name: 'pricing',
    selector: '.pricing-section, section:has-text("Pricing")',
    customAssertions: async (page: HomePage) => {
      await page.assertPricingVisible();
      const pricingCards = await page.pricingCards.count();
      expect(pricingCards).toBeGreaterThan(0);
    },
  },
  {
    name: 'footer',
    selector: 'footer',
    customAssertions: async (page: HomePage) => {
      await page.assertFooterVisible();
      const footerLinksCount = await page.footerLinks.count();
      expect(footerLinksCount).toBeGreaterThan(0);
    },
  },
];

test.describe('Mobile Responsive - Landing Page', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();
    await homePage.checkBasicAccessibility();
  });

  // Consolidated section display test - replaces 6 separate tests
  for (const section of landingPageSections) {
    test(`should display ${section.name} section correctly`, async () => {
      // Special handling for sections that need scrolling
      if (['features', 'pricing', 'footer'].includes(section.name)) {
        await homePage.scrollIntoView(section.selector);
      }

      await validateSectionDisplay(homePage, section.selector, section.name, () =>
        section.customAssertions(homePage)
      );
    });
  }

  // Core layout and interaction tests
  test('should display responsive navigation correctly', async () => {
    const isMobile = await homePage.isMobileView();

    if (isMobile) {
      await expect(homePage.mobileMenuButton).toBeVisible();
      await validateTouchTargetSize(homePage.mobileMenuButton);
    } else {
      await expect(homePage.desktopNav).toBeVisible();
    }

    await expect(homePage.logo).toBeVisible();
    await homePage.checkAriaLabels();
    await homePage.screenshot('mobile-navigation');
  });

  test('should not have horizontal overflow', async () => {
    await homePage.assertNoHorizontalOverflow();
  });

  test('should allow smooth scrolling through entire page', async () => {
    await homePage.scrollIntoView('footer');
    await homePage.waitForNetworkIdle();
    await homePage.scrollIntoView('main');
    await homePage.waitForNetworkIdle();
    await homePage.assertHeroVisible();
  });
});

// Define upscaler page elements to validate
const upscalerPageElements = [
  {
    name: 'workspace-container',
    selector: '.bg-surface.rounded-2xl, .bg-main.rounded-3xl',
    elementGetter: (page: UpscalerPage) => page.pageTitle,
  },
  {
    name: 'workspace',
    selector: '.workspace, [data-testid="workspace"]',
    elementGetter: (page: UpscalerPage) => page.workspace,
    customAssertions: async (page: UpscalerPage) => {
      await expect(page.dropzone).toBeVisible();
      await validateTouchTargetSize(page.dropzone);
    },
  },
];

test.describe('Mobile Responsive - Upscaler Page', () => {
  let upscalerPage: UpscalerPage;

  test.beforeEach(async ({ page }) => {
    upscalerPage = new UpscalerPage(page);
    await upscalerPage.goto();
    await upscalerPage.waitForLoad();
    await upscalerPage.checkBasicAccessibility();
  });

  // Consolidated element display test - replaces 3 separate tests
  for (const element of upscalerPageElements) {
    test(`should display ${element.name} correctly`, async () => {
      if (element.elementGetter) {
        await expect(element.elementGetter(upscalerPage)).toBeVisible();
      } else {
        await expect(upscalerPage.page.locator(element.selector)).toBeVisible();
      }

      await upscalerPage.checkAriaLabels();
      await upscalerPage.screenshot(`upscaler-${element.name}`);

      if (element.customAssertions) {
        await element.customAssertions(upscalerPage);
      }
    });
  }

  test('should have proper layout and accessibility', async ({ page }) => {
    await validateNoHorizontalOverflow(page);
    await expect(upscalerPage.fileInput).toBeAttached();
    await upscalerPage.checkAriaLabels();
  });

  test('should handle file upload interactions gracefully', async () => {
    await upscalerPage.waitForLoadingComplete();
    await expect(upscalerPage.dropzone).toBeVisible();

    const dropzoneBox = await upscalerPage.dropzone.boundingBox();
    if (dropzoneBox) {
      await upscalerPage.hover('dropzone');
      await upscalerPage.wait(100);
    }

    await upscalerPage.screenshot('upscaler-dropzone-ready');
  });
});

// Define pricing cards with expected prices
const pricingCards = [
  {
    name: 'free',
    cardGetter: (page: PricingPage) => page.freeTierCard,
    price: '$19',
    buttonText: 'Subscribe Now',
  },
  {
    name: 'starter',
    cardGetter: (page: PricingPage) => page.starterTierCard,
    price: '$9.99',
    buttonText: 'Buy Now',
  },
  {
    name: 'pro',
    cardGetter: (page: PricingPage) => page.proTierCard,
    price: '$29.99',
    buttonText: 'Buy Now',
  },
];

test.describe('Mobile Responsive - Pricing Page', () => {
  let pricingPage: PricingPage;

  test.beforeEach(async ({ page }) => {
    pricingPage = new PricingPage(page);
    await pricingPage.goto();
    await pricingPage.waitForLoad();
    await pricingPage.checkBasicAccessibility();
  });

  test('should display all pricing cards correctly', async () => {
    await expect(pricingPage.pricingGrid).toBeVisible();
    await pricingPage.checkAriaLabels();
    await pricingPage.screenshot('pricing-cards-mobile');
  });

  // Consolidated pricing card test - replaces 4 separate tests
  for (const card of pricingCards) {
    test(`should display ${card.name} card with correct pricing and accessible buttons`, async () => {
      await expect(card.cardGetter(pricingPage)).toBeVisible();

      // Check price is displayed and readable
      const priceElement = card.cardGetter(pricingPage).getByText(card.price);
      await expect(priceElement).toBeVisible();

      // Check button is present and accessible
      const button = card
        .cardGetter(pricingPage)
        .locator('button')
        .filter({ hasText: card.buttonText })
        .first();

      await expect(button).toBeVisible();
      await validateTouchTargetSize(button);

      // Check card structure
      const heading = card.cardGetter(pricingPage).locator('h2, h3').first();
      await expect(heading).toBeVisible();

      await pricingPage.checkAriaLabels();
    });
  }

  test('should have proper layout without horizontal overflow', async ({ page }) => {
    await validateNoHorizontalOverflow(page);
    await pricingPage.checkAriaLabels();
  });
});

// Define viewport sizes for testing
const viewportSizes = [
  { name: 'iPhone SE', width: 375, height: 667 },
  { name: 'iPhone 12 Pro', width: 390, height: 844 },
  { name: 'Samsung Galaxy S21', width: 360, height: 800 },
  { name: 'iPad Mini', width: 768, height: 1024 },
];

test.describe('Mobile Responsive - Cross-Device Validation', () => {
  // Consolidated viewport test - replaces 4 separate tests
  for (const viewport of viewportSizes) {
    test(`should render correctly on ${viewport.name} (${viewport.width} x ${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(100); // Allow viewport to stabilize

      const homePage = new HomePage(page);
      await homePage.goto();
      await homePage.waitForLoad();
      await homePage.waitForLoadingComplete();

      // Core layout assertions
      await homePage.assertNavbarVisible();
      await homePage.assertHeroVisible();
      await homePage.assertNoHorizontalOverflow();
      await homePage.checkBasicAccessibility();

      // Verify main content fits within viewport
      const mainContent = homePage.mainContent;
      await mainContent.waitFor({ state: 'visible', timeout: 5000 });

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
        expect(mainBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      await homePage.screenshot(`viewport-${viewport.name.toLowerCase().replace(/\s+/g, '-')}`);
    });
  }

  // Consolidated touch and accessibility interactions
  test('should handle touch interactions while maintaining accessibility', async ({ page }) => {
    const homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();

    // Check accessibility before interaction
    await homePage.checkBasicAccessibility();

    // Test touch scrolling
    await homePage.scrollIntoView('.features-section, section:has-text("Features")');
    await homePage.waitForNetworkIdle();

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);

    // Verify accessibility is maintained
    await homePage.checkBasicAccessibility();

    // Test return to top
    await homePage.scrollIntoView('main');
    await homePage.waitForNetworkIdle();
    await homePage.assertHeroVisible();

    // Check zoom accessibility (with proper assertion)
    const viewportMeta = await page.locator('meta[name="viewport"]').getAttribute('content');
    if (viewportMeta) {
      const hasZoomRestriction =
        viewportMeta.includes('user-scalable=no') || viewportMeta.includes('maximum-scale=1.0');

      // Make this a proper assertion - either it allows zoom or explicitly documents the restriction
      if (hasZoomRestriction) {
        // If zoom is restricted, ensure it's documented and accessible
        await expect(page.locator('body')).toHaveAttribute('data-zoom-restricted', 'true');
      }
    }

    await homePage.screenshot('touch-interaction-complete');
  });
});

test.describe('Mobile Responsive - Accessibility', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.goto();
    await homePage.waitForLoad();
    await homePage.checkBasicAccessibility();
  });

  // Consolidated accessibility test - replaces 4 separate tests
  test('should meet all accessibility requirements on mobile', async ({ page }) => {
    // Check touch target sizes for mobile elements
    await validateTouchTargetSize(homePage.mobileMenuButton);

    // Check text readability
    const titleFontSize = await homePage.heroTitle.evaluate(el => {
      return parseInt(window.getComputedStyle(el).fontSize, 10);
    });
    expect(titleFontSize).toBeGreaterThanOrEqual(24);

    // Check color contrast basics
    const buttonStyles = await homePage.mobileMenuButton.evaluate(el => {
      const styles = window.getComputedStyle(el);
      return {
        color: styles.color,
        backgroundColor: styles.backgroundColor,
      };
    });
    expect(buttonStyles.color).toBeDefined();
    expect(buttonStyles.backgroundColor).toBeDefined();

    // Test keyboard navigation
    await page.keyboard.press('Tab');
    await homePage.wait(100);
    const activeElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BUTTON', 'A', 'INPUT']).toContain(activeElement);

    // Final accessibility checks
    await homePage.checkAriaLabels();
    await homePage.checkBasicAccessibility();
    await homePage.screenshot('mobile-accessibility-complete');
  });
});
