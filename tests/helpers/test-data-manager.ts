import { createClient } from '@supabase/supabase-js';

export type ITestUser = {
  id: string;
  email: string;
  token: string;
};

export class TestDataManager {
  private supabase: ReturnType<typeof createClient> | null = null;
  private createdUsers: string[] = [];
  private static userPool: ITestUser[] = [];
  private static poolInitialized = false;
  private isTestMode: boolean;
  private testModeProfiles: Map<string, Record<string, unknown>> = new Map();

  constructor() {
    this.isTestMode = process.env.ENV === 'test';

    if (!this.isTestMode) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error(
          'Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'
        );
      }

      this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
    }
  }

  /**
   * Gets direct access to the Supabase client
   *
   * @returns Supabase client instance or null in test mode
   */
  getSupabaseClient() {
    return this.supabase;
  }

  /**
   * Initialize user pool with shared test users to reduce API calls
   */
  private static async initializeUserPool(): Promise<void> {
    if (this.poolInitialized) return;

    // Skip pool initialization in test mode - use mock users instead
    if (process.env.ENV === 'test') {
      this.poolInitialized = true;
      return;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) return;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Create a pool of test users
    const poolSize = 3; // Reduce pool size to avoid rate limiting
    for (let i = 0; i < poolSize; i++) {
      try {
        const testEmail = `pool-user-${i}@test.pool.local`;
        const testPassword = 'test-password-123';

        // Try to get existing user or create new one
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const user = existingUser.users.find(u => u.email === testEmail);

        let authUser;
        if (user) {
          authUser = user;
        } else {
          // Create new user with longer delay to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
            email: testEmail,
            password: testPassword,
            email_confirm: true,
          });

          if (adminError) {
            console.warn(`Failed to create pool user ${i}:`, adminError.message);
            continue;
          }
          authUser = adminData.user;
        }

        // Add delay before sign in
        await new Promise(resolve => setTimeout(resolve, 500));

        // Sign in to get token with retry logic
        let signInAttempts = 0;
        const maxAttempts = 3;
        let signInData, signInError;

        while (signInAttempts < maxAttempts) {
          const { data: data, error: error } = await supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword,
          });

          signInData = data;
          signInError = error;

          if (!signInError || signInError.message !== 'Request rate limit reached') {
            break;
          }

          signInAttempts++;
          const backoffDelay = Math.min(1000 * Math.pow(2, signInAttempts), 8000);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }

        if (signInError || !signInData.session) {
          console.warn(`Failed to sign in pool user ${i}:`, signInError?.message);
          continue;
        }

        this.userPool.push({
          id: authUser.id,
          email: authUser.email!,
          token: signInData.session.access_token,
        });

        // Add delay between users
        if (i < poolSize - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.warn(`Failed to create pool user ${i}:`, error);
      }
    }

    this.poolInitialized = true;
  }

  /**
   * Get a user from the pool or create a new one if pool is empty
   */
  private async getPooledUser(): Promise<ITestUser> {
    await TestDataManager.initializeUserPool();

    if (TestDataManager.userPool.length > 0) {
      return TestDataManager.userPool.pop()!;
    }

    // Fallback to creating new user with rate limit protection
    await new Promise(resolve => setTimeout(resolve, 500));
    return this.createTestUser();
  }

  /**
   * Return a user to the pool for reuse
   */
  private returnToPool(user: ITestUser): void {
    if (TestDataManager.userPool.length < 10) {
      TestDataManager.userPool.push(user);
    }
  }

  /**
   * Creates a fresh test user with authentication using admin API
   */
  async createTestUser(
    overrides?: Partial<{ email: string; password: string }>
  ): Promise<ITestUser> {
    const testEmail =
      overrides?.email ||
      `test-${Date.now()}-${Math.random().toString(36).substring(7)}@test.local`;
    const testPassword = overrides?.password || 'test-password-123';

    // In test environment, use mock authentication to avoid rate limiting
    if (process.env.ENV === 'test') {
      console.log('Creating mock test user for test environment');
      // Generate a proper UUID for test users to avoid database type issues
      const mockUserId = this.generateUUID();
      // Token format: test_token_mock_user_{userId} - API routes extract userId after 'test_token_mock_user_'
      const mockToken = `test_token_mock_user_${mockUserId}`;

      // Skip all database operations for mock users - use in-memory only

      this.createdUsers.push(mockUserId);
      return {
        id: mockUserId,
        email: testEmail,
        token: mockToken,
      };
    }

    // Add longer delay to avoid rate limiting for non-test environments
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      // Use admin API to create user (bypasses email validation and confirmation)
      const { data: adminData, error: adminError } = await this.supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      });

      if (adminError) {
        // If user already exists, try to sign them in directly
        if (adminError.message.includes('already registered')) {
          const { data: signInData, error: signInError } = await this.supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword,
          });

          if (signInError) {
            throw new Error(`Existing user sign in failed: ${signInError.message}`);
          }

          if (!signInData.session) {
            throw new Error('Failed to sign in existing test user: No session returned');
          }

          this.createdUsers.push(signInData.user.id);
          return {
            id: signInData.user.id,
            email: signInData.user.email!,
            token: signInData.session.access_token,
          };
        }
        throw new Error(`Failed to create test user: ${adminError.message}`);
      }

      if (!adminData.user) {
        throw new Error('Failed to create test user: No user returned');
      }

      // Add another delay before sign in
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Retry sign in with exponential backoff if rate limited
      let signInAttempts = 0;
      const maxSignInAttempts = 5; // Increase max attempts
      let signInData, signInError;

      while (signInAttempts < maxSignInAttempts) {
        try {
          const { data: data, error: error } = await this.supabase.auth.signInWithPassword({
            email: testEmail,
            password: testPassword,
          });

          signInData = data;
          signInError = error;

          if (!signInError || signInError.message !== 'Request rate limit reached') {
            break;
          }
        } catch (err) {
          // Handle network or other errors
          if (signInAttempts === maxSignInAttempts - 1) {
            throw err;
          }
        }

        signInAttempts++;
        const backoffDelay = Math.min(2000 * Math.pow(2, signInAttempts), 15000);
        console.log(`Sign-in attempt ${signInAttempts + 1} failed, retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }

      if (signInError) {
        // Try alternative approach: generate auth token manually
        console.warn('Sign in failed, attempting manual token generation:', signInError.message);

        // Create a mock token for testing (in test environment)
        // Note: This path shouldn't be reached when ENV=test due to early return above
        if (process.env.ENV === 'test') {
          const mockToken = `test_token_${adminData.user.id}`;
          this.createdUsers.push(adminData.user.id);
          return {
            id: adminData.user.id,
            email: adminData.user.email!,
            token: mockToken,
          };
        }

        throw new Error(
          `Failed to sign in test user after ${maxSignInAttempts} attempts: ${signInError.message}`
        );
      }

      if (!signInData.session) {
        throw new Error('Failed to sign in test user: No session returned');
      }

      this.createdUsers.push(adminData.user.id);
      return {
        id: adminData.user.id,
        email: adminData.user.email!,
        token: signInData.session.access_token,
      };
    } catch (error) {
      // Final fallback for test environment
      if (process.env.ENV === 'test') {
        console.warn('Creating mock test user due to authentication issues');
        const mockUserId = `mock_user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const mockToken = `test_token_${mockUserId}`;

        this.createdUsers.push(mockUserId);
        return {
          id: mockUserId,
          email: testEmail,
          token: mockToken,
        };
      }
      throw error;
    }
  }

  /**
   * Sets subscription status for a user directly in the database
   */
  async setSubscriptionStatus(
    userId: string,
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled',
    tier?: 'starter' | 'hobby' | 'pro' | 'business',
    subscriptionId?: string
  ): Promise<void> {
    // Skip all database operations in test mode
    if (this.isTestMode) {
      console.log(`Skipping database update for user in test mode: ${userId}`);
      // Update the test mode profile to track state changes
      const existingProfile = this.testModeProfiles.get(userId) || {
        id: userId,
        credits_balance: 10,
        subscription_status: 'free',
        subscription_tier: null,
        stripe_subscription_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      existingProfile.subscription_status = status;
      existingProfile.subscription_tier = tier || null;
      existingProfile.stripe_subscription_id = subscriptionId || null;
      existingProfile.updated_at = new Date().toISOString();

      this.testModeProfiles.set(userId, existingProfile);
      return;
    }

    // First ensure the user profile exists to avoid foreign key constraint errors
    await this.ensureUserProfile(userId, `test-${userId}@example.com`);

    if (!this.supabase) {
      console.warn('Supabase client not available');
      return;
    }

    // 'free' means no subscription, so use NULL for subscription_status
    const dbStatus = status === 'free' ? null : status;
    const dbTier = status === 'free' ? null : tier;

    const updateData: Record<string, unknown> = {
      subscription_status: dbStatus,
      subscription_tier: dbTier,
      updated_at: new Date().toISOString(),
    };

    // Update profile
    const { error: profileError } = await this.supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);

    if (profileError) {
      console.warn(`Failed to update subscription status: ${profileError.message}`);
      // Don't throw error - continue with subscription creation attempt
    }

    // If subscription ID is provided, try to create/update subscription record
    // Note: May fail due to RLS policies, which is acceptable for test setup
    if (subscriptionId && status !== 'free') {
      const subscriptionData = {
        id: subscriptionId,
        user_id: userId,
        status: status === 'active' ? 'active' : status,
        price_id: 'price_test_pro_monthly', // Mock price ID
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      };

      const { error: subError } = await this.supabase
        .from('subscriptions')
        .upsert(subscriptionData, { onConflict: 'id' });

      if (subError) {
        // Log but don't fail - profile was updated, subscription record is secondary
        console.warn(
          `Could not create subscription record (RLS policy may prevent this): ${subError.message}`
        );
      }
    } else if (status === 'free') {
      // Try to remove subscription records for free users
      const { error: deleteError } = await this.supabase
        .from('subscriptions')
        .delete()
        .eq('user_id', userId);

      if (deleteError) {
        console.warn(
          `Could not delete subscription record (RLS policy may prevent this): ${deleteError.message}`
        );
      }
    }
  }

  /**
   * Adds credits to a user's balance using the RPC function
   * This uses increment_credits_with_log which logs the transaction automatically
   */
  async addCredits(
    userId: string,
    amount: number,
    type: 'purchase' | 'bonus' = 'purchase'
  ): Promise<void> {
    // Skip all database operations in test mode
    if (this.isTestMode) {
      console.log(`Skipping credit addition for user in test mode: ${userId}`);
      // Update the test mode profile to track state changes
      const existingProfile = this.testModeProfiles.get(userId) || {
        id: userId,
        credits_balance: 10,
        subscription_status: 'free',
        subscription_tier: null,
        stripe_subscription_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      existingProfile.credits_balance = (existingProfile.credits_balance as number || 0) + amount;
      existingProfile.updated_at = new Date().toISOString();

      this.testModeProfiles.set(userId, existingProfile);
      return;
    }

    if (!this.supabase) {
      console.warn('Supabase client not available');
      return;
    }

    // First ensure the user profile exists to avoid foreign key constraint errors
    await this.ensureUserProfile(userId, `test-${userId}@example.com`);

    // Use the RPC function which is accessible to service_role
    const { error: rpcError } = await this.supabase.rpc('increment_credits_with_log', {
      target_user_id: userId,
      amount: amount,
      transaction_type: type,
      ref_id: `test_${Date.now()}`,
      description: `Test ${type} credits`,
    });

    if (rpcError) {
      throw new Error(`Failed to add credits: ${rpcError.message}`);
    }
  }

  /**
   * Gets current user profile data
   */
  async getUserProfile(userId: string): Promise<Record<string, unknown>> {
    // In test mode, return the tracked profile for the user
    if (this.isTestMode) {
      // Return the tracked profile or create a default one
      let profile = this.testModeProfiles.get(userId);

      if (!profile) {
        profile = {
          id: userId,
          credits_balance: 10,
          subscription_status: 'free',
          subscription_tier: null,
          stripe_subscription_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Try to parse subscription info from user creation pattern for initial setup
        if (userId.includes('_sub_')) {
          const parts = userId.split('_sub_');
          if (parts.length > 1) {
            const subParts = parts[1].split('_');
            if (subParts.length >= 2) {
              profile.subscription_status = subParts[0];
              profile.subscription_tier = subParts[1];
            }
          }
        }

        // Store the initial profile
        this.testModeProfiles.set(userId, profile);
      }

      return profile;
    }

    if (!this.supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch user profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Gets user's credit transactions
   */
  async getCreditTransactions(userId: string): Promise<Record<string, unknown>[]> {
    // In test mode, return empty array
    if (this.isTestMode) {
      console.log(`Returning empty credit transactions for user in test mode: ${userId}`);
      return [];
    }

    if (!this.supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await this.supabase
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch credit transactions: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Gets user's subscriptions
   */
  async getUserSubscriptions(userId: string): Promise<Record<string, unknown>[]> {
    // In test mode, return empty array
    if (this.isTestMode) {
      console.log(`Returning empty subscriptions for user in test mode: ${userId}`);
      return [];
    }

    if (!this.supabase) {
      throw new Error('Supabase client not available');
    }

    const { data, error } = await this.supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch subscriptions: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Cleans up a test user and all their data
   */
  async cleanupUser(userId: string): Promise<void> {
    // Skip cleanup in test mode - no real users were created
    if (this.isTestMode) {
      console.log(`Skipping cleanup for user in test mode: ${userId}`);
      // Remove from tracking
      this.createdUsers = this.createdUsers.filter(id => id !== userId);
      return;
    }

    if (!this.supabase) {
      console.warn('Supabase client not available for cleanup');
      return;
    }

    try {
      // Delete auth user (this will cascade to profiles due to ON DELETE CASCADE)
      await this.supabase.auth.admin.deleteUser(userId);

      // Remove from created users tracking
      this.createdUsers = this.createdUsers.filter(id => id !== userId);
    } catch (error) {
      console.warn(`Failed to cleanup test user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Cleans up all created test users
   */
  async cleanupAllUsers(): Promise<void> {
    // Skip cleanup in test mode - no real users were created
    if (this.isTestMode) {
      console.log('Skipping cleanup for all users in test mode');
      this.createdUsers = [];
      return;
    }

    const cleanupPromises = this.createdUsers.map(userId => this.cleanupUser(userId));
    await Promise.allSettled(cleanupPromises);
    this.createdUsers = [];
  }

  /**
   * Creates a user with specific subscription state for testing
   */
  async createTestUserWithSubscription(
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled',
    tier?: 'starter' | 'hobby' | 'pro' | 'business',
    initialCredits: number = 10
  ): Promise<ITestUser> {
    // For test environment, create a user with subscription info encoded in token
    if (process.env.ENV === 'test') {
      const mockUserId = this.generateUUID();

      // Create token with subscription info: test_token_mock_user_{userId}_sub_{status}_{tier}
      const mockToken = status === 'free'
        ? `test_token_mock_user_${mockUserId}`
        : `test_token_mock_user_${mockUserId}_sub_${status}_${tier || 'pro'}`;

      this.createdUsers.push(mockUserId);
      return {
        id: mockUserId,
        email: `test-${mockUserId}@example.com`,
        token: mockToken,
      };
    }

    const user = await this.createTestUser();

    // Set initial credits
    if (initialCredits !== 10) {
      await this.addCredits(user.id, initialCredits - 10, 'bonus');
    }

    // Set subscription status
    await this.setSubscriptionStatus(
      user.id,
      status,
      tier,
      status !== 'free' ? `sub_test_${user.id}` : undefined
    );

    return user;
  }

  /**
   * Ensures a user profile exists in the database for mock users
   *
   * @param userId - User ID
   * @param _email - User email (unused, kept for interface compatibility)
   */
  private async ensureUserProfile(userId: string, _email: string): Promise<void> {
    // For mock users in test environment, skip profile creation
    if (userId.includes('mock_user_') && process.env.ENV === 'test') {
      console.log(`Skipping profile creation for mock user: ${userId}`);
      return;
    }

    try {
      // Try to get existing profile
      const { data: existingProfile, error: fetchError } = await this.supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
        console.warn('Error checking existing profile:', fetchError.message);
        return;
      }

      // If profile exists, no need to create
      if (existingProfile) {
        return;
      }

      // Create the profile
      const { error: insertError } = await this.supabase
        .from('profiles')
        .insert({
          id: userId,
          credits_balance: 10, // Default initial credits
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.warn('Failed to create test user profile:', insertError.message);
        // Don't throw error, as tests might still work without the profile
      }
    } catch (error) {
      console.warn('Error ensuring user profile exists:', error);
    }
  }

  /**
   * Generates a UUID v4 for test users
   *
   * @returns A valid UUID string
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
