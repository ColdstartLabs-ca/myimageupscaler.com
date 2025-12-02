import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

export async function GET(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  try {
    const [usersResult, subscriptionsResult, creditsResult] = await Promise.all([
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabaseAdmin.from('credit_transactions').select('amount, type'),
    ]);

    const totalCreditsIssued = (creditsResult.data || [])
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const totalCreditsUsed = Math.abs(
      (creditsResult.data || [])
        .filter((t) => t.type === 'usage')
        .reduce((sum, t) => sum + t.amount, 0)
    );

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: usersResult.count || 0,
        activeSubscriptions: subscriptionsResult.count || 0,
        totalCreditsIssued,
        totalCreditsUsed,
      },
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch admin stats' },
      { status: 500 }
    );
  }
}
