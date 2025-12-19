import type { IUserProfile, SubscriptionStatus } from '@/shared/types/stripe.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, IBaseRepository } from './base.repository';

/**
 * User profile interface for database operations
 * Extends the shared type with any additional database-only fields
 */
export interface IUserProfileDB extends IUserProfile {
  // Additional database fields can be added here
  [key: string]: unknown; // Add index signature to match IUserProfile
}

/**
 * User profile creation interface
 * Omit auto-generated fields
 */
export interface ICreateUserProfile {
  id: string;
  stripe_customer_id?: string | null;
  subscription_credits_balance?: number;
  purchased_credits_balance?: number;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  role?: string;
}

/**
 * User profile update interface
 * All fields are optional
 */
export interface IUpdateUserProfile {
  stripe_customer_id?: string | null;
  subscription_credits_balance?: number;
  purchased_credits_balance?: number;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  role?: string;
}

/**
 * Credit balance interface for updates
 */
export interface ICreditBalance {
  subscription_credits_balance: number;
  purchased_credits_balance: number;
  total_credits: number;
}

/**
 * User-specific operations interface
 */
export interface IUserRepository extends IBaseRepository<IUserProfileDB, ICreateUserProfile> {
  /**
   * Find user by their Stripe customer ID
   */
  findByStripeCustomerId(stripeCustomerId: string): Promise<IUserProfileDB | null>;

  /**
   * Create user profile with defaults
   */
  createWithDefaults(
    userId: string,
    options?: Partial<ICreateUserProfile>
  ): Promise<IUserProfileDB>;

  /**
   * Get or create user profile (convenience method)
   */
  getOrCreate(userId: string, options?: Partial<ICreateUserProfile>): Promise<IUserProfileDB>;

  /**
   * Update user's credit balances
   */
  updateCreditBalances(userId: string, balances: Partial<ICreditBalance>): Promise<IUserProfileDB>;

  /**
   * Add credits to user's balance
   */
  addCredits(
    userId: string,
    amount: number,
    type: 'subscription' | 'purchased'
  ): Promise<IUserProfileDB>;

  /**
   * Consume/deduct credits from user's balance
   */
  consumeCredits(userId: string, amount: number): Promise<IUserProfileDB>;

  /**
   * Get user's total credit balance
   */
  getTotalCredits(userId: string): Promise<number>;

  /**
   * Update user's subscription information
   */
  updateSubscriptionInfo(
    userId: string,
    info: {
      status?: string | null;
      tier?: string | null;
      stripeCustomerId?: string | null;
    }
  ): Promise<IUserProfileDB>;

  /**
   * Find users by subscription status
   */
  findBySubscriptionStatus(status: string): Promise<IUserProfileDB[]>;

  /**
   * Find users by role
   */
  findByRole(role: string): Promise<IUserProfileDB[]>;

  /**
   * Search users by email (requires auth.users lookup)
   */
  searchByEmail(email: string): Promise<IUserProfileDB[]>;

  /**
   * Get user profile with auth user email
   */
  getProfileWithEmail(userId: string): Promise<(IUserProfileDB & { email: string }) | null>;

  /**
   * Batch update multiple users
   */
  batchUpdate(userIds: string[], updates: IUpdateUserProfile): Promise<IUserProfileDB[]>;

  /**
   * Get credit usage statistics
   */
  getCreditStats(userId: string): Promise<{
    total_earned: number;
    total_consumed: number;
    current_balance: number;
  }>;
}

/**
 * User repository implementation
 */
export class UserRepository
  extends BaseRepository<IUserProfileDB, ICreateUserProfile>
  implements IUserRepository
{
  constructor(supabase: SupabaseClient) {
    super(supabase, 'profiles');
  }

  async findByStripeCustomerId(stripeCustomerId: string): Promise<IUserProfileDB | null> {
    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .eq('stripe_customer_id', stripeCustomerId)
      .single();

    return this.handleSingleResult(result);
  }

  async createWithDefaults(
    userId: string,
    options: Partial<ICreateUserProfile> = {}
  ): Promise<IUserProfileDB> {
    const defaultData: ICreateUserProfile = {
      id: userId,
      subscription_credits_balance: 10, // Default subscription credits
      purchased_credits_balance: 0, // No purchased credits initially
      subscription_status: null,
      subscription_tier: null,
      role: 'user',
      stripe_customer_id: null,
      ...options,
    };

    return this.create(defaultData);
  }

  async getOrCreate(
    userId: string,
    options: Partial<ICreateUserProfile> = {}
  ): Promise<IUserProfileDB> {
    // Try to find existing profile
    const existing = await this.findById(userId);
    if (existing) {
      return existing;
    }

    // Create new profile if not found
    return this.createWithDefaults(userId, options);
  }

  async updateCreditBalances(
    userId: string,
    balances: Partial<ICreditBalance>
  ): Promise<IUserProfileDB> {
    const updateData: Partial<IUserProfileDB> = {};

    if (balances.subscription_credits_balance !== undefined) {
      updateData.subscription_credits_balance = balances.subscription_credits_balance;
    }
    if (balances.purchased_credits_balance !== undefined) {
      updateData.purchased_credits_balance = balances.purchased_credits_balance;
    }

    return this.updateById(userId, updateData);
  }

  async addCredits(
    userId: string,
    amount: number,
    type: 'subscription' | 'purchased'
  ): Promise<IUserProfileDB> {
    const currentProfile = await this.findById(userId);
    if (!currentProfile) {
      throw this.handleError({ message: 'User profile not found' }, 'addCredits');
    }

    const updates: Partial<ICreditBalance> = {
      subscription_credits_balance: currentProfile.subscription_credits_balance,
      purchased_credits_balance: currentProfile.purchased_credits_balance,
    };

    if (type === 'subscription') {
      updates.subscription_credits_balance = (updates.subscription_credits_balance ?? 0) + amount;
    } else {
      updates.purchased_credits_balance = (updates.purchased_credits_balance ?? 0) + amount;
    }

    return this.updateCreditBalances(userId, updates);
  }

  async consumeCredits(userId: string, amount: number): Promise<IUserProfileDB> {
    const currentProfile = await this.findById(userId);
    if (!currentProfile) {
      throw this.handleError({ message: 'User profile not found' }, 'consumeCredits');
    }

    const totalCredits =
      (currentProfile.subscription_credits_balance ?? 0) +
      (currentProfile.purchased_credits_balance ?? 0);

    if (totalCredits < amount) {
      throw this.handleError({ message: 'Insufficient credits' }, 'consumeCredits');
    }

    // Consume from subscription credits first (FIFO), then purchased
    let newSubscriptionBalance = currentProfile.subscription_credits_balance ?? 0;
    let newPurchasedBalance = currentProfile.purchased_credits_balance ?? 0;
    let remainingToConsume = amount;

    // Consume from subscription first
    const consumedFromSubscription = Math.min(newSubscriptionBalance, remainingToConsume);
    newSubscriptionBalance -= consumedFromSubscription;
    remainingToConsume -= consumedFromSubscription;

    // Then consume from purchased if needed
    if (remainingToConsume > 0) {
      const consumedFromPurchased = Math.min(newPurchasedBalance, remainingToConsume);
      newPurchasedBalance -= consumedFromPurchased;
      remainingToConsume -= consumedFromPurchased;
    }

    if (remainingToConsume > 0) {
      throw this.handleError(
        { message: 'Insufficient credits after calculation' },
        'consumeCredits'
      );
    }

    return this.updateCreditBalances(userId, {
      subscription_credits_balance: newSubscriptionBalance,
      purchased_credits_balance: newPurchasedBalance,
    });
  }

  async getTotalCredits(userId: string): Promise<number> {
    const profile = await this.findById(userId);
    if (!profile) {
      return 0;
    }

    return (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);
  }

  async updateSubscriptionInfo(
    userId: string,
    info: {
      status?: string | null;
      tier?: string | null;
      stripeCustomerId?: string | null;
    }
  ): Promise<IUserProfileDB> {
    const updateData: Partial<IUserProfileDB> = {};

    if (info.status !== undefined) {
      updateData.subscription_status = info.status as SubscriptionStatus | null;
    }
    if (info.tier !== undefined) {
      updateData.subscription_tier = info.tier;
    }
    if (info.stripeCustomerId !== undefined) {
      updateData.stripe_customer_id = info.stripeCustomerId;
    }

    return this.updateById(userId, updateData);
  }

  async findBySubscriptionStatus(status: string): Promise<IUserProfileDB[]> {
    return this.findMany({ subscription_status: status } as Partial<IUserProfileDB>);
  }

  async findByRole(role: string): Promise<IUserProfileDB[]> {
    return this.findMany({ role } as Partial<IUserProfileDB>);
  }

  async searchByEmail(email: string): Promise<IUserProfileDB[]> {
    // This requires joining with auth.users
    // We'll use the RPC function if available, or fetch auth users first
    const { data: authUsers, error: authError } = await this.supabase.auth.admin.listUsers();
    if (authError) {
      this.handleError(authError, 'searchByEmail');
    }

    // Find auth users matching the email
    const matchingAuthUsers = authUsers.users.filter(u =>
      u.email?.toLowerCase().includes(email.toLowerCase())
    );

    // Get profiles for matching auth users
    const userIds = matchingAuthUsers.map(u => u.id);
    if (userIds.length === 0) {
      return [];
    }

    const result = await this.supabase.from(this.getTable()).select('*').in('id', userIds);

    return this.handleMultipleResult(result);
  }

  async getProfileWithEmail(userId: string): Promise<(IUserProfileDB & { email: string }) | null> {
    // Get profile
    const profile = await this.findById(userId);
    if (!profile) {
      return null;
    }

    // Get email from auth.users
    const { data: authUser, error: authError } = await this.supabase.auth.admin.getUserById(userId);
    if (authError) {
      this.handleError(authError, 'getProfileWithEmail');
    }

    return {
      ...profile,
      email: authUser.user?.email || '',
    };
  }

  async batchUpdate(userIds: string[], updates: IUpdateUserProfile): Promise<IUserProfileDB[]> {
    const result = await this.supabase
      .from(this.getTable())
      .update({ ...updates, updated_at: new Date().toISOString() })
      .in('id', userIds)
      .select('*');

    return this.handleMultipleResult(result);
  }

  async getCreditStats(userId: string): Promise<{
    total_earned: number;
    total_consumed: number;
    current_balance: number;
  }> {
    // This would require tracking credit transactions
    // For now, return current balance
    const profile = await this.findById(userId);
    if (!profile) {
      return {
        total_earned: 0,
        total_consumed: 0,
        current_balance: 0,
      };
    }

    const currentBalance =
      (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);

    // TODO: Implement proper tracking of earned/consumed credits
    // This would involve querying credit_transactions table
    return {
      total_earned: currentBalance, // Placeholder
      total_consumed: 0, // Placeholder
      current_balance: currentBalance,
    };
  }
}
