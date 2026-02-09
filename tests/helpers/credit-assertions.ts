import type { SupabaseClient } from '@supabase/supabase-js';
import { expect } from '@playwright/test';

/**
 * Credit assertion helpers for billing workflow tests
 *
 * Provides utilities for verifying credit state, subscription status,
 * and transaction records in the database.
 */

export interface ICreditAssertionOptions {
  subscriptionCredits?: number;
  purchasedCredits?: number;
  totalCredits?: number;
  subscriptionStatus?: 'free' | 'active' | 'trialing' | 'past_due' | 'canceled';
  subscriptionTier?: 'starter' | 'pro' | 'business' | 'hobby';
  stripeSubscriptionId?: string;
}

/**
 * Asserts that a user's credit profile matches expected values
 */
export async function assertCreditProfile(
  supabase: SupabaseClient,
  userId: string,
  options: ICreditAssertionOptions
): Promise<void> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch profile: ${error.message}`);
  }

  if (!profile) {
    throw new Error(`Profile not found for user ${userId}`);
  }

  if (options.subscriptionCredits !== undefined) {
    expect(profile.subscription_credits_balance).toBe(options.subscriptionCredits);
  }

  if (options.purchasedCredits !== undefined) {
    expect(profile.purchased_credits_balance).toBe(options.purchasedCredits);
  }

  if (options.totalCredits !== undefined) {
    const total = profile.subscription_credits_balance + profile.purchased_credits_balance;
    expect(total).toBe(options.totalCredits);
  }

  if (options.subscriptionStatus !== undefined) {
    expect(profile.subscription_status).toBe(
      options.subscriptionStatus === 'free' ? null : options.subscriptionStatus
    );
  }

  if (options.subscriptionTier !== undefined) {
    expect(profile.subscription_tier).toBe(options.subscriptionTier);
  }

  if (options.stripeSubscriptionId !== undefined) {
    expect(profile.stripe_subscription_id).toBe(options.stripeSubscriptionId);
  }
}

/**
 * Asserts that a credit transaction was created with specific properties
 */
export async function assertCreditTransaction(
  supabase: SupabaseClient,
  userId: string,
  options: {
    amount?: number;
    type?:
      | 'subscription'
      | 'purchase'
      | 'bonus'
      | 'subscription_renewal'
      | 'expiration'
      | 'clawback';
    descriptionContains?: string;
    refId?: string;
  }
): Promise<void> {
  const { data: transactions, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  if (!transactions || transactions.length === 0) {
    throw new Error(`No credit transactions found for user ${userId}`);
  }

  const transaction = transactions[0];

  if (options.amount !== undefined) {
    expect(transaction.amount).toBe(options.amount);
  }

  if (options.type !== undefined) {
    expect(transaction.type).toBe(options.type);
  }

  if (options.descriptionContains !== undefined) {
    expect(transaction.description).toContain(options.descriptionContains);
  }

  if (options.refId !== undefined) {
    expect(transaction.ref_id).toBe(options.refId);
  }
}

/**
 * Asserts that a subscription record exists with expected properties
 */
export async function assertSubscriptionRecord(
  supabase: SupabaseClient,
  userId: string,
  options: {
    status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
    priceId?: string;
  }
): Promise<void> {
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch subscriptions: ${error.message}`);
  }

  if (!subscriptions || subscriptions.length === 0) {
    throw new Error(`No subscription found for user ${userId}`);
  }

  const subscription = subscriptions[0];

  if (options.status !== undefined) {
    expect(subscription.status).toBe(options.status);
  }

  if (options.priceId !== undefined) {
    expect(subscription.price_id).toBe(options.priceId);
  }
}

/**
 * Gets current credit balance for a user
 */
export async function getCreditBalance(
  supabase: SupabaseClient,
  userId: string
): Promise<{ subscription: number; purchased: number; total: number }> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('subscription_credits_balance, purchased_credits_balance')
    .eq('id', userId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch credit balance: ${error.message}`);
  }

  return {
    subscription: profile.subscription_credits_balance || 0,
    purchased: profile.purchased_credits_balance || 0,
    total: (profile.subscription_credits_balance || 0) + (profile.purchased_credits_balance || 0),
  };
}

/**
 * Gets all credit transactions for a user
 */
export async function getCreditTransactions(
  supabase: SupabaseClient,
  userId: string,
  limit: number = 10
): Promise<any[]> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch transactions: ${error.message}`);
  }

  return data || [];
}

/**
 * Credit amount constants from subscription config
 */
export const CREDITS = {
  STARTER_MONTHLY: 100,
  HOBBY_MONTHLY: 200,
  PRO_MONTHLY: 1000,
  BUSINESS_MONTHLY: 5000,
} as const;

/**
 * Price ID constants from subscription config
 */
export const PRICE_IDS = {
  STARTER: 'price_1Sz0fNL1vUl00LlZX1XClz95',
  HOBBY: 'price_1Sz0fNL1vUl00LlZT6MMTxAg',
  PRO: 'price_1Sz0fOL1vUl00LlZ7bbM2cDs',
  BUSINESS: 'price_1Sz0fOL1vUl00LlZP3y5zdFx',
} as const;
