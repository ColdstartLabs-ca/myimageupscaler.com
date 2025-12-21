import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class PricingPage extends BasePage {
  // Page header
  readonly pageTitle: Locator;
  readonly pageDescription: Locator;

  // Subscription plans section
  readonly subscriptionsSection: Locator;
  readonly subscriptionsTitle: Locator;
  readonly subscriptionsDescription: Locator;
  readonly pricingGrid: Locator;

  // FAQ section
  readonly faqSection: Locator;
  readonly faqTitle: Locator;

  // Custom plan CTA
  readonly customPlanSection: Locator;
  readonly customPlanTitle: Locator;
  readonly contactSalesButton: Locator;

  // Individual plan cards
  readonly hobbyCard: Locator;
  readonly proCard: Locator;
  readonly businessCard: Locator;
  readonly starterCard: Locator;

  constructor(page: Page) {
    super(page);

    // Page header - use a more flexible selector for the page title
    this.pageTitle = page.locator('h1').filter({ hasText: 'Simple, Transparent Pricing' }).first();
    this.pageDescription = page.getByText('Choose the subscription plan that fits your needs');

    // Subscription plans section - locate by h2 heading "Choose Your Plan"
    this.subscriptionsTitle = page.getByRole('heading', { name: 'Choose Your Plan' });
    this.subscriptionsSection = page.locator('div.mb-16').filter({ has: this.subscriptionsTitle });
    this.subscriptionsDescription = page.getByText(
      'Get credits every month with our subscription plans'
    );
    this.pricingGrid = page.locator('.grid.md\\:grid-cols-2.lg\\:grid-cols-4.gap-8');

    // FAQ section
    this.faqTitle = page.getByRole('heading', { name: 'Frequently Asked Questions' });
    this.faqSection = page.locator('div.max-w-3xl').filter({ has: this.faqTitle });

    // Custom plan CTA
    this.customPlanTitle = page.getByRole('heading', { name: 'Need a custom plan?' });
    this.customPlanSection = page
      .locator('div.bg-gradient-to-br')
      .filter({ has: this.customPlanTitle });
    this.contactSalesButton = page.getByRole('link', { name: 'Contact Sales' });

    // Individual plan cards - scope to pricing grid for more specific selection
    // These need to be initialized after pricingGrid is defined
    this.hobbyCard = this.pricingGrid.locator('div').filter({ hasText: 'Hobby' }).first();
    this.proCard = this.pricingGrid.locator('div').filter({ hasText: 'Professional' }).first();
    this.businessCard = this.pricingGrid.locator('div').filter({ hasText: 'Business' }).first();
    this.starterCard = this.pricingGrid.locator('div').filter({ hasText: 'Starter' }).first();
  }

  /**
   * Navigate to the pricing page and wait for load
   */
  async goto(): Promise<void> {
    await super.goto('/pricing');
    await this.waitForLoad();
  }

  /**
   * Wait for the page to load completely
   */
  async waitForLoad(): Promise<void> {
    await this.waitForPageLoad();

    // Wait for the page title to be visible (it should be visible immediately)
    await expect(this.pageTitle).toBeVisible({ timeout: 5000 });

    // Wait for skeleton cards to be replaced with actual pricing cards
    // Use exact text matching and scope to pricing grid to avoid conflicts with FAQ headings
    const starterHeading = this.pricingGrid.getByRole('heading', { name: 'Starter', exact: true });
    const hobbyHeading = this.pricingGrid.getByRole('heading', { name: 'Hobby', exact: true });
    const proHeading = this.pricingGrid.getByRole('heading', { name: 'Professional', exact: true });
    const businessHeading = this.pricingGrid.getByRole('heading', {
      name: 'Business',
      exact: true,
    });

    // Wait for each plan heading to be visible within the pricing grid
    await expect(starterHeading).toBeVisible({ timeout: 10000 });
    await expect(hobbyHeading).toBeVisible({ timeout: 10000 });
    await expect(proHeading).toBeVisible({ timeout: 10000 });
    await expect(businessHeading).toBeVisible({ timeout: 10000 });

    // Wait for Get Started buttons to be visible (not loading)
    const getStartedButtons = this.pricingGrid.getByRole('button', { name: 'Get Started' });
    await expect(getStartedButtons.first()).toBeVisible({ timeout: 5000 });

    // Ensure subscriptions section is visible
    await expect(this.subscriptionsSection).toBeVisible();
  }

  /**
   * Get a pricing card by name (for subscriptions)
   */
  getSubscriptionCard(planName: string): PricingCard {
    return new PricingCard(this.pricingGrid.locator('div').filter({ hasText: planName }).first());
  }

  /**
   * Get all subscription cards
   */
  async getAllSubscriptionCards(): Promise<PricingCard[]> {
    const cards = this.pricingGrid.locator('> div');
    const count = await cards.count();
    const result: PricingCard[] = [];

    for (let i = 0; i < count; i++) {
      result.push(new PricingCard(cards.nth(i)));
    }

    return result;
  }

  /**
   * Get a specific plan card by plan type
   */
  getPlanCard(planType: 'starter' | 'hobby' | 'pro' | 'business'): PricingCard {
    switch (planType) {
      case 'starter':
        return new PricingCard(this.starterCard);
      case 'hobby':
        return new PricingCard(this.hobbyCard);
      case 'pro':
        return new PricingCard(this.proCard);
      case 'business':
        return new PricingCard(this.businessCard);
      default:
        throw new Error(`Unknown plan type: ${planType}`);
    }
  }

  /**
   * Subscribe to a specific plan
   *
   * @param planName - Name of subscription plan
   */
  async subscribeToPlan(planName: string): Promise<void> {
    const card = this.getSubscriptionCard(planName);
    await card.subscribe();

    // Wait for potential redirect to checkout
    await this.waitForNetworkIdle();
  }

  /**
   * Click contact sales button for custom plans
   */
  async contactSales(): Promise<void> {
    await this.contactSalesButton.click();
    await this.waitForNetworkIdle();
  }

  /**
   * Check if pricing page is currently visible
   *
   * @returns True if pricing page is loaded
   */
  async isLoaded(): Promise<boolean> {
    return await this.pageTitle.isVisible();
  }

  /**
   * Verify that pricing page structure is correct
   */
  async verifyPageStructure(): Promise<void> {
    await expect(this.pageTitle).toBeVisible();
    await expect(this.pageDescription).toBeVisible();
    await expect(this.subscriptionsTitle).toBeVisible();
    await expect(this.subscriptionsDescription).toBeVisible();
    await expect(this.faqTitle).toBeVisible();
  }

  /**
   * Verify that specific subscription plans are available
   */
  async verifySubscriptionPlansAvailable(planNames: string[]): Promise<void> {
    for (const planName of planNames) {
      const card = this.getSubscriptionCard(planName);
      await expect(card.cardLocator).toBeVisible();
      await expect(card.name).toContainText(planName);
    }
  }
}

/**
 * Helper class for individual pricing cards
 */
export class PricingCard {
  readonly cardLocator: Locator;
  readonly name: Locator;
  readonly description: Locator;
  readonly price: Locator;
  readonly interval: Locator;
  readonly credits: Locator;
  readonly features: Locator;
  readonly subscribeButton: Locator;
  readonly recommendedBadge: Locator;

  constructor(cardLocator: Locator) {
    this.cardLocator = cardLocator;
    this.name = cardLocator.locator('.card-title, h2');
    this.description = cardLocator.locator('.text-center.text-sm, p:has-text("Perfect")');
    this.price = cardLocator.locator('.text-4xl, .font-bold');
    this.interval = cardLocator.locator('div:has-text("per")');
    this.credits = cardLocator.locator('div:has-text("credits")');
    this.features = cardLocator.locator('ul.space-y-2');
    this.subscribeButton = cardLocator
      .locator('button')
      .filter({ hasText: /^(Get Started|Upgrade|Downgrade|Start|Current Plan|Scheduled)$/ });
    this.recommendedBadge = cardLocator.locator(
      '.absolute.-top-3 .bg-indigo-500, .absolute.-top-3 .bg-green-500, .absolute.-top-3 .bg-orange-500'
    );
  }

  /**
   * Click subscribe/buy button with loading wait
   */
  async subscribe(): Promise<void> {
    await this.waitForButtonToBeReady();
    await this.subscribeButton.click();
  }

  /**
   * Click buy now button (alias for subscribe)
   */
  async buyNow(): Promise<void> {
    await this.subscribe();
  }

  /**
   * Check if the card is marked as recommended
   */
  async isRecommended(): Promise<boolean> {
    return await this.recommendedBadge.isVisible();
  }

  /**
   * Get the price amount
   */
  async getPrice(): Promise<string> {
    return (await this.price.textContent()) || '';
  }

  /**
   * Get the interval (month/year)
   */
  async getInterval(): Promise<string | null> {
    const text = await this.interval.textContent();
    return text || null;
  }

  /**
   * Get the number of credits if applicable
   */
  async getCreditsAmount(): Promise<number | null> {
    const text = await this.credits.textContent();
    if (!text) return null;

    const match = text.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Wait for button to not be loading
   */
  async waitForButtonToBeReady(): Promise<void> {
    await this.subscribeButton.waitFor({ state: 'visible' });
    // Wait for loading state to clear if present
    await this.cardLocator.waitFor({ state: 'visible' });
  }

  /**
   * Verify card structure is correct
   */
  async verifyStructure(): Promise<void> {
    await expect(this.name).toBeVisible();
    await expect(this.price).toBeVisible();
    await expect(this.subscribeButton).toBeVisible();
  }
}
