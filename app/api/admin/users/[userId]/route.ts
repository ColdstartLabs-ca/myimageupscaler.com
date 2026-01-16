import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

// SECURITY FIX: Validate userId is a valid UUID
const userIdSchema = z.string().uuid('Invalid user ID format');

// SECURITY FIX: Validate PATCH body with proper types
const updateProfileSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  subscription_tier: z.enum(['hobby', 'pro', 'business']).optional(),
  subscription_status: z
    .enum(['active', 'canceled', 'trialing', 'past_due', 'incomplete'])
    .optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { userId: rawUserId } = await params;

  // SECURITY FIX: Validate userId is a valid UUID
  const userIdResult = userIdSchema.safeParse(rawUserId);
  if (!userIdResult.success) {
    return NextResponse.json(
      { error: 'Invalid user ID format', details: userIdResult.error.errors },
      { status: 400 }
    );
  }
  const userId = userIdResult.data;

  try {
    // Fetch user profile with subscription and recent transactions
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profileWithEmail = {
      ...profileResult.data,
      email: authUser.data.user?.email || 'unknown@example.com',
    };

    return NextResponse.json({
      success: true,
      data: {
        profile: profileWithEmail,
        subscription: subscriptionResult.data,
        recentTransactions: transactionsResult.data || [],
      },
    });
  } catch (err) {
    console.error('Admin user detail error:', err);
    return NextResponse.json({ error: 'Failed to fetch user details' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { userId: rawUserId } = await params;

  // SECURITY FIX: Validate userId is a valid UUID
  const userIdResult = userIdSchema.safeParse(rawUserId);
  if (!userIdResult.success) {
    return NextResponse.json(
      { error: 'Invalid user ID format', details: userIdResult.error.errors },
      { status: 400 }
    );
  }
  const userId = userIdResult.data;

  try {
    const body = await req.json();

    // SECURITY FIX: Validate body with Zod schema (validates types, not just field names)
    const bodyResult = updateProfileSchema.safeParse(body);
    if (!bodyResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: bodyResult.error.errors },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { ...bodyResult.data };

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
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
      return NextResponse.json(
        { error: 'Failed to update user', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error('Admin user update error:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { userId: rawUserId } = await params;

  // SECURITY FIX: Validate userId is a valid UUID
  const userIdResult = userIdSchema.safeParse(rawUserId);
  if (!userIdResult.success) {
    return NextResponse.json(
      { error: 'Invalid user ID format', details: userIdResult.error.errors },
      { status: 400 }
    );
  }
  const userId = userIdResult.data;

  try {
    // Delete in order: credit_transactions, subscriptions, profiles, then auth user
    // Using Promise.allSettled to continue even if some tables have no data

    // First delete related data
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
      return NextResponse.json(
        { error: 'Failed to delete user profile', details: profileError.message },
        { status: 500 }
      );
    }

    // Finally delete the auth user
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authError) {
      console.error('Error deleting auth user:', authError);
      return NextResponse.json(
        { error: 'Failed to delete auth user', details: authError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin user delete error:', err);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
