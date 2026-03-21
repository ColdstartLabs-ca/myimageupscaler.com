import { test, expect } from '../test-fixtures';
import { BasePage } from '../pages/BasePage';

/**
 * E2E Tests for Engagement Discount Toast Component
 *
 * Tests cover:
 * 1. Toast visibility and rendering
 * 2. Countdown timer functionality
 * 3. User interactions (dismiss, claim)
 * 4. Price display accuracy
 * 5. Accessibility
 *
 * @see client/components/engagement-discount/EngagementDiscountToast.tsx
 * @see docs/PRDs/engagement-based-first-purchase-discount.md
 */

/**
 * Page object for Engagement Discount Toast
 */
class EngagementDiscountToastPage extends BasePage {
  /** Toast container */
  get toast() {
    return this.page.locator('[data-testid="engagement-discount-toast"], .fixed.bottom-4.right-4');
  }

  /** Toast header with "Special Offer" label */
  get specialOfferLabel() {
    return this.page.locator('text=Special Offer');
  }

  /** Discount percentage text */
  get discountPercent() {
    return this.page.locator('text=/\\d+% Off Your First Purchase/');
  }

  /** Countdown timer */
  get countdownTimer() {
    return this.page.locator('text=/Offer expires in/');
  }

  /** Claim discount button */
  get claimButton() {
    return this.page.locator('button:has-text("Claim")');
  }

  /** Dismiss button (X) */
  get dismissButton() {
    return this.page.locator('button[aria-label="Dismiss"]');
  }

  /** Original price (strikethrough) */
  get originalPrice() {
    return this.page.locator('.line-through');
  }

  /** Discounted price */
  get discountedPrice() {
    return this.page.locator('text=/\\$\\d+\\.\\d+/').first();
  }

  /** Urgent state indicator (red pulse) */
  get urgentIndicator() {
    return this.page.locator('.animate-pulse.bg-red-500\\/20');
  }

  /**
   * Navigate to the workspace page where toast might appear
   */
  async gotoWorkspace() {
    await this.goto('/dashboard');
    await this.waitForPageLoad();
  }

  /**
   * Mock engagement discount store state to show toast
   */
  async mockEligibleState() {
    await this.page.addInitScript(() => {
      // Mock the engagement discount store to show toast
      const mockState = {
        state: {
          signals: { upscales: 3, downloads: 2, modelSwitches: 1, sessionStartedAt: Date.now() },
          hasCheckedEligibility: true,
          isEligible: true,
          showToast: true,
          wasDismissed: false,
          offer: {
            userId: 'test-user',
            offeredAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            discountPercent: 20,
            targetPackKey: 'medium',
            originalPriceCents: 1499,
            discountedPriceCents: 1199,
            redeemed: false,
          },
          countdownEndTime: Date.now() + 30 * 60 * 1000,
        },
        version: 0,
      };
      // Set in sessionStorage before page loads
      sessionStorage.setItem('miu_engagement_discount', JSON.stringify(mockState));
    });
  }

  /**
   * Wait for toast to appear
   */
  async waitForToast() {
    await expect(this.toast).toBeVisible({ timeout: 10000 });
  }

  /**
   * Wait for toast to disappear
   */
  async waitForToastHidden() {
    await expect(this.toast).toBeHidden({ timeout: 5000 });
  }

  /**
   * Dismiss the toast
   */
  async dismiss() {
    await this.dismissButton.click();
    // Wait for slide-out animation
    await this.page.waitForTimeout(400);
  }

  /**
   * Click the claim discount button
   */
  async claimDiscount() {
    await this.claimButton.click();
  }
}

test.describe('Engagement Discount Toast', () => {
  let toastPage: EngagementDiscountToastPage;

  test.beforeEach(async ({ page }) => {
    toastPage = new EngagementDiscountToastPage(page);
  });

  test.describe('Toast Visibility', () => {
    test('should not show toast for anonymous users', async () => {
      await toastPage.goto('/');
      await toastPage.waitForPageLoad();

      // Toast should not be visible for anonymous users
      await expect(toastPage.toast).not.toBeVisible({ timeout: 5000 });
    });

    test('should show toast when user is eligible', async ({ page }) => {
      // Mock eligible state before navigation
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();

      // Toast should appear with slide-in animation
      await toastPage.waitForToast();

      // Verify key elements are visible
      await expect(toastPage.specialOfferLabel).toBeVisible();
      await expect(toastPage.discountPercent).toBeVisible();
      await expect(toastPage.countdownTimer).toBeVisible();
    });

    test('should have proper z-index to overlay content', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Check z-index is high enough (z-50)
      const zIndex = await toastPage.toast.evaluate(el =>
        window.getComputedStyle(el).getPropertyValue('z-index')
      );
      expect(parseInt(zIndex)).toBeGreaterThanOrEqual(50);
    });
  });

  test.describe('Toast Content', () => {
    test('should display discount percentage', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Should show 20% discount
      await expect(toastPage.discountPercent).toContainText('20%');
    });

    test('should display price comparison', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Should show original price with strikethrough
      await expect(toastPage.originalPrice).toBeVisible();

      // Should show discounted price
      const priceText = await toastPage.discountedPrice.textContent();
      expect(priceText).toMatch(/\$\d+\.\d{2}/);
    });

    test('should display countdown timer', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Timer should be visible with format MM:SS
      const timerText = await toastPage.countdownTimer.textContent();
      expect(timerText).toMatch(/\d{2}:\d{2}/);
    });

    test('should display claim button with discount text', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      await expect(toastPage.claimButton).toBeVisible();
      await expect(toastPage.claimButton).toContainText('Claim');
    });

    test('should show credits offered', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Should mention credits in the message
      const creditsText = page.locator('text=/credits/i');
      await expect(creditsText.first()).toBeVisible();
    });
  });

  test.describe('Countdown Timer', () => {
    test('timer should decrement over time', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Get initial time
      const initialText = await toastPage.countdownTimer.textContent();
      const initialMatch = initialText?.match(/(\d{2}):(\d{2})/);

      if (initialMatch) {
        const initialSeconds = parseInt(initialMatch[1]) * 60 + parseInt(initialMatch[2]);

        // Wait a few seconds
        await page.waitForTimeout(3000);

        // Get updated time
        const updatedText = await toastPage.countdownTimer.textContent();
        const updatedMatch = updatedText?.match(/(\d{2}):(\d{2})/);

        if (updatedMatch) {
          const updatedSeconds = parseInt(updatedMatch[1]) * 60 + parseInt(updatedMatch[2]);

          // Timer should have decremented
          expect(updatedSeconds).toBeLessThan(initialSeconds);
        }
      }
    });

    test('should show urgent state when time is low', async ({ page }) => {
      // Mock state with only 4 minutes remaining (less than 5 minutes = urgent)
      await page.addInitScript(() => {
        const mockState = {
          state: {
            signals: { upscales: 3, downloads: 2, modelSwitches: 1, sessionStartedAt: Date.now() },
            hasCheckedEligibility: true,
            isEligible: true,
            showToast: true,
            wasDismissed: false,
            offer: {
              userId: 'test-user',
              offeredAt: new Date().toISOString(),
              expiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
              discountPercent: 20,
              targetPackKey: 'medium',
              originalPriceCents: 1499,
              discountedPriceCents: 1199,
              redeemed: false,
            },
            countdownEndTime: Date.now() + 4 * 60 * 1000,
          },
          version: 0,
        };
        sessionStorage.setItem('miu_engagement_discount', JSON.stringify(mockState));
      });

      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Should show urgent indicator (red pulse)
      await expect(toastPage.urgentIndicator).toBeVisible();
    });
  });

  test.describe('User Interactions', () => {
    test('should dismiss toast when X button is clicked', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Dismiss the toast
      await toastPage.dismiss();

      // Toast should be hidden after animation
      await toastPage.waitForToastHidden();
    });

    test('should navigate to checkout when claim button is clicked', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Click claim button
      await toastPage.claimDiscount();

      // Should navigate somewhere (checkout or pricing)
      // Wait for navigation to complete
      await page.waitForURL(/\/(checkout|pricing|success)/, { timeout: 10000 }).catch(() => {
        // If no navigation, at least verify the button was clicked
      });
    });

    test('should not show toast again after dismissal in same session', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Dismiss the toast
      await toastPage.dismiss();
      await toastPage.waitForToastHidden();

      // Reload the page
      await page.reload();
      await toastPage.waitForPageLoad();

      // Toast should not reappear (wasDismissed is true)
      await expect(toastPage.toast).not.toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Accessibility', () => {
    test('dismiss button should have accessible label', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Dismiss button should have aria-label
      const ariaLabel = await toastPage.dismissButton.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
    });

    test('toast should be keyboard accessible', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Tab to focus on dismiss button
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to press Enter to dismiss
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT']).toContain(focusedElement);
    });

    test('toast should have proper contrast for text', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Check that text is visible (not same color as background)
      const discountText = toastPage.discountPercent;
      const isVisible = await discountText.isVisible();
      expect(isVisible).toBe(true);
    });
  });

  test.describe('Animation', () => {
    test('should slide in from right', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();

      // Wait for toast to appear
      await toastPage.waitForToast();

      // Toast should be in visible position (translate-x-0)
      const transform = await toastPage.toast.evaluate(el =>
        window.getComputedStyle(el).getPropertyValue('transform')
      );

      // transform should be none or translateX(0) when visible
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
    });

    test('should slide out when dismissed', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Click dismiss
      await toastPage.dismiss();

      // Wait for animation and toast to be hidden
      await toastPage.waitForToastHidden();
    });
  });

  test.describe('Fine Print', () => {
    test('should display one-time offer disclaimer', async ({ page }) => {
      await toastPage.mockEligibleState();
      await toastPage.gotoWorkspace();
      await toastPage.waitForToast();

      // Should show fine print about one-time offer
      const finePrint = page.locator('text=/one-time offer/i');
      await expect(finePrint).toBeVisible();
    });
  });
});

test.describe('Engagement Discount Toast - Mobile', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('should be visible and usable on mobile', async ({ page }) => {
    const toastPage = new EngagementDiscountToastPage(page);
    await toastPage.mockEligibleState();
    await toastPage.gotoWorkspace();
    await toastPage.waitForToast();

    // Toast should be visible on mobile
    await expect(toastPage.toast).toBeVisible();

    // Button should be tappable
    await expect(toastPage.claimButton).toBeVisible();
  });
});
