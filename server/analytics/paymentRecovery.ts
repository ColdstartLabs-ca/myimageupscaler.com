import { trackServerEvent } from '@server/analytics';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';

export type TPaymentRecoveryPurchaseType = 'subscription' | 'credit_pack' | 'unknown';

export interface IRecordPaymentFailureParams {
  failureObjectId: string;
  userId: string;
  purchaseType: TPaymentRecoveryPurchaseType;
  amountCents: number;
  currency: string;
  failureType: string;
  recoveryChannel: string;
}

export interface ITrackPaymentRecoveredParams {
  userId: string;
  candidateFailureObjectIds: string[];
  sourceObjectId: string;
  purchaseType: TPaymentRecoveryPurchaseType;
  amountCents: number;
  currency: string;
  recoveryChannel: string;
}

function boundedToken(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_');
  return /^[a-z0-9][a-z0-9._:/-]{0,63}$/.test(normalized) ? normalized : fallback;
}

function normalizeCurrency(currency: string): string {
  const normalized = currency.trim().toLowerCase();
  return /^[a-z]{3}$/.test(normalized) ? normalized : 'usd';
}

function shouldPersistRecoveryState(): boolean {
  return serverEnv.ENV !== 'test';
}

/** Persist a bounded failure record before the recovery webhook can arrive. */
export async function recordPaymentFailure(params: IRecordPaymentFailureParams): Promise<void> {
  if (!shouldPersistRecoveryState()) return;
  if (!params.failureObjectId || !params.userId) return;

  try {
    const { error } = await supabaseAdmin.from('billing_payment_failures').upsert(
      {
        failure_object_id: params.failureObjectId,
        user_id: params.userId,
        purchase_type: params.purchaseType,
        amount_cents: Number.isFinite(params.amountCents)
          ? Math.max(0, Math.trunc(params.amountCents))
          : 0,
        currency: normalizeCurrency(params.currency),
        failure_type: boundedToken(params.failureType, 'generic'),
        recovery_channel: boundedToken(params.recoveryChannel, 'unknown'),
      },
      { onConflict: 'failure_object_id', ignoreDuplicates: true }
    );
    if (error) {
      console.warn('[PAYMENT_RECOVERY] Failed to persist payment failure', {
        failureObjectId: params.failureObjectId,
        error: error.message,
      });
    }
  } catch (error) {
    // Correlation must never cause Stripe to retry a fulfilled webhook.
    console.warn('[PAYMENT_RECOVERY] Payment failure persistence unavailable', {
      failureObjectId: params.failureObjectId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Emit one recovery event only when a previously recorded failure is found. */
export async function trackPaymentRecovered(
  params: ITrackPaymentRecoveredParams
): Promise<boolean> {
  if (!shouldPersistRecoveryState()) return false;
  const candidateIds = [...new Set(params.candidateFailureObjectIds.filter(Boolean))].slice(0, 5);
  if (!params.userId || !params.sourceObjectId || candidateIds.length === 0) return false;

  try {
    const { data: failure, error } = await supabaseAdmin
      .from('billing_payment_failures')
      .select('failure_object_id, purchase_type, failure_type, recovery_channel')
      .eq('user_id', params.userId)
      .in('failure_object_id', candidateIds)
      .is('recovered_at', null)
      .order('failed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[PAYMENT_RECOVERY] Failed to find original payment failure', {
        sourceObjectId: params.sourceObjectId,
        error: error.message,
      });
      return false;
    }
    if (!failure) return false;

    const accepted = await trackServerEvent(
      'payment_recovered',
      {
        purchaseType:
          params.purchaseType === 'unknown' ? failure.purchase_type : params.purchaseType,
        amountCents: Math.max(0, Math.trunc(params.amountCents)),
        currency: normalizeCurrency(params.currency),
        sourceObjectId: params.sourceObjectId,
        originalFailureObjectId: failure.failure_object_id,
        failureType: failure.failure_type,
        recoveryChannel: boundedToken(
          params.recoveryChannel || failure.recovery_channel,
          'unknown'
        ),
      },
      {
        apiKey: serverEnv.AMPLITUDE_API_KEY,
        userId: params.userId,
        // The failed object is the recovery conversion's stable identity. A
        // retry may produce a different successful object, but it must not
        // create a second payment_recovered event for the same failure.
        sourceObjectId: failure.failure_object_id,
        lifecycleAction: 'payment_recovered',
        deduplicate: true,
      }
    );
    if (!accepted) return false;

    const { error: updateError } = await supabaseAdmin
      .from('billing_payment_failures')
      .update({
        recovered_at: new Date().toISOString(),
        recovery_source_object_id: params.sourceObjectId,
      })
      .eq('failure_object_id', failure.failure_object_id)
      .is('recovered_at', null);
    if (updateError) {
      console.warn('[PAYMENT_RECOVERY] Failed to mark payment failure recovered', {
        failureObjectId: failure.failure_object_id,
        error: updateError.message,
      });
    }
    return true;
  } catch (error) {
    console.warn('[PAYMENT_RECOVERY] Recovery correlation unavailable', {
      sourceObjectId: params.sourceObjectId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
