import type { ISubscription } from '@/shared/types/stripe.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { BaseRepository, IBaseRepository } from './base.repository';

/**
 * Subscription interface for database operations
 */
export interface ISubscriptionDB extends ISubscription {
  // Additional database fields can be added here
  [key: string]: unknown; // Add index signature
}

/**
 * Subscription creation interface
 */
export interface ICreateSubscription {
  id: string; // Stripe subscription ID
  user_id: string;
  status: string;
  price_id: string;
  current_period_start: string;
  current_period_end: string;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  scheduled_price_id?: string | null;
  scheduled_change_date?: string | null;
}

/**
 * Subscription update interface
 */
export interface IUpdateSubscription {
  status?: string;
  price_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  trial_end?: string | null;
  cancel_at_period_end?: boolean;
  canceled_at?: string | null;
  scheduled_price_id?: string | null;
  scheduled_change_date?: string | null;
}

/**
 * Subscription statistics interface
 */
export interface ISubscriptionStats {
  total: number;
  active: number;
  trialing: number;
  canceled: number;
  past_due: number;
  unpaid: number;
}

/**
 * Subscription-specific operations interface
 */
export interface ISubscriptionRepository extends IBaseRepository<
  ISubscriptionDB,
  ICreateSubscription
> {
  /**
   * Find subscription by user ID
   */
  findByUserId(userId: string): Promise<ISubscriptionDB | null>;

  /**
   * Find all subscriptions for a user (including historical)
   */
  findAllByUserId(userId: string): Promise<ISubscriptionDB[]>;

  /**
   * Find active subscription by user ID
   */
  findActiveByUserId(userId: string): Promise<ISubscriptionDB | null>;

  /**
   * Find subscription by Stripe subscription ID
   */
  findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<ISubscriptionDB | null>;

  /**
   * Find subscriptions by status
   */
  findByStatus(status: string): Promise<ISubscriptionDB[]>;

  /**
   * Find subscriptions by price ID
   */
  findByPriceId(priceId: string): Promise<ISubscriptionDB[]>;

  /**
   * Find subscriptions ending soon (within next N days)
   */
  findEndingSoon(days: number): Promise<ISubscriptionDB[]>;

  /**
   * Find subscriptions with scheduled changes
   */
  findWithScheduledChanges(): Promise<ISubscriptionDB[]>;

  /**
   * Cancel subscription at period end
   */
  cancelAtPeriodEnd(subscriptionId: string): Promise<ISubscriptionDB>;

  /**
   * Update subscription status
   */
  updateStatus(subscriptionId: string, status: string): Promise<ISubscriptionDB>;

  /**
   * Schedule a price change (downgrade)
   */
  schedulePriceChange(
    subscriptionId: string,
    newPriceId: string,
    changeDate: string
  ): Promise<ISubscriptionDB>;

  /**
   * Cancel scheduled price change
   */
  cancelScheduledChange(subscriptionId: string): Promise<ISubscriptionDB>;

  /**
   * Process subscription renewal (update period dates)
   */
  processRenewal(subscriptionId: string, newPeriodEnd: string): Promise<ISubscriptionDB>;

  /**
   * Get subscription statistics
   */
  getStats(): Promise<ISubscriptionStats>;

  /**
   * Get subscription statistics by price tier
   */
  getStatsByPriceId(): Promise<Record<string, number>>;

  /**
   * Find expired trials
   */
  findExpiredTrials(): Promise<ISubscriptionDB[]>;

  /**
   * Find subscriptions for renewal processing
   */
  findForRenewal(beforeDate: string): Promise<ISubscriptionDB[]>;

  /**
   * Batch update subscription status
   */
  batchUpdateStatus(subscriptionIds: string[], status: string): Promise<ISubscriptionDB[]>;

  /**
   * Get monthly recurring revenue (MRR)
   */
  getMRR(): Promise<number>;

  /**
   * Get annual recurring revenue (ARR)
   */
  getARR(): Promise<number>;
}

/**
 * Subscription repository implementation
 */
export class SubscriptionRepository
  extends BaseRepository<ISubscriptionDB, ICreateSubscription>
  implements ISubscriptionRepository
{
  constructor(supabase: SupabaseClient) {
    super(supabase, 'subscriptions');
  }

  async findByUserId(userId: string): Promise<ISubscriptionDB | null> {
    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return this.handleSingleResult(result);
  }

  async findAllByUserId(userId: string): Promise<ISubscriptionDB[]> {
    return this.findMany({ user_id: userId } as Partial<ISubscriptionDB>, {
      orderBy: 'created_at',
      ascending: false,
    });
  }

  async findActiveByUserId(userId: string): Promise<ISubscriptionDB | null> {
    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return this.handleSingleResult(result);
  }

  async findByStripeSubscriptionId(stripeSubscriptionId: string): Promise<ISubscriptionDB | null> {
    return this.findById(stripeSubscriptionId);
  }

  async findByStatus(status: string): Promise<ISubscriptionDB[]> {
    return this.findMany({ status } as Partial<ISubscriptionDB>);
  }

  async findByPriceId(priceId: string): Promise<ISubscriptionDB[]> {
    return this.findMany({ price_id: priceId } as Partial<ISubscriptionDB>);
  }

  async findEndingSoon(days: number = 7): Promise<ISubscriptionDB[]> {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const endDateString = endDate.toISOString();

    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .eq('cancel_at_period_end', true)
      .lte('current_period_end', endDateString)
      .in('status', ['active', 'trialing'])
      .order('current_period_end', { ascending: true });

    return this.handleMultipleResult(result);
  }

  async findWithScheduledChanges(): Promise<ISubscriptionDB[]> {
    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .not('scheduled_price_id', 'is', null)
      .not('scheduled_change_date', 'is', null)
      .in('status', ['active', 'trialing']);

    return this.handleMultipleResult(result);
  }

  async cancelAtPeriodEnd(subscriptionId: string): Promise<ISubscriptionDB> {
    return this.updateById(subscriptionId, {
      cancel_at_period_end: true,
    } as Partial<ISubscriptionDB>);
  }

  async updateStatus(subscriptionId: string, status: string): Promise<ISubscriptionDB> {
    const updateData: IUpdateSubscription = { status };

    // If canceling, set canceled_at timestamp
    if (status === 'canceled') {
      updateData.canceled_at = new Date().toISOString();
      updateData.cancel_at_period_end = false;
    }

    return this.updateById(subscriptionId, updateData as Partial<ISubscriptionDB>);
  }

  async schedulePriceChange(
    subscriptionId: string,
    newPriceId: string,
    changeDate: string
  ): Promise<ISubscriptionDB> {
    return this.updateById(subscriptionId, {
      scheduled_price_id: newPriceId,
      scheduled_change_date: changeDate,
    } as Partial<ISubscriptionDB>);
  }

  async cancelScheduledChange(subscriptionId: string): Promise<ISubscriptionDB> {
    return this.updateById(subscriptionId, {
      scheduled_price_id: null,
      scheduled_change_date: null,
    } as Partial<ISubscriptionDB>);
  }

  async processRenewal(subscriptionId: string, newPeriodEnd: string): Promise<ISubscriptionDB> {
    return this.updateById(subscriptionId, {
      current_period_end: newPeriodEnd,
      // Clear cancellation flags if it was renewed
      cancel_at_period_end: false,
    } as Partial<ISubscriptionDB>);
  }

  async getStats(): Promise<ISubscriptionStats> {
    const statuses = ['active', 'trialing', 'canceled', 'past_due', 'unpaid'];
    const stats = {
      total: 0,
      active: 0,
      trialing: 0,
      canceled: 0,
      past_due: 0,
      unpaid: 0,
    };

    // Get total count
    stats.total = await this.count();

    // Get counts by status
    for (const status of statuses) {
      const count = await this.count({ status } as Partial<ISubscriptionDB>);
      stats[status as keyof ISubscriptionStats] = count;
    }

    return stats;
  }

  async getStatsByPriceId(): Promise<Record<string, number>> {
    // This would require a more complex query with grouping
    // For now, we'll fetch all active subscriptions and count manually
    const activeSubscriptions = await this.findByStatus('active');
    const stats: Record<string, number> = {};

    for (const subscription of activeSubscriptions) {
      const priceId = subscription.price_id;
      stats[priceId] = (stats[priceId] || 0) + 1;
    }

    return stats;
  }

  async findExpiredTrials(): Promise<ISubscriptionDB[]> {
    const now = new Date().toISOString();

    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .eq('status', 'trialing')
      .lt('trial_end', now);

    return this.handleMultipleResult(result);
  }

  async findForRenewal(beforeDate: string): Promise<ISubscriptionDB[]> {
    const result = await this.supabase
      .from(this.getTable())
      .select('*')
      .in('status', ['active', 'trialing'])
      .lte('current_period_end', beforeDate);

    return this.handleMultipleResult(result);
  }

  async batchUpdateStatus(subscriptionIds: string[], status: string): Promise<ISubscriptionDB[]> {
    const updateData: IUpdateSubscription = { status };

    if (status === 'canceled') {
      updateData.canceled_at = new Date().toISOString();
      updateData.cancel_at_period_end = false;
    }

    const result = await this.supabase
      .from(this.getTable())
      .update({ ...updateData, updated_at: new Date().toISOString() })
      .in('id', subscriptionIds)
      .select('*');

    return this.handleMultipleResult(result);
  }

  async getMRR(): Promise<number> {
    // This would require joining with prices table to get amounts
    // For now, return 0 as placeholder
    // TODO: Implement proper MRR calculation with price lookup
    return 0;
  }

  async getARR(): Promise<number> {
    // ARR is simply MRR * 12
    const mrr = await this.getMRR();
    return mrr * 12;
  }
}
