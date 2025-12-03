import { TestDataManager, ITestUser } from './test-data-manager';

export type SubscriptionStatus = 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
export type SubscriptionTier = 'starter' | 'pro' | 'business';

export interface IUserBuilderOptions {
  subscription?: SubscriptionStatus;
  tier?: SubscriptionTier;
  credits?: number;
  email?: string;
  password?: string;
  subscriptionId?: string;
  customerId?: string;
}

export interface IPresetUserConfig {
  subscription: SubscriptionStatus;
  tier?: SubscriptionTier;
  credits: number;
}

/**
 * Builder pattern for creating test users with specific configurations
 *
 * Provides a fluent API for building test users with various subscription
 * states, credit amounts, and custom properties. Makes test setup more
 * readable and maintainable.
 */
export class UserBuilder {
  private options: IUserBuilderOptions = {
    subscription: 'free',
    credits: 10,
  };

  constructor(private dataManager: TestDataManager) {}

  /**
   * Sets subscription status and optional tier
   *
   * @param status - Subscription status
   * @param tier - Subscription tier (required for non-free subscriptions)
   * @returns This builder for chaining
   */
  withSubscription(status: SubscriptionStatus, tier?: SubscriptionTier): this {
    this.options.subscription = status;
    this.options.tier = tier;
    return this;
  }

  /**
   * Sets the user's credit balance
   *
   * @param amount - Number of credits to assign
   * @returns This builder for chaining
   */
  withCredits(amount: number): this {
    this.options.credits = amount;
    return this;
  }

  /**
   * Sets a specific email for the user
   *
   * @param email - User email address
   * @returns This builder for chaining
   */
  withEmail(email: string): this {
    this.options.email = email;
    return this;
  }

  /**
   * Sets a specific password for the user
   *
   * @param password - User password
   * @returns This builder for chaining
   */
  withPassword(password: string): this {
    this.options.password = password;
    return this;
  }

  /**
   * Sets a custom subscription ID
   *
   * @param subscriptionId - Custom subscription identifier
   * @returns This builder for chaining
   */
  withSubscriptionId(subscriptionId: string): this {
    this.options.subscriptionId = subscriptionId;
    return this;
  }

  /**
   * Sets a custom customer ID
   *
   * @param customerId - Custom customer identifier
   * @returns This builder for chaining
   */
  withCustomerId(customerId: string): this {
    this.options.customerId = customerId;
    return this;
  }

  // Preset configurations for common user types

  /**
   * Creates a free tier user with standard credits
   *
   * @param credits - Number of credits (default: 10)
   * @returns This builder for chaining
   */
  asFreeUser(credits = 10): this {
    return this.withSubscription('free').withCredits(credits);
  }

  /**
   * Creates a pro tier active user
   *
   * @param credits - Number of credits (default: 500)
   * @returns This builder for chaining
   */
  asProUser(credits = 500): this {
    return this.withSubscription('active', 'pro').withCredits(credits);
  }

  /**
   * Creates a business tier active user
   *
   * @param credits - Number of credits (default: 1000)
   * @returns This builder for chaining
   */
  asBusinessUser(credits = 1000): this {
    return this.withSubscription('active', 'business').withCredits(credits);
  }

  /**
   * Creates a starter tier active user
   *
   * @param credits - Number of credits (default: 100)
   * @returns This builder for chaining
   */
  asStarterUser(credits = 100): this {
    return this.withSubscription('active', 'starter').withCredits(credits);
  }

  /**
   * Creates a trialing user
   *
   * @param tier - Subscription tier for trial (default: pro)
   * @returns This builder for chaining
   */
  asTrialingUser(tier: SubscriptionTier = 'pro'): this {
    return this.withSubscription('trialing', tier);
  }

  /**
   * Creates a user with past due subscription
   *
   * @param tier - Subscription tier (default: pro)
   * @returns This builder for chaining
   */
  asPastDueUser(tier: SubscriptionTier = 'pro'): this {
    return this.withSubscription('past_due', tier);
  }

  /**
   * Creates a user with canceled subscription
   *
   * @param tier - Original subscription tier (default: pro)
   * @returns This builder for chaining
   */
  asCanceledUser(tier: SubscriptionTier = 'pro'): this {
    return this.withSubscription('canceled', tier);
  }

  /**
   * Creates a user with expired trial
   *
   * @param tier - Original trial tier (default: pro)
   * @returns This builder for chaining
   */
  asExpiredTrialUser(tier: SubscriptionTier = 'pro'): this {
    return this.withSubscription('canceled', tier);
  }

  /**
   * Creates a user with maximum credits for testing limits
   *
   * @param credits - High credit amount (default: 10000)
   * @returns This builder for chaining
   */
  asHighCreditUser(credits = 10000): this {
    return this.withSubscription('active', 'business').withCredits(credits);
  }

  /**
   * Creates a user with zero credits for testing edge cases
   *
   * @returns This builder for chaining
   */
  asZeroCreditUser(): this {
    return this.withSubscription('free').withCredits(0);
  }

  /**
   * Creates a user with custom configuration
   *
   * @param config - User configuration object
   * @returns This builder for chaining
   */
  withConfig(config: IUserBuilderOptions): this {
    this.options = { ...this.options, ...config };
    return this;
  }

  /**
   * Builds the test user with current configuration
   *
   * @returns Promise resolving to configured test user
   */
  async build(): Promise<ITestUser> {
    const {
      subscription = 'free',
      tier,
      credits = 10,
      email,
      password,
      subscriptionId,
      customerId,
    } = this.options;

    let user: ITestUser;

    // Create user with appropriate subscription
    if (subscription === 'free') {
      user = email
        ? await this.dataManager.createTestUser({ email, password })
        : await this.dataManager.createTestUser();

      // Adjust credits if not default
      if (credits !== 10) {
        await this.dataManager.addCredits(user.id, credits - 10, 'bonus');
      }
    } else {
      user = email
        ? await this.dataManager.createTestUser({ email, password })
        : await this.dataManager.createTestUser();

      // Set subscription status
      await this.dataManager.setSubscriptionStatus(
        user.id,
        subscription,
        tier,
        subscriptionId
      );

      // Set credits if specified
      if (credits !== 10) {
        await this.dataManager.addCredits(user.id, credits - 10, 'bonus');
      }
    }

    // Set customer ID if provided
    if (customerId) {
      try {
        // Note: This would require direct database access or additional methods in TestDataManager
        console.warn(`Customer ID setting not implemented: ${customerId}`);
      } catch (error) {
        console.warn(`Failed to set customer ID: ${error}`);
      }
    }

    return user;
  }

  /**
   * Builds multiple users with the same configuration
   *
   * @param count - Number of users to create
   * @returns Promise resolving to array of configured test users
   */
  async buildMany(count: number): Promise<ITestUser[]> {
    const users: ITestUser[] = [];
    for (let i = 0; i < count; i++) {
      const user = await this.build();
      users.push(user);
    }
    return users;
  }
}

/**
 * Factory for creating user builders with common patterns
 *
 * Provides convenience methods for creating different types of test users
 * and manages the underlying TestDataManager instance.
 */
export class UserFactory {
  constructor(private dataManager: TestDataManager) {}

  /**
   * Creates a new user builder
   *
   * @returns Fresh UserBuilder instance
   */
  create(): UserBuilder {
    return new UserBuilder(this.dataManager);
  }

  // Convenience methods for common user types

  /**
   * Creates a free tier user
   *
   * @param credits - Number of credits (default: 10)
   * @returns Promise resolving to free test user
   */
  async freeUser(credits = 10): Promise<ITestUser> {
    return this.create().asFreeUser(credits).build();
  }

  /**
   * Creates a pro tier user
   *
   * @param credits - Number of credits (default: 500)
   * @returns Promise resolving to pro test user
   */
  async proUser(credits = 500): Promise<ITestUser> {
    return this.create().asProUser(credits).build();
  }

  /**
   * Creates a business tier user
   *
   * @param credits - Number of credits (default: 1000)
   * @returns Promise resolving to business test user
   */
  async businessUser(credits = 1000): Promise<ITestUser> {
    return this.create().asBusinessUser(credits).build();
  }

  /**
   * Creates a starter tier user
   *
   * @param credits - Number of credits (default: 100)
   * @returns Promise resolving to starter test user
   */
  async starterUser(credits = 100): Promise<ITestUser> {
    return this.create().asStarterUser(credits).build();
  }

  /**
   * Creates a trialing user
   *
   * @param tier - Subscription tier for trial (default: pro)
   * @returns Promise resolving to trialing test user
   */
  async trialingUser(tier: SubscriptionTier = 'pro'): Promise<ITestUser> {
    return this.create().asTrialingUser(tier).build();
  }

  /**
   * Creates a user with past due subscription
   *
   * @param tier - Subscription tier (default: pro)
   * @returns Promise resolving to past due test user
   */
  async pastDueUser(tier: SubscriptionTier = 'pro'): Promise<ITestUser> {
    return this.create().asPastDueUser(tier).build();
  }

  /**
   * Creates a user with canceled subscription
   *
   * @param tier - Original subscription tier (default: pro)
   * @returns Promise resolving to canceled test user
   */
  async canceledUser(tier: SubscriptionTier = 'pro'): Promise<ITestUser> {
    return this.create().asCanceledUser(tier).build();
  }

  /**
   * Creates a user with zero credits
   *
   * @returns Promise resolving to zero credit test user
   */
  async zeroCreditUser(): Promise<ITestUser> {
    return this.create().asZeroCreditUser().build();
  }

  /**
   * Creates a user with high credits for testing limits
   *
   * @param credits - High credit amount (default: 10000)
   * @returns Promise resolving to high credit test user
   */
  async highCreditUser(credits = 10000): Promise<ITestUser> {
    return this.create().asHighCreditUser(credits).build();
  }

  /**
   * Creates multiple users of the same type
   *
   * @param type - User type preset
   * @param count - Number of users to create
   * @param options - Additional options for user creation
   * @returns Promise resolving to array of test users
   */
  async createMany(
    type: keyof IPresetUserConfig | 'custom',
    count: number,
    options: IUserBuilderOptions = {}
  ): Promise<ITestUser[]> {
    const users: ITestUser[] = [];

    for (let i = 0; i < count; i++) {
      let user: ITestUser;

      switch (type) {
        case 'free':
          user = await this.freeUser(options.credits);
          break;
        case 'active':
          user = await this.proUser(options.credits);
          break;
        case 'trialing':
          user = await this.trialingUser(options.tier);
          break;
        case 'past_due':
          user = await this.pastDueUser(options.tier);
          break;
        case 'canceled':
          user = await this.canceledUser(options.tier);
          break;
        case 'custom':
          user = await this.create().withConfig(options).build();
          break;
        default:
          throw new Error(`Unknown user type: ${type}`);
      }

      users.push(user);
    }

    return users;
  }

  /**
   * Creates users with different tiers for comparison testing
   *
   * @param creditsPerTier - Credits per tier (default: free:10, starter:100, pro:500, business:1000)
   * @returns Promise resolving to users of all tiers
   */
  async createAllTiers(creditsPerTier: Partial<Record<SubscriptionTier, number>> = {}): Promise<{
    free: ITestUser;
    starter: ITestUser;
    pro: ITestUser;
    business: ITestUser;
  }> {
    const defaultCredits = {
      starter: 100,
      pro: 500,
      business: 1000,
      ...creditsPerTier,
    };

    const [free, starter, pro, business] = await Promise.all([
      this.freeUser(),
      this.starterUser(defaultCredits.starter),
      this.proUser(defaultCredits.pro),
      this.businessUser(defaultCredits.business),
    ]);

    return { free, starter, pro, business };
  }
}