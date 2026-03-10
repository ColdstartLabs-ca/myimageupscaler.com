import { TestDataManager, type ITestUser } from './test-data-manager';

export interface ITestContextOptions {
  autoCleanup?: boolean;
}

/**
 * Unified test context for managing test resources, users, and cleanup
 *
 * This class centralizes test resource management, ensuring proper cleanup
 * and preventing resource leaks across different test types.
 */
export class TestContext {
  private dataManager: TestDataManager;
  private users: ITestUser[] = [];
  private cleanupCallbacks: (() => Promise<void>)[] = [];
  private options: ITestContextOptions;

  constructor(options: ITestContextOptions = { autoCleanup: true }) {
    this.options = options;
    this.dataManager = new TestDataManager();
  }

  /**
   * Creates a test user and tracks it for cleanup
   *
   * @param options - User configuration options
   * @returns Test user with authentication token
   */
  async createUser(options?: {
    subscription?: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    tier?: 'starter' | 'hobby' | 'pro' | 'business';
    credits?: number;
  }): Promise<ITestUser> {
    const { subscription = 'free', tier, credits = 10 } = options || {};

    try {
      const user =
        subscription === 'free'
          ? await this.dataManager.createTestUser()
          : await this.dataManager.createTestUserWithSubscription(subscription, tier, credits);

      this.users.push(user);
      return user;
    } catch (error) {
      // In test environment, if user creation fails, create a mock user
      if (process.env.ENV === 'test') {
        console.warn('User creation failed, creating mock user for test environment:', error);
        const mockUserId = this.generateUUID();
        const mockToken =
          subscription === 'free'
            ? `test_token_mock_user_${mockUserId}`
            : `test_token_mock_user_${mockUserId}_sub_${subscription}_${tier || 'pro'}`;

        const mockUser: ITestUser = {
          id: mockUserId,
          email: `test-${mockUserId}@example.com`,
          token: mockToken,
        };

        this.users.push(mockUser);
        return mockUser;
      }
      throw error;
    }
  }

  /**
   * Creates multiple test users for scenarios requiring multiple accounts
   *
   * @param count - Number of users to create
   * @param options - User configuration options applied to all users
   * @returns Array of test users
   */
  async createUsers(
    count: number,
    options?: {
      subscription?: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
      tier?: 'starter' | 'hobby' | 'pro' | 'business';
      credits?: number;
    }
  ): Promise<ITestUser[]> {
    const users: ITestUser[] = [];
    for (let i = 0; i < count; i++) {
      const user = await this.createUser(options);
      users.push(user);
    }
    return users;
  }

  /**
   * Gets the underlying data manager for advanced operations
   *
   * @returns TestDataManager instance for direct database operations
   */
  get data(): TestDataManager {
    return this.dataManager;
  }

  /**
   * Gets direct access to Supabase admin client for advanced operations
   *
   * @returns Supabase client instance
   */
  get supabaseAdmin() {
    return this.dataManager.getSupabaseClient();
  }

  /**
   * Gets all users created by this test context
   *
   * @returns Array of created test users
   */
  get createdUsers(): ITestUser[] {
    return [...this.users];
  }

  /**
   * Registers a cleanup callback to be executed during cleanup
   *
   * @param callback - Async function to run during cleanup
   */
  onCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Removes a user from tracking without deleting them from database
   *
   * @param userId - ID of user to remove from tracking
   */
  untrackUser(userId: string): void {
    this.users = this.users.filter(user => user.id !== userId);
  }

  /**
   * Cleans up all resources created by this test context
   *
   * Runs all registered cleanup callbacks and deletes all created users.
   * Collects all errors and throws at the end to ensure all cleanup attempts are made.
   */
  async cleanup(): Promise<void> {
    const errors: Error[] = [];
    const CLEANUP_TIMEOUT_MS = 30000; // 30 second timeout per callback

    // Run custom cleanup callbacks first with timeout
    for (const callback of this.cleanupCallbacks) {
      try {
        await Promise.race([
          callback(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Cleanup callback timeout')), CLEANUP_TIMEOUT_MS)
          ),
        ]);
      } catch (error) {
        const cleanupError =
          error instanceof Error ? error : new Error(`Cleanup callback failed: ${String(error)}`);
        console.warn('Cleanup callback failed:', cleanupError.message);
        errors.push(cleanupError);
      }
    }

    // Clean up users through data manager
    try {
      await this.dataManager.cleanupAllUsers();
    } catch (error) {
      const userCleanupError =
        error instanceof Error ? error : new Error(`User cleanup failed: ${String(error)}`);
      console.warn('User cleanup failed:', userCleanupError.message);
      errors.push(userCleanupError);
    }

    // Reset internal state regardless of errors
    this.users = [];
    this.cleanupCallbacks = [];

    // If any errors occurred, throw an aggregate error
    if (errors.length > 0) {
      const errorMessages = errors.map(e => e.message).join('; ');
      throw new Error(`Cleanup failed with ${errors.length} error(s): ${errorMessages}`);
    }
  }

  /**
   * Cleans up a specific user immediately
   *
   * @param userId - ID of user to clean up
   */
  async cleanupUser(userId: string): Promise<void> {
    try {
      await this.dataManager.cleanupUser(userId);
      this.untrackUser(userId);
    } catch (error) {
      console.warn(`Failed to cleanup user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Gets the current user count
   *
   * @returns Number of tracked users
   */
  get userCount(): number {
    return this.users.length;
  }

  /**
   * Checks if auto cleanup is enabled
   *
   * @returns True if auto cleanup is enabled
   */
  get isAutoCleanupEnabled(): boolean {
    return this.options.autoCleanup ?? true;
  }

  /**
   * Sets up Stripe customer ID for webhook tests
   * This enables webhooks to properly look up users by stripe_customer_id
   *
   * @param userId - User ID to set up
   * @param customerId - Optional Stripe customer ID (defaults to cus_${userId})
   */
  async setupStripeCustomer(userId: string, customerId?: string): Promise<void> {
    const stripeCustomerId = customerId || `cus_${userId}`;
    const isTestMode = process.env.ENV === 'test';

    if (isTestMode) {
      // In test mode, update the test mode profile
      const existingProfile = (this.dataManager as any).testModeProfiles?.get(userId);
      if (existingProfile) {
        existingProfile.stripe_customer_id = stripeCustomerId;
        existingProfile.updated_at = new Date().toISOString();
        (this.dataManager as any).testModeProfiles.set(userId, existingProfile);
      }
      return;
    }

    // In production mode, update the database
    const { error } = await this.supabaseAdmin
      .from('profiles')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to set stripe_customer_id: ${error.message}`);
    }
  }

  /**
   * Generates a UUID v4 for test users
   *
   * @returns A valid UUID string
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c == 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
