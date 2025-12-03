import { APIRequestContext } from '@playwright/test';
import { TestDataManager, ITestUser } from './test-data-manager';

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
    tier?: 'starter' | 'pro' | 'business';
    credits?: number;
  }): Promise<ITestUser> {
    const { subscription = 'free', tier, credits = 10 } = options || {};

    const user = subscription === 'free'
      ? await this.dataManager.createTestUser()
      : await this.dataManager.createTestUserWithSubscription(subscription, tier, credits);

    this.users.push(user);
    return user;
  }

  /**
   * Creates multiple test users for scenarios requiring multiple accounts
   *
   * @param count - Number of users to create
   * @param options - User configuration options applied to all users
   * @returns Array of test users
   */
  async createUsers(count: number, options?: {
    subscription?: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
    tier?: 'starter' | 'pro' | 'business';
    credits?: number;
  }): Promise<ITestUser[]> {
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
   * Runs all registered cleanup callbacks and deletes all created users
   */
  async cleanup(): Promise<void> {
    // Run custom cleanup callbacks first
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        console.warn('Cleanup callback failed:', error);
      }
    }

    // Clean up users through data manager
    try {
      await this.dataManager.cleanupAllUsers();
    } catch (error) {
      console.warn('User cleanup failed:', error);
    }

    // Reset internal state
    this.users = [];
    this.cleanupCallbacks = [];
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
}