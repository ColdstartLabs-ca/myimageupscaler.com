import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { InsufficientCreditsError } from '../../image-generation.service';
import type { ICreditDeduction } from '../../image-processor.interface';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

/**
 * Result of a credit operation
 */
export interface ICreditOperationResult {
  success: boolean;
  newBalance: number;
  jobId: string;
}

/**
 * Credit Manager for Replicate Service
 *
 * Handles credit deduction and refund operations atomically
 */
export class CreditManager {
  /**
   * Deduct credits before processing
   *
   * @param userId - The user ID
   * @param amount - The amount of credits to deduct
   * @param provider - The provider name for description
   * @returns The new balance and job ID
   * @throws InsufficientCreditsError if user has insufficient credits
   * @throws Error if Supabase RPC call fails
   */
  async deductCredits(
    userId: string,
    amount: number,
    provider: string = 'Replicate'
  ): Promise<ICreditDeduction> {
    const jobId = this.generateJobId(provider);

    const { data: balanceResult, error: creditError } = await supabaseAdmin.rpc(
      'consume_credits_v2',
      {
        target_user_id: userId,
        amount,
        ref_id: jobId,
        description: `Image processing via ${provider} (${amount} credits)`,
      }
    );

    if (creditError) {
      if (creditError.message?.includes('Insufficient credits')) {
        await this.queueInsufficientCreditAlert(userId, amount);
        throw new InsufficientCreditsError(creditError.message);
      }
      throw new Error(`Failed to deduct credits: ${creditError.message}`);
    }

    // Extract total balance from result (returns array with single row)
    const result = balanceResult?.[0] ?? {};
    const newBalance = result.new_total_balance ?? 0;
    const subscriptionAmount = result.consumed_subscription ?? amount;
    const purchasedAmount = result.consumed_purchased ?? 0;
    await this.queueLowBalanceAlert(userId, newBalance);

    return { amount, newBalance, jobId, subscriptionAmount, purchasedAmount };
  }

  /**
   * Refund credits on processing failure
   *
   * @param userId - The user ID
   * @param jobId - The job ID from credit deduction
   * @param amount - The amount of credits to refund
   */
  async refundCredits(
    userId: string,
    deduction: Pick<
      ICreditDeduction,
      'amount' | 'jobId' | 'subscriptionAmount' | 'purchasedAmount'
    >,
    description = 'Credit refund for failed processing'
  ): Promise<boolean> {
    const { error } = await supabaseAdmin.rpc('refund_consumed_credits', {
      p_user_id: userId,
      p_amount: deduction.amount,
      p_job_id: deduction.jobId,
      p_subscription_amount: deduction.subscriptionAmount,
      p_purchased_amount: deduction.purchasedAmount,
      p_description: description,
    });

    if (error) {
      console.error('Failed to refund credits:', error);
      return false;
    }

    return true;
  }

  /**
   * Generate a unique job ID for credit tracking
   *
   * @param provider - The provider name (prefix)
   * @returns A unique job ID
   */
  private generateJobId(provider: string): string {
    const prefix = provider.toLowerCase().slice(0, 3); // First 3 chars of provider
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private async queueLowBalanceAlert(userId: string, newBalance: number): Promise<void> {
    if (newBalance > 3) return;
    try {
      await getEmailLifecycleService().queueLowCreditAlert({
        userId,
        creditsRemaining: newBalance,
        reason: newBalance <= 0 ? 'zero' : 'low',
      });
    } catch (error) {
      console.error('Failed to queue low credit lifecycle email:', error);
    }
  }

  private async queueInsufficientCreditAlert(
    userId: string,
    requiredCredits: number
  ): Promise<void> {
    try {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('credits_balance, subscription_credits_balance, purchased_credits_balance')
        .eq('id', userId)
        .maybeSingle();
      const creditsRemaining =
        Number(data?.credits_balance ?? 0) +
        Number(data?.subscription_credits_balance ?? 0) +
        Number(data?.purchased_credits_balance ?? 0);
      await getEmailLifecycleService().queueLowCreditAlert({
        userId,
        creditsRemaining,
        requiredCredits,
        reason: 'insufficient',
      });
    } catch (error) {
      console.error('Failed to queue insufficient credit lifecycle email:', error);
    }
  }
}

/**
 * Singleton instance for convenience
 */
export const creditManager = new CreditManager();
