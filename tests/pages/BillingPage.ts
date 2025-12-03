import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class BillingPage extends BasePage {
  // Page header
  readonly pageTitle: Locator;
  readonly pageDescription: Locator;
  readonly refreshButton: Locator;

  // Current Plan section
  readonly currentPlanSection: Locator;
  readonly currentPlanIcon: Locator;
  readonly currentPlanTitle: Locator;
  readonly currentPlanName: Locator;
  readonly planStatusBadge: Locator;
  readonly creditsBalanceLabel: Locator;
  readonly creditsBalanceValue: Locator;
  readonly upgradeOrBuyButton: Locator;

  // Subscription details
  readonly subscriptionDetails: Locator;
  readonly currentPeriodEndLabel: Locator;
  readonly currentPeriodEndValue: Locator;
  readonly cancelationNotice: Locator;

  // Payment Methods section
  readonly paymentMethodsSection: Locator;
  readonly paymentMethodsIcon: Locator;
  readonly paymentMethodsTitle: Locator;
  readonly paymentMethodsDescription: Locator;
  readonly manageSubscriptionButton: Locator;
  readonly noPaymentMethodsMessage: Locator;
  readonly viewPricingButton: Locator;

  // Billing History section
  readonly billingHistorySection: Locator;
  readonly billingHistoryIcon: Locator;
  readonly billingHistoryTitle: Locator;
  readonly billingHistoryDescription: Locator;
  readonly viewInvoicesButton: Locator;
  readonly noBillingHistoryMessage: Locator;

  constructor(page: Page) {
    super(page);

    // Page header
    this.pageTitle = page.getByRole('heading', { name: 'Billing' });
    this.pageDescription = page.getByText('Manage your subscription and payment methods');
    this.refreshButton = page.getByRole('button', { name: /Refresh/i }).first();

    // Current Plan section
    this.currentPlanSection = page.locator('div').filter({ hasText: 'Current Plan' }).first();
    this.currentPlanIcon = page.locator('[data-testid="plan-icon"], .lucide-package');
    this.currentPlanTitle = page.getByRole('heading', { name: 'Current Plan' });
    this.currentPlanName = page
      .locator('p')
      .filter({ hasText: /Plan|Free/ })
      .first();
    this.planStatusBadge = page
      .locator('span')
      .filter({ hasText: /(Active|Trialing|Past due|Canceled|Free)/ })
      .first();
    this.creditsBalanceLabel = page.getByText('Credits balance');
    this.creditsBalanceValue = page.locator('p').filter({ hasText: /^\d+$/ }).first();
    this.upgradeOrBuyButton = page.getByRole('button', { name: /(Upgrade Plan|Buy More Credits)/ });

    // Subscription details
    this.subscriptionDetails = page.locator(
      '[data-testid="subscription-details"], div:has-text("Current Period Ends")'
    );
    this.currentPeriodEndLabel = page.getByText('Current Period Ends');
    this.currentPeriodEndValue = page
      .locator('div')
      .filter({ hasText: /Current Period Ends/ })
      .locator('span.font-medium');
    this.cancelationNotice = page.locator('div').filter({ hasText: /will be canceled at the end/ });

    // Payment Methods section
    this.paymentMethodsSection = page.locator('div').filter({ hasText: 'Payment Methods' }).first();
    this.paymentMethodsIcon = page.locator('[data-testid="payment-icon"], .lucide-credit-card');
    this.paymentMethodsTitle = page.getByRole('heading', { name: 'Payment Methods' });
    this.paymentMethodsDescription = page.getByText(
      'Manage your payment methods and subscriptions'
    );
    this.manageSubscriptionButton = page.getByRole('button', { name: /Manage Subscription/ });
    this.noPaymentMethodsMessage = page.getByText('No payment methods added yet');
    this.viewPricingButton = page.getByRole('button', { name: 'View Pricing' });

    // Billing History section
    this.billingHistorySection = page.locator('div').filter({ hasText: 'Billing History' }).first();
    this.billingHistoryIcon = page.locator('[data-testid="billing-icon"], .lucide-receipt');
    this.billingHistoryTitle = page.getByRole('heading', { name: 'Billing History' });
    this.billingHistoryDescription = page.getByText('View your past invoices and receipts');
    this.viewInvoicesButton = page.getByRole('button', { name: /View Invoices/ });
    this.noBillingHistoryMessage = page.getByText('No billing history yet');
  }

  /**
   * Navigate to the billing page and wait for load
   */
  async goto(): Promise<void> {
    await super.goto('/dashboard/billing');
    await this.waitForLoad();
  }

  /**
   * Wait for the page to load completely
   */
  async waitForLoad(): Promise<void> {
    await this.waitForPageLoad();
    await expect(this.pageTitle).toBeVisible();
    await expect(this.currentPlanSection).toBeVisible();
    await expect(this.paymentMethodsSection).toBeVisible();
    await expect(this.billingHistorySection).toBeVisible();
  }

  /**
   * Get the current credits balance as a number
   */
  async getCreditsBalance(): Promise<number> {
    const balanceText = await this.creditsBalanceValue.textContent();
    return parseInt(balanceText || '0', 10);
  }

  /**
   * Get the current plan name
   */
  async getCurrentPlanName(): Promise<string> {
    const planText = await this.currentPlanName.textContent();
    return planText || '';
  }

  /**
   * Get the subscription status
   */
  async getSubscriptionStatus(): Promise<string> {
    const statusText = await this.planStatusBadge.textContent();
    return statusText || '';
  }

  /**
   * Check if user has a subscription (not free plan)
   */
  async hasSubscription(): Promise<boolean> {
    const planName = await this.getCurrentPlanName();
    return !planName.includes('Free');
  }

  /**
   * Check if manage subscription button is visible
   */
  async hasManageSubscriptionButton(): Promise<boolean> {
    return await this.manageSubscriptionButton.isVisible();
  }

  /**
   * Click upgrade or buy credits button
   */
  async clickUpgradeOrBuyCredits(): Promise<void> {
    await this.upgradeOrBuyButton.click();
  }

  /**
   * Click manage subscription button
   */
  async clickManageSubscription(): Promise<void> {
    await this.manageSubscriptionButton.click();
  }

  /**
   * Refresh the billing page
   */
  async refresh(): Promise<void> {
    await this.refreshButton.click();
    await this.waitForNetworkIdle();
  }

  /**
   * Get current period end date if subscription exists
   */
  async getCurrentPeriodEnd(): Promise<string | null> {
    if (!(await this.currentPeriodEndValue.isVisible())) {
      return null;
    }
    return await this.currentPeriodEndValue.textContent();
  }

  /**
   * Check if cancellation notice is visible
   */
  async hasCancellationNotice(): Promise<boolean> {
    return await this.cancelationNotice.isVisible();
  }

  /**
   * Verify billing page displays correct information for a free user
   */
  async verifyFreeUserState(): Promise<void> {
    await expect(this.currentPlanName).toContainText('Free');
    await expect(this.creditsBalanceValue).toBeVisible();
    await expect(this.upgradeOrBuyButton).toContainText('Upgrade Plan');
    await expect(this.manageSubscriptionButton).not.toBeVisible();
    await expect(this.viewPricingButton).toBeVisible();
  }

  /**
   * Verify billing page displays correct information for a subscribed user
   */
  async verifySubscribedUserState(planName: string, status: string): Promise<void> {
    await expect(this.currentPlanName).toContainText(planName);
    await expect(this.planStatusBadge).toContainText(status);
    await expect(this.creditsBalanceValue).toBeVisible();
    await expect(this.upgradeOrBuyButton).toContainText('Buy More Credits');
    await expect(this.manageSubscriptionButton).toBeVisible();
    await expect(this.currentPeriodEndValue).toBeVisible();
  }

  /**
   * Wait for success message (typically after redirect from checkout)
   *
   * @param expectedMessage - Optional expected success message
   */
  async waitForSuccessMessage(expectedMessage?: string): Promise<void> {
    if (expectedMessage) {
      const toast = await this.waitForToast(expectedMessage);
      await expect(toast).toBeVisible();
    } else {
      // Wait for any success toast
      const toast = await this.waitForToast();
      await expect(toast).toBeVisible();
    }

    // Allow time for any animations
    await this.wait(1000);
  }

  /**
   * Check for error toast message
   *
   * @param expectedError - Optional expected error message
   * @returns True if error toast is visible
   */
  async hasErrorToast(expectedError?: string): Promise<boolean> {
    return await this.isToastVisible(expectedError || 'error');
  }

  /**
   * Wait for billing page to be updated after operations
   */
  async waitForBillingUpdate(): Promise<void> {
    // Wait for network requests to complete
    await this.waitForNetworkIdle();

    // Wait a bit for UI updates
    await this.wait(500);

    // Verify page is still in valid state
    await expect(this.pageTitle).toBeVisible();
  }
}
