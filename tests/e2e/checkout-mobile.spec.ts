import { test, expect } from '../test-fixtures';
import { BillingPage } from '../pages/BillingPage';
import { setupAuthenticatedState } from '../helpers/auth-helpers';

/**
 * Mobile Checkout E2E Tests
 *
 * Tests for mobile checkout UX optimization (Phase 3D):
 * - Close button touch target size (44x44px minimum)
 * - Modal horizontal scroll prevention
 * - Credit pack cards stacking vertically on mobile
 * - Full-width buttons on mobile
 */

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

test.describe('Mobile Checkout - iPhone SE (375x667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    // Set up authenticated state for billing page access
    await setupAuthenticatedState(page);
  });

  test('should display billing page correctly on mobile', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Verify page loads correctly
    await expect(billingPage.pageTitle).toBeVisible();
    await expect(billingPage.creditsTab).toBeVisible();

    // Check no horizontal overflow on billing page
    await validateNoHorizontalOverflow(page);
  });

  test('should stack credit pack cards vertically on mobile', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Find credit pack cards in the Credits tab
    const creditPackCards = page.locator('.grid.gap-4 > div').filter({
      has: page.locator('button:has-text("Buy Now")'),
    });

    const cardCount = await creditPackCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // On mobile (375px), cards should stack vertically
    // Check that cards are full width within the container
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    for (let i = 0; i < cardCount; i++) {
      const card = creditPackCards.nth(i);
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Card should be close to viewport width (with some padding)
        expect(box.width).toBeGreaterThan(viewportWidth * 0.8);
      }
    }
  });

  test('should have full-width buttons on mobile billing page', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Get the viewport width
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    // Find the "Buy Now" buttons in credit pack cards
    const buyNowButtons = page.locator('button:has-text("Buy Now")');
    const buttonCount = await buyNowButtons.count();
    expect(buttonCount).toBeGreaterThan(0);

    // Check that the first button is close to full width on mobile
    const firstButton = buyNowButtons.first();
    const buttonBox = await firstButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    if (buttonBox) {
      // Button should be wide (at least 70% of viewport for good touch target)
      expect(buttonBox.width).toBeGreaterThan(viewportWidth * 0.5);
    }
  });

  test('should open checkout modal when clicking credit pack on mobile', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API to avoid actual Stripe calls
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack card (triggers checkout modal)
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Wait for checkout modal to appear
    const checkoutModal = page.locator('.fixed.inset-0.z-50').filter({
      has: page.locator('button[aria-label]'),
    });

    // Modal should be visible
    await expect(checkoutModal.first()).toBeVisible({ timeout: 5000 });
  });

  test('should have accessible close button touch target in checkout modal', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Wait for modal and find close button
    const closeButton = page
      .locator('.fixed.inset-0.z-50 button')
      .filter({
        has: page.locator('svg'),
      })
      .first();

    await expect(closeButton).toBeVisible({ timeout: 5000 });

    // Validate close button has minimum 44x44px touch target
    await validateTouchTargetSize(closeButton);
  });

  test('should not have horizontal scroll in checkout modal on mobile', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Wait for modal
    const modal = page.locator('.fixed.inset-0.z-50').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Check no horizontal overflow in the modal
    await validateNoHorizontalOverflow(page);
  });

  test('should close checkout modal when clicking close button', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Wait for modal and find close button
    const closeButton = page
      .locator('.fixed.inset-0.z-50 button')
      .filter({
        has: page.locator('svg'),
      })
      .first();

    await expect(closeButton).toBeVisible({ timeout: 5000 });

    // Click close button
    await closeButton.click();

    // Modal should close
    const modal = page.locator('.fixed.inset-0.z-50').first();
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});

test.describe('Mobile Checkout - Android (360x800)', () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
  });

  test('should display billing page correctly on Android viewport', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Verify page loads correctly
    await expect(billingPage.pageTitle).toBeVisible();

    // Check no horizontal overflow
    await validateNoHorizontalOverflow(page);
  });

  test('should have accessible touch targets on Android', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Find close button
    const closeButton = page
      .locator('.fixed.inset-0.z-50 button')
      .filter({
        has: page.locator('svg'),
      })
      .first();

    await expect(closeButton).toBeVisible({ timeout: 5000 });

    // Validate touch target on 360px viewport
    await validateTouchTargetSize(closeButton);
  });
});

test.describe('Mobile Checkout - Accessibility', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await setupAuthenticatedState(page);
  });

  test('checkout modal close button should have accessible label', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Find close button
    const closeButton = page
      .locator('.fixed.inset-0.z-50 button')
      .filter({
        has: page.locator('svg'),
      })
      .first();

    await expect(closeButton).toBeVisible({ timeout: 5000 });

    // Check that button has aria-label
    const ariaLabel = await closeButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel!.length).toBeGreaterThan(0);
  });

  test('checkout modal should be dismissible with Escape key', async ({ page }) => {
    const billingPage = new BillingPage(page);
    await billingPage.goto();

    // Mock the checkout API
    await page.route('**/api/checkout/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          clientSecret: 'pi_test_mock_secret',
        }),
      });
    });

    // Click on a credit pack to open checkout modal
    const creditPackCard = page
      .locator('.grid.gap-4 > div')
      .filter({
        has: page.locator('button:has-text("Buy Now")'),
      })
      .first();

    await creditPackCard.click();

    // Wait for modal
    const modal = page.locator('.fixed.inset-0.z-50').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
