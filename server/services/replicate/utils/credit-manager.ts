import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { createHash, randomUUID } from 'node:crypto';
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

export interface IDeliverableReservationOutput {
  imageUrl: string;
  mimeType: string;
  expiresAt: string | null;
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
    provider: string = 'Replicate',
    requestedJobId?: string
  ): Promise<ICreditDeduction> {
    const jobId = requestedJobId ?? randomUUID();

    const { data: balanceResult, error: creditError } = await supabaseAdmin.rpc(
      'consume_credits_v3',
      {
        p_user_id: userId,
        p_amount: amount,
        p_job_id: jobId,
        p_description: `Image processing via ${provider} (${amount} credits)`,
      }
    );

    if (creditError) {
      if (creditError.message?.includes('Insufficient credits')) {
        await this.queueInsufficientCreditAlert(userId, amount);
        throw new InsufficientCreditsError(
          creditError.message,
          this.getAvailableCreditsFromError(creditError.message)
        );
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

  async refundReservation(
    userId: string,
    deduction: Pick<
      ICreditDeduction,
      'amount' | 'jobId' | 'subscriptionAmount' | 'purchasedAmount'
    >,
    description = 'Credit refund for failed processing'
  ): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('refund_processing_credit_reservation', {
      p_user_id: userId,
      p_job_id: deduction.jobId,
      p_failure_reason: description,
    });

    if (error) {
      console.error('Failed to refund credit reservation:', error);
      return false;
    }

    return data === true;
  }

  async recordDeliverableOutput(
    userId: string,
    jobId: string,
    output: {
      imageUrl?: string;
      mimeType?: string;
      expiresAt?: string | number;
      deliveryTokenHash: string;
    }
  ): Promise<boolean> {
    if (!output.imageUrl) return false;
    const expiresAt =
      typeof output.expiresAt === 'number'
        ? new Date(output.expiresAt).toISOString()
        : (output.expiresAt ?? null);
    const { data, error } = await supabaseAdmin.rpc('record_processing_credit_reservation_output', {
      p_user_id: userId,
      p_job_id: jobId,
      p_output_url: output.imageUrl,
      p_output_mime_type: output.mimeType ?? 'image/png',
      p_output_expires_at: expiresAt,
      p_delivery_token_hash: output.deliveryTokenHash,
    });
    if (error) throw new Error(`Failed to record credit reservation output: ${error.message}`);
    return data === true;
  }

  async retrieveDeliverableOutput(
    userId: string,
    jobId: string,
    deliveryToken: string
  ): Promise<IDeliverableReservationOutput | null> {
    const deliveryTokenHash = createHash('sha256').update(deliveryToken).digest('hex');
    const { data, error } = await supabaseAdmin.rpc(
      'retrieve_processing_credit_reservation_output',
      {
        p_user_id: userId,
        p_job_id: jobId,
        p_delivery_token_hash: deliveryTokenHash,
      }
    );
    if (error) throw new Error(`Failed to retrieve credit reservation output: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.output_url) return null;
    return {
      imageUrl: row.output_url,
      mimeType: row.output_mime_type ?? 'image/png',
      expiresAt: row.output_expires_at ?? null,
    };
  }

  async acknowledgeReceipt(
    userId: string,
    jobId: string,
    output: {
      imageUrl: string;
      mimeType?: string;
      expiresAt?: string | number | null;
      deliveryToken: string;
    }
  ): Promise<boolean> {
    const expiresAt =
      typeof output.expiresAt === 'number'
        ? new Date(output.expiresAt).toISOString()
        : (output.expiresAt ?? null);
    const deliveryTokenHash = createHash('sha256').update(output.deliveryToken).digest('hex');
    const { data, error } = await supabaseAdmin.rpc('acknowledge_processing_credit_reservation', {
      p_user_id: userId,
      p_job_id: jobId,
      p_output_url: output.imageUrl,
      p_output_mime_type: output.mimeType ?? 'image/png',
      p_output_expires_at: expiresAt,
      p_delivery_token_hash: deliveryTokenHash,
    });
    if (error) throw new Error(`Failed to acknowledge credit reservation: ${error.message}`);
    return data === true;
  }

  async reconcileStaleReservations(
    staleAfterSeconds: number,
    limit = 100
  ): Promise<{ refundedCount: number; quarantinedCount: number }> {
    const staleBefore = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
    const { data, error } = await supabaseAdmin.rpc('reconcile_stale_credit_reservations', {
      p_stale_before: staleBefore,
      p_limit: limit,
    });
    if (error) throw new Error(`Failed to reconcile stale credit reservations: ${error.message}`);
    const row = Array.isArray(data) ? (data[0] ?? {}) : (data ?? {});
    return {
      refundedCount: Number(row.refunded_count ?? 0),
      quarantinedCount: Number(row.quarantined_count ?? 0),
    };
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

  private getAvailableCreditsFromError(message: string): number | undefined {
    const match = /Available:\s*(\d+)/i.exec(message);
    return match ? Number(match[1]) : undefined;
  }
}

/**
 * Singleton instance for convenience
 */
export const creditManager = new CreditManager();
