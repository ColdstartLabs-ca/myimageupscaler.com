import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';
import { z } from 'zod';

const adjustCreditsSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int(),
  reason: z.string().min(1).max(500),
});

export async function POST(req: NextRequest) {
  const { isAdmin, userId: adminId, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  try {
    const body = await req.json();
    const validation = adjustCreditsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { userId, amount, reason } = validation.data;

    // Use RPC function for atomic operation with logging
    const { data, error: rpcError } = await supabaseAdmin.rpc('admin_adjust_credits', {
      target_user_id: userId,
      adjustment_amount: amount,
      adjustment_reason: `[Admin: ${adminId}] ${reason}`,
    });

    if (rpcError) {
      console.error('Credit adjustment error:', rpcError);
      return NextResponse.json(
        { error: 'Failed to adjust credits', details: rpcError.message },
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
      { error: 'Failed to adjust credits' },
      { status: 500 }
    );
  }
}
