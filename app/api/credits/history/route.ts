import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

interface ICreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Get the authenticated user from the Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '');

    // Verify the user with Supabase
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get pagination parameters from query string
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Fetch credit transactions for the user
    const { data: transactions, error: fetchError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error('Error fetching credit transactions:', fetchError);
      return NextResponse.json({ error: 'Failed to fetch credit history' }, { status: 500 });
    }

    // Get total count for pagination
    const { count, error: countError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (countError) {
      console.error('Error counting transactions:', countError);
    }

    return NextResponse.json({
      success: true,
      data: {
        transactions: transactions as ICreditTransaction[],
        pagination: {
          limit,
          offset,
          total: count || 0,
        },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Credit history error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
