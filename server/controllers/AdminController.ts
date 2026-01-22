import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { BaseController } from './BaseController';
import { requireAdmin, type IAdminCheckResult } from '../middleware/requireAdmin';
import { supabaseAdmin } from '../supabase/supabaseAdmin';
import { stripe } from '../stripe';
import { getPlanForPriceId } from '@shared/config/stripe';
import dayjs from 'dayjs';
import type { z } from 'zod';

/**
 * Schema for credit adjustment request
 */
interface ISetCreditsRequest {
  userId: string;
  newBalance: number;
}

/**
 * Schema for update subscription request
 */
interface IUpdateSubscriptionRequest {
  userId: string;
  action: 'cancel' | 'change';
  targetPriceId?: string;
}

/**
 * Schema for update profile request
 */
interface IUpdateProfileRequest {
  role?: 'user' | 'admin';
  subscription_tier?: 'hobby' | 'pro' | 'business';
  subscription_status?: 'active' | 'canceled' | 'trialing' | 'past_due' | 'incomplete';
}

/**
 * Pagination and search parameters for user list
 */
interface IUserListQuery {
  page?: string;
  limit?: string;
  search?: string;
}

/**
 * Admin Controller
 *
 * Handles admin-only API endpoints:
 * - GET /api/admin/stats - Get admin statistics
 * - POST /api/admin/credits/adjust - Adjust user credits
 * - GET /api/admin/users - List users with pagination
 * - GET /api/admin/users/[userId] - Get user details
 * - PATCH /api/admin/users/[userId] - Update user profile
 * - DELETE /api/admin/users/[userId] - Delete user
 * - GET /api/admin/subscription - Get subscription details
 * - POST /api/admin/subscription - Update subscription
 */
export class AdminController extends BaseController {
  /**
   * Verify admin access
   * Returns admin check result with error response if not authorized
   */
  private async requireAdmin(req: NextRequest): Promise<IAdminCheckResult> {
    return requireAdmin(req);
  }

  /**
   * Handle incoming request
   */
  protected async handle(req: NextRequest): Promise<NextResponse> {
    const path = req.nextUrl.pathname;

    // Route to appropriate method based on path and method
    if (path.endsWith('/stats') && this.isGet(req)) {
      return this.getStats(req);
    }
    if (path.endsWith('/credits/adjust') && this.isPost(req)) {
      return this.adjustCredits(req);
    }
    if (path.endsWith('/users') && this.isGet(req)) {
      return this.listUsers(req);
    }
    if (path.includes('/users/') && this.isGet(req)) {
      return this.getUserById(req);
    }
    if (path.includes('/users/') && this.isPatch(req)) {
      return this.updateUser(req);
    }
    if (path.includes('/users/') && this.isDelete(req)) {
      return this.deleteUser(req);
    }
    if (path.endsWith('/subscription') && this.isGet(req)) {
      return this.getSubscription(req);
    }
    if (path.endsWith('/subscription') && this.isPost(req)) {
      return this.updateSubscription(req);
    }

    return this.error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  /**
   * GET /api/admin/stats
   * Get admin statistics (total users, active subscriptions, credits issued/used)
   */
  private async getStats(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    const [usersResult, subscriptionsResult, creditsResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabaseAdmin.from('credit_transactions').select('amount, type'),
    ]);

    const totalCreditsIssued = (creditsResult.data || [])
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalCreditsUsed = Math.abs(
      (creditsResult.data || [])
        .filter(t => t.type === 'usage')
        .reduce((sum, t) => sum + t.amount, 0)
    );

    return this.json({
      totalUsers: usersResult.count || 0,
      activeSubscriptions: subscriptionsResult.count || 0,
      totalCreditsIssued,
      totalCreditsUsed,
    });
  }

  /**
   * POST /api/admin/credits/adjust
   * Adjust user credits to a new balance
   */
  private async adjustCredits(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, userId: adminId, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await this.getBody<ISetCreditsRequest>(req);

    // Basic validation
    if (!body.userId || typeof body.userId !== 'string') {
      return this.error('VALIDATION_ERROR', 'userId is required', 400);
    }
    if (typeof body.newBalance !== 'number' || body.newBalance < 0) {
      return this.error('VALIDATION_ERROR', 'newBalance must be a non-negative number', 400);
    }

    const { userId, newBalance } = body;

    // Get current balance to calculate adjustment
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('subscription_credits_balance, purchased_credits_balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return this.error('NOT_FOUND', 'User not found', 404);
    }

    const currentTotal =
      (profile.subscription_credits_balance ?? 0) + (profile.purchased_credits_balance ?? 0);
    const adjustmentAmount = newBalance - currentTotal;

    // Use RPC function for atomic operation with logging
    const { data, error: rpcError } = await supabaseAdmin.rpc('admin_adjust_credits', {
      target_user_id: userId,
      adjustment_amount: adjustmentAmount,
      adjustment_reason: `[Admin: ${adminId}] Set balance to ${newBalance}`,
    });

    if (rpcError) {
      console.error('Credit adjustment error:', rpcError);
      return this.error('ADJUSTMENT_FAILED', 'Failed to set credits', 500, {
        details: rpcError.message,
      });
    }

    return this.json({ newBalance: data });
  }

  /**
   * GET /api/admin/users
   * List users with pagination and optional search
   */
  private async listUsers(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    const MAX_LIMIT = 100;
    const DEFAULT_LIMIT = 20;

    const pageParam = this.getQueryParam(req, 'page') || '1';
    const limitParam = this.getQueryParam(req, 'limit') || String(DEFAULT_LIMIT);
    const search = this.getQueryParam(req, 'search') || '';

    const page = Math.max(1, parseInt(pageParam, 10));
    const requestedLimit = parseInt(limitParam, 10);
    const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
    const offset = (page - 1) * limit;

    // Build query
    const {
      data: profiles,
      count,
      error: profilesError,
    } = await supabaseAdmin
      .from('profiles')
      .select('*, email:id', { count: 'exact' })
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return this.error('FETCH_ERROR', 'Failed to fetch users', 500, {
        details: profilesError.message,
      });
    }

    // Fetch auth users to get emails
    const profileIds = (profiles || []).map(p => p.id);
    const emailMap = new Map<string, string>();

    if (profileIds.length > 0) {
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000,
        page: 1,
      });

      if (!authError && authUsers?.users) {
        for (const user of authUsers.users) {
          if (profileIds.includes(user.id)) {
            emailMap.set(user.id, user.email || 'unknown@example.com');
          }
        }
      }
    }

    // Combine profile data with emails
    const usersWithEmails = (profiles || []).map(profile => ({
      ...profile,
      email: emailMap.get(profile.id) || 'unknown@example.com',
    }));

    // Apply search filter if provided
    let filteredUsers = usersWithEmails;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = usersWithEmails.filter(u => u.email.toLowerCase().includes(searchLower));
    }

    return this.json({
      users: filteredUsers,
      total: count || 0,
      page,
      limit,
      maxLimit: MAX_LIMIT,
    });
  }

  /**
   * GET /api/admin/users/[userId]
   * Get detailed user information including subscription and recent transactions
   */
  private async getUserById(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    // Extract userId from path
    const pathParts = req.nextUrl.pathname.split('/');
    const userId = pathParts[pathParts.length - 1];

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return this.error('VALIDATION_ERROR', 'Invalid user ID format', 400);
    }

    const [profileResult, subscriptionResult, transactionsResult, authUser] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
      supabaseAdmin.from('subscriptions').select('*').eq('user_id', userId).single(),
      supabaseAdmin
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin.auth.admin.getUserById(userId),
    ]);

    if (profileResult.error) {
      return this.error('NOT_FOUND', 'User not found', 404);
    }

    const profileWithEmail = {
      ...profileResult.data,
      email: authUser.data.user?.email || 'unknown@example.com',
    };

    return this.json({
      profile: profileWithEmail,
      subscription: subscriptionResult.data,
      recentTransactions: transactionsResult.data || [],
    });
  }

  /**
   * PATCH /api/admin/users/[userId]
   * Update user profile (role, subscription_tier, subscription_status)
   */
  private async updateUser(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    // Extract userId from path
    const pathParts = req.nextUrl.pathname.split('/');
    const userId = pathParts[pathParts.length - 1];

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return this.error('VALIDATION_ERROR', 'Invalid user ID format', 400);
    }

    const body = await this.getBody<IUpdateProfileRequest>(req);

    // Validate role
    if (body.role !== undefined && !['user', 'admin'].includes(body.role)) {
      return this.error('VALIDATION_ERROR', 'Invalid role value', 400);
    }

    // Validate subscription_tier
    if (body.subscription_tier !== undefined && !['hobby', 'pro', 'business'].includes(body.subscription_tier)) {
      return this.error('VALIDATION_ERROR', 'Invalid subscription_tier value', 400);
    }

    // Validate subscription_status
    if (body.subscription_status !== undefined && !['active', 'canceled', 'trialing', 'past_due', 'incomplete'].includes(body.subscription_status)) {
      return this.error('VALIDATION_ERROR', 'Invalid subscription_status value', 400);
    }

    const updates: Record<string, unknown> = { ...body };

    if (Object.keys(updates).length === 0) {
      return this.error('VALIDATION_ERROR', 'No valid fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    const { data, error: dbError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (dbError) {
      console.error('Error updating user:', dbError);
      return this.error('UPDATE_FAILED', 'Failed to update user', 500, {
        details: dbError.message,
      });
    }

    return this.json(data);
  }

  /**
   * DELETE /api/admin/users/[userId]
   * Delete a user and all their data
   */
  private async deleteUser(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    // Extract userId from path
    const pathParts = req.nextUrl.pathname.split('/');
    const userId = pathParts[pathParts.length - 1];

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return this.error('VALIDATION_ERROR', 'Invalid user ID format', 400);
    }

    // Delete in order: credit_transactions, subscriptions, profiles, then auth user
    const [transactionsResult, subscriptionsResult] = await Promise.allSettled([
      supabaseAdmin.from('credit_transactions').delete().eq('user_id', userId),
      supabaseAdmin.from('subscriptions').delete().eq('user_id', userId),
    ]);

    // Log any errors but continue
    if (transactionsResult.status === 'rejected') {
      console.warn('Error deleting transactions:', transactionsResult.reason);
    }
    if (subscriptionsResult.status === 'rejected') {
      console.warn('Error deleting subscriptions:', subscriptionsResult.reason);
    }

    // Delete profile
    const { error: profileError } = await supabaseAdmin.from('profiles').delete().eq('id', userId);

    if (profileError) {
      console.error('Error deleting profile:', profileError);
      return this.error('DELETE_FAILED', 'Failed to delete user profile', 500, {
        details: profileError.message,
      });
    }

    // Finally delete the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      return this.error('DELETE_FAILED', 'Failed to delete auth user', 500, {
        details: authError.message,
      });
    }

    return this.json({ message: 'User deleted successfully' });
  }

  /**
   * GET /api/admin/subscription
   * Get subscription details from Stripe and database
   */
  private async getSubscription(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    const userId = this.getRequiredQueryParam(req, 'userId');

    // Get subscription from DB
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!subscription) {
      return this.json({
        subscription: null,
        stripeSubscription: null,
      });
    }

    // Fetch from Stripe for live data
    let stripeSubscription = null;
    try {
      stripeSubscription = await stripe.subscriptions.retrieve(subscription.id);
    } catch {
      // Subscription may not exist in Stripe anymore
    }

    const stripeSubData = stripeSubscription as unknown as { current_period_end?: number } | null;

    return this.json({
      subscription,
      stripeSubscription: stripeSubscription
        ? {
            id: stripeSubscription.id,
            status: stripeSubscription.status,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            current_period_end: stripeSubData?.current_period_end || null,
            canceled_at: stripeSubscription.canceled_at,
          }
        : null,
    });
  }

  /**
   * POST /api/admin/subscription
   * Update or cancel a user's subscription
   */
  private async updateSubscription(req: NextRequest): Promise<NextResponse> {
    const { isAdmin, error } = await this.requireAdmin(req);
    if (!isAdmin) return error || this.error('UNAUTHORIZED', 'Unauthorized', 401);

    const body = await this.getBody<IUpdateSubscriptionRequest>(req);

    // Validate action
    if (!body.action || (body.action !== 'cancel' && body.action !== 'change')) {
      return this.error('VALIDATION_ERROR', 'action must be "cancel" or "change"', 400);
    }

    // Validate userId
    if (!body.userId || typeof body.userId !== 'string') {
      return this.error('VALIDATION_ERROR', 'userId is required', 400);
    }

    // Validate targetPriceId for change action
    if (body.action === 'change' && !body.targetPriceId) {
      return this.error('VALIDATION_ERROR', 'targetPriceId is required for plan changes', 400);
    }

    const { userId, action, targetPriceId } = body;

    // Get user's subscription from DB
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('id, status, price_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (action === 'cancel') {
      if (!subscription) {
        // No subscription - just clear profile
        await supabaseAdmin
          .from('profiles')
          .update({
            subscription_status: null,
            subscription_tier: null,
            updated_at: dayjs().toISOString(),
          })
          .eq('id', userId);

        return this.json({
          action: 'canceled',
          message: 'Profile updated to free tier',
        });
      }

      // Cancel in Stripe
      try {
        await stripe.subscriptions.cancel(subscription.id);
      } catch (stripeErr) {
        console.error('Stripe cancel error (may already be canceled):', stripeErr);
      }

      // Update our database
      await supabaseAdmin
        .from('subscriptions')
        .update({
          status: 'canceled',
          canceled_at: dayjs().toISOString(),
          updated_at: dayjs().toISOString(),
        })
        .eq('id', subscription.id);

      // Update profile
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: null,
          subscription_tier: null,
          updated_at: dayjs().toISOString(),
        })
        .eq('id', userId);

      return this.json({
        action: 'canceled',
        subscriptionId: subscription.id,
      });
    }

    if (action === 'change') {
      if (!targetPriceId) {
        return this.error('VALIDATION_ERROR', 'targetPriceId is required for plan changes', 400);
      }

      const targetPlan = getPlanForPriceId(targetPriceId);
      if (!targetPlan) {
        return this.error('VALIDATION_ERROR', 'Invalid price ID', 400);
      }

      // Check if user has an active subscription in Stripe we can modify
      const activeSubscription =
        subscription && subscription.status !== 'canceled' && subscription.status !== 'incomplete';

      if (activeSubscription) {
        // Update existing subscription in Stripe
        try {
          const stripeSub = await stripe.subscriptions.retrieve(subscription.id);
          const updatedSub = await stripe.subscriptions.update(subscription.id, {
            items: [{ id: stripeSub.items.data[0]?.id, price: targetPriceId }],
            proration_behavior: 'create_prorations',
          });

          const updatedSubData = updatedSub as unknown as { current_period_end?: number };
          const periodEnd = updatedSubData.current_period_end
            ? dayjs.unix(updatedSubData.current_period_end).toISOString()
            : null;

          // Update database
          await supabaseAdmin
            .from('subscriptions')
            .update({
              price_id: targetPriceId,
              status: updatedSub.status,
              updated_at: dayjs().toISOString(),
            })
            .eq('id', subscription.id);

          // IMPORTANT: Use plan.key (e.g., 'pro') not plan.name (e.g., 'Professional')
          await supabaseAdmin
            .from('profiles')
            .update({
              subscription_status: updatedSub.status,
              subscription_tier: targetPlan.key,
              updated_at: dayjs().toISOString(),
            })
            .eq('id', userId);

          return this.json({
            action: 'changed',
            subscriptionId: subscription.id,
            status: updatedSub.status,
            plan: targetPlan.name,
            periodEnd,
          });
        } catch (stripeErr) {
          console.error('Stripe update failed, falling back to profile-only update:', stripeErr);
          // Fall through to profile-only update
        }
      }

      // No active Stripe subscription or Stripe update failed
      // Just update the profile directly (admin override)
      // IMPORTANT: Use plan.key (e.g., 'pro') not plan.name (e.g., 'Professional')
      await supabaseAdmin
        .from('profiles')
        .update({
          subscription_status: 'active',
          subscription_tier: targetPlan.key,
          updated_at: dayjs().toISOString(),
        })
        .eq('id', userId);

      return this.json({
        action: 'profile_updated',
        plan: targetPlan.name,
        note: 'Profile updated directly. No Stripe subscription was modified.',
      });
    }

    return this.error('VALIDATION_ERROR', 'Invalid action', 400);
  }
}
