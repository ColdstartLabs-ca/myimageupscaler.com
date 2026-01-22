import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { BaseController } from './BaseController';
import { validateRequest } from '../middleware/validation';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { NotFoundError } from '../errors';

/**
 * Credit transaction type
 */
interface ICreditTransaction {
  id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

/**
 * Pagination parameters for credit history
 */
interface ICreditHistoryQuery {
  limit?: string;
  offset?: string;
}

/**
 * Credits Controller
 *
 * Handles credit-related API endpoints:
 * - GET /api/credits/history - Get user's credit transaction history
 */
export class CreditsController extends BaseController {
  /**
   * Authenticate user from Authorization header
   */
  private async authenticateUser(req: NextRequest): Promise<{ userId: string } | NextResponse> {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return this.error('UNAUTHORIZED', 'Unauthorized', 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return this.error('UNAUTHORIZED', 'Unauthorized', 401);
    }

    return { userId: user.id };
  }

  /**
   * Handle incoming request
   */
  protected async handle(req: NextRequest): Promise<NextResponse> {
    if (this.isGet(req)) {
      return this.getHistory(req);
    }

    return this.error('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  /**
   * GET /api/credits/history
   * Get user's credit transaction history with pagination
   */
  private async getHistory(req: NextRequest): Promise<NextResponse> {
    const authResult = await this.authenticateUser(req);
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    // Get pagination parameters with bounds checking
    const MAX_LIMIT = 100;
    const limitParam = this.getQueryParam(req, 'limit') || '50';
    const offsetParam = this.getQueryParam(req, 'offset') || '0';

    const limit = Math.min(Math.max(1, parseInt(limitParam, 10)), MAX_LIMIT);
    const offset = Math.max(0, parseInt(offsetParam, 10));

    // Fetch credit transactions
    const { data: transactions, error: fetchError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error('Error fetching credit transactions:', fetchError);
      return this.error('FETCH_ERROR', 'Failed to fetch credit history', 500);
    }

    // Get total count for pagination
    const { count, error: countError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (countError) {
      console.error('Error counting transactions:', countError);
    }

    return this.json({
      transactions: transactions as ICreditTransaction[],
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  }

  /**
   * POST /api/credits/history
   * Alternative method to get history with POST (for clients that can't send query params)
   */
  private async getHistoryPost(req: NextRequest): Promise<NextResponse> {
    const userId = this.getUserId(req);
    const body = await this.getBody<ICreditHistoryQuery>(req);

    const MAX_LIMIT = 100;
    const limit = Math.min(Math.max(1, parseInt(body.limit || '50', 10)), MAX_LIMIT);
    const offset = Math.max(0, parseInt(body.offset || '0', 10));

    // Fetch credit transactions
    const { data: transactions, error: fetchError } = await supabaseAdmin
      .from('credit_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (fetchError) {
      console.error('Error fetching credit transactions:', fetchError);
      return this.error('FETCH_ERROR', 'Failed to fetch credit history', 500);
    }

    // Get total count for pagination
    const { count } = await supabaseAdmin
      .from('credit_transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    return this.json({
      transactions: transactions as ICreditTransaction[],
      pagination: {
        limit,
        offset,
        total: count || 0,
      },
    });
  }
}
