import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { CREDIT_COSTS } from '@shared/config/credits.config';

export class HomePage extends BasePage {
  // Navigation
  navbar: Locator;
  logo: Locator;
  mobileMenuButton: Locator;
  desktopNav: Locator;
  freeCreditsIndicator: Locator;

  // Hero Section
  heroSection: Locator;
  heroTitle: Locator;
  heroSubtitle: Locator;
  versionBadge: Locator;
  socialProof: Locator;

  // Workspace Section
  workspaceSection: Locator;
  dropzone: Locator;

  // Features Section
  featuresSection: Locator;
  featureCards: Locator;

  // How It Works Section
  howItWorksSection: Locator;
  steps: Locator;

  // Pricing Section
  pricingSection: Locator;
  pricingCards: Locator;

  // Footer
  footer: Locator;
  footerLinks: Locator;

  constructor(page: Page) {
    super(page);

    // Navigation elements (only those not provided by BasePage)
    this.navbar = page.locator('header').first();
    this.logo = page.locator('header a[href="/"]').first();
    this.mobileMenuButton = page
      .locator('header button')
      .filter({ hasNot: page.locator('a') })
      .first();
    this.desktopNav = page.locator('nav.hidden.md\\:flex');
    this.freeCreditsIndicator = page.getByText(`${CREDIT_COSTS.DEFAULT_FREE_CREDITS} Free Credits`);

    // Hero elements
    this.heroSection = page.locator('section').first();
    this.heroTitle = page.locator('h1').first();
    this.heroSubtitle = page.locator('h1 + p').first();
    this.versionBadge = page.getByText('v2.0 Now Available');
    this.socialProof = page.getByText(/10,000\+ businesses/);

    // Workspace
    this.workspaceSection = page.locator('.bg-white.rounded-2xl, .rounded-\\[22px\\]').first();
    this.dropzone = page.locator('.border-dashed');

    // Features
    this.featuresSection = page.locator('#features, section:has-text("Features")');
    this.featureCards = page
      .locator('[class*="feature"], .grid > div')
      .filter({ has: page.locator('h3') });

    // How it works
    this.howItWorksSection = page.locator('#how-it-works, section:has-text("How it Works")');
    this.steps = page.locator('[class*="step"], .flex.items-start');

    // Pricing
    this.pricingSection = page.locator('#pricing, section:has-text("Pricing")');
    this.pricingCards = page
      .locator('[class*="pricing"], .rounded-2xl')
      .filter({ has: page.locator('button') });

    // Footer
    this.footer = page.locator('footer');
    this.footerLinks = page.locator('footer a');
  }

  async goto(): Promise<void> {
    await super.goto('/');
  }

  async waitForLoad(): Promise<void> {
    await expect(this.heroTitle).toBeVisible({ timeout: 15000 });
  }

  // Navigation helpers
  async isMobileView(): Promise<boolean> {
    return await this.mobileMenuButton.isVisible();
  }

  async isDesktopView(): Promise<boolean> {
    return await this.desktopNav.isVisible();
  }

  async clickMobileMenu(): Promise<void> {
    await this.mobileMenuButton.click();
  }

  async openMobileMenuAndWaitForSignIn(): Promise<void> {
    await this.clickMobileMenu();
    // Wait for sign in button to become visible after menu opens
    await expect(this.signInButton).toBeVisible({ timeout: 5000 });
  }

  // Viewport assertions
  async assertNavbarVisible(): Promise<void> {
    await expect(this.navbar).toBeVisible();
    await expect(this.logo).toBeVisible();
  }

  async assertHeroVisible(): Promise<void> {
    await expect(this.heroTitle).toBeVisible();
  }

  async assertHeroTextReadable(): Promise<void> {
    // Check that hero text is not clipped
    const titleBox = await this.heroTitle.boundingBox();
    expect(titleBox).not.toBeNull();
    if (titleBox) {
      expect(titleBox.width).toBeGreaterThan(100);
      expect(titleBox.height).toBeGreaterThan(30);
    }
  }

  async assertWorkspaceVisible(): Promise<void> {
    await expect(this.workspaceSection).toBeVisible();
  }

  async assertFeaturesVisible(): Promise<void> {
    await expect(this.featuresSection).toBeVisible();
  }

  async assertPricingVisible(): Promise<void> {
    await expect(this.pricingSection).toBeVisible();
  }

  async assertFooterVisible(): Promise<void> {
    await expect(this.footer).toBeVisible();
  }

  // Scroll helpers
  async scrollToFeatures(): Promise<void> {
    await this.featuresSection.scrollIntoViewIfNeeded();
  }

  async scrollToPricing(): Promise<void> {
    await this.pricingSection.scrollIntoViewIfNeeded();
  }

  async scrollToFooter(): Promise<void> {
    await this.footer.scrollIntoViewIfNeeded();
  }

  // Layout assertions
  async assertNoHorizontalOverflow(): Promise<void> {
    const viewportWidth = await this.page.evaluate(() => window.innerWidth);
    const scrollWidth = await this.page.evaluate(() => document.body.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 1); // Allow 1px tolerance
  }

  async assertElementsNotOverlapping(locator1: Locator, locator2: Locator): Promise<void> {
    const box1 = await locator1.boundingBox();
    const box2 = await locator2.boundingBox();

    if (box1 && box2) {
      const overlapping =
        box1.x < box2.x + box2.width &&
        box1.x + box1.width > box2.x &&
        box1.y < box2.y + box2.height &&
        box1.y + box1.height > box2.y;
      expect(overlapping).toBe(false);
    }
  }

  async getViewportSize(): Promise<{ width: number; height: number }> {
    return await this.page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  }
}
