import { createClient } from '@supabase/supabase-js';

export interface ITestUser {
  id: string;
  email: string;
  token: string;
}

export class TestDataManager {
  private supabase: ReturnType<typeof createClient>;
  private createdUsers: string[] = [];
  private static userPool: ITestUser[] = [];
  private static poolInitialized = false;

  constructor() {
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

  /**
   * Initialize user pool with shared test users to reduce API calls
   */
  private static async initializeUserPool(): Promise<void> {
    if (this.poolInitialized) return;

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

    // Add longer delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Use admin API to create user (bypasses email validation and confirmation)
    const { data: adminData, error: adminError } = await this.supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (adminError) {
      throw new Error(`Failed to create test user: ${adminError.message}`);
    }

    if (!adminData.user) {
      throw new Error('Failed to create test user: No user returned');
    }

    // Add another delay before sign in
    await new Promise(resolve => setTimeout(resolve, 500));

    // Retry sign in with exponential backoff if rate limited
    let signInAttempts = 0;
    const maxSignInAttempts = 3;
    let signInData, signInError;

    while (signInAttempts < maxSignInAttempts) {
      const { data: data, error: error } = await this.supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });

      signInData = data;
      signInError = error;

      if (!signInError || signInError.message !== 'Request rate limit reached') {
        break;
      }

      signInAttempts++;
      const backoffDelay = Math.min(1000 * Math.pow(2, signInAttempts), 10000);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }

    if (signInError) {
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
  }

  /**
   * Sets subscription status for a user directly in the database
   */
  async setSubscriptionStatus(
    userId: string,
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled',
    tier?: 'starter' | 'pro' | 'business',
    subscriptionId?: string
  ): Promise<void> {
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
      throw new Error(`Failed to update subscription status: ${profileError.message}`);
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
    const cleanupPromises = this.createdUsers.map(userId => this.cleanupUser(userId));
    await Promise.allSettled(cleanupPromises);
    this.createdUsers = [];
  }

  /**
   * Creates a user with specific subscription state for testing
   */
  async createTestUserWithSubscription(
    status: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled',
    tier?: 'starter' | 'pro' | 'business',
    initialCredits: number = 10
  ): Promise<ITestUser> {
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
}
