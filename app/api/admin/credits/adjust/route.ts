import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';
import { z } from 'zod';

const setCreditsSchema = z.object({
  userId: z.string().uuid(),
  newBalance: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const { isAdmin, userId: adminId, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  try {
    const body = await req.json();
    const validation = setCreditsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { userId, newBalance } = validation.data;

    // Get current balance to calculate adjustment
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('credits_balance')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const adjustmentAmount = newBalance - profile.credits_balance;

    // Use RPC function for atomic operation with logging
    const { data, error: rpcError } = await supabaseAdmin.rpc('admin_adjust_credits', {
      target_user_id: userId,
      adjustment_amount: adjustmentAmount,
      adjustment_reason: `[Admin: ${adminId}] Set balance to ${newBalance}`,
    });

    if (rpcError) {
      console.error('Credit adjustment error:', rpcError);
      return NextResponse.json(
        { error: 'Failed to set credits', details: rpcError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { newBalance: data },
    });
  } catch (err) {
    console.error('Admin credit adjustment error:', err);
    return NextResponse.json(
      { error: 'Failed to set credits' },
      { status: 500 }
    );
  }
}
