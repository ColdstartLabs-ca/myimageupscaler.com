import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';
import { assertKnownPriceId } from '@shared/config/subscription.utils';

interface IAutoTopUpSetting {
  user_id: string;
  threshold_credits: number;
  pack_key: string;
  stripe_price_id: string;
  stripe_customer_id: string;
  stripe_payment_method_id: string;
  consent_version: string;
  consecutive_failures: number;
  charge_claim_id: string | null;
  charge_claimed_at: string | null;
}

export interface IAutoTopUpRunResult {
  scanned: number;
  claimed: number;
  paymentPending: number;
  failed: number;
}

class AmbiguousAutoTopUpConfirmationError extends Error {}

function dailyAttemptKey(userId: string, consentVersion: string, now: Date): string {
  return `auto-top-up:${userId}:${consentVersion}:${now.toISOString().slice(0, 10)}`;
}

export function isAutoTopUpEligibleBalance(balance: number, threshold: number): boolean {
  return balance < threshold;
}

export function isAutoTopUpPayableStatus(status: string): boolean {
  return status === 'succeeded' || status === 'processing';
}

export function isStaleAutoTopUpLease(claimedAt: string | null, now: Date): boolean {
  if (!claimedAt) return true;
  const timestamp = Date.parse(claimedAt);
  return !Number.isFinite(timestamp) || now.getTime() - timestamp >= 5 * 60 * 1000;
}

export class AutoTopUpService {
  async processEligible(limit = 25, now = new Date()): Promise<IAutoTopUpRunResult> {
    const { data, error } = await supabaseAdmin
      .from('auto_top_up_settings')
      .select(
        'user_id, threshold_credits, pack_key, stripe_price_id, stripe_customer_id, stripe_payment_method_id, consent_version, consecutive_failures, charge_claim_id, charge_claimed_at'
      )
      .eq('enabled', true)
      .eq('pending_enabled', false)
      .not('stripe_payment_method_id', 'is', null)
      .limit(limit);
    if (error) throw new Error(`Unable to scan auto top-up settings: ${error.message}`);

    const settings = (data ?? []) as IAutoTopUpSetting[];
    const result: IAutoTopUpRunResult = {
      scanned: settings.length,
      claimed: 0,
      paymentPending: 0,
      failed: 0,
    };

    for (const setting of settings) {
      if (setting.charge_claim_id) {
        if (!isStaleAutoTopUpLease(setting.charge_claimed_at, now)) continue;
        const { data: staleAttempt, error: staleAttemptError } = await supabaseAdmin
          .from('auto_top_up_attempts')
          .select('stripe_payment_intent_id')
          .eq('id', setting.charge_claim_id)
          .maybeSingle();
        if (staleAttemptError) {
          throw new Error(
            `Unable to inspect stale auto top-up attempt: ${staleAttemptError.message}`
          );
        }
        if (staleAttempt?.stripe_payment_intent_id) {
          const existingIntent = await stripe.paymentIntents.retrieve(
            staleAttempt.stripe_payment_intent_id
          );
          if (['succeeded', 'processing'].includes(existingIntent.status)) continue;
          if (existingIntent.status !== 'canceled') {
            const canceled = await stripe.paymentIntents.cancel(
              staleAttempt.stripe_payment_intent_id
            );
            if (canceled.status !== 'canceled') continue;
          }
        }
        await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({ status: 'cancelled', error_class: 'stale_charge_lease' })
          .eq('id', setting.charge_claim_id);
        const { error: staleReleaseError } = await supabaseAdmin
          .from('auto_top_up_settings')
          .update({ charge_claim_id: null, charge_claimed_at: null })
          .eq('user_id', setting.user_id)
          .eq('charge_claim_id', setting.charge_claim_id);
        if (staleReleaseError) {
          throw new Error(
            `Unable to release stale auto top-up lease: ${staleReleaseError.message}`
          );
        }
      }

      const { data: balance } = await supabaseAdmin
        .from('user_credits')
        .select('total_credits_balance')
        .eq('user_id', setting.user_id)
        .maybeSingle();
      const startingBalance = Number(balance?.total_credits_balance ?? 0);
      if (!isAutoTopUpEligibleBalance(startingBalance, setting.threshold_credits)) continue;

      const resolved = assertKnownPriceId(setting.stripe_price_id);
      if (
        resolved.type !== 'pack' ||
        resolved.key !== setting.pack_key ||
        !['small', 'medium'].includes(resolved.key)
      ) {
        await this.pauseSetting(setting, 'invalid_pack_configuration');
        result.failed++;
        continue;
      }

      const idempotencyKey = dailyAttemptKey(setting.user_id, setting.consent_version, now);
      const { data: attempt, error: claimError } = await supabaseAdmin
        .from('auto_top_up_attempts')
        .insert({
          user_id: setting.user_id,
          idempotency_key: idempotencyKey,
          starting_balance: startingBalance,
          status: 'claimed',
          amount_cents: resolved.priceInCents,
          currency: resolved.currency,
        })
        .select('id')
        .maybeSingle();
      if (claimError) {
        if (claimError.code === '23505') continue;
        throw new Error(`Unable to claim auto top-up attempt: ${claimError.message}`);
      }
      if (!attempt) continue;
      result.claimed++;

      const { data: lease, error: leaseError } = await supabaseAdmin
        .from('auto_top_up_settings')
        .update({ charge_claim_id: attempt.id, charge_claimed_at: now.toISOString() })
        .eq('user_id', setting.user_id)
        .eq('enabled', true)
        .eq('consent_version', setting.consent_version)
        .eq('stripe_payment_method_id', setting.stripe_payment_method_id)
        .is('charge_claim_id', null)
        .select('user_id')
        .maybeSingle();
      if (leaseError) throw new Error(`Unable to lease auto top-up setting: ${leaseError.message}`);
      if (!lease) {
        await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({ status: 'cancelled', error_class: 'setting_changed' })
          .eq('id', attempt.id);
        continue;
      }

      try {
        const price = await stripe.prices.retrieve(setting.stripe_price_id);
        if (!price.unit_amount || !price.currency || price.type !== 'one_time') {
          throw new Error('invalid_stripe_price');
        }
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: price.unit_amount,
            currency: price.currency,
            customer: setting.stripe_customer_id,
            payment_method: setting.stripe_payment_method_id,
            confirm: false,
            metadata: {
              auto_top_up: 'true',
              auto_top_up_attempt_id: attempt.id,
              auto_top_up_user_id: setting.user_id,
              auto_top_up_consent_version: setting.consent_version,
              auto_top_up_pack_key: setting.pack_key,
            },
          },
          { idempotencyKey }
        );
        const { error: persistError } = await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({
            status: 'payment_pending',
            stripe_payment_intent_id: paymentIntent.id,
            amount_cents: price.unit_amount,
            currency: price.currency,
          })
          .eq('id', attempt.id);
        if (persistError) {
          await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => undefined);
          throw new Error(`payment_intent_persistence_failed:${persistError.message}`);
        }

        const { data: current } = await supabaseAdmin
          .from('auto_top_up_settings')
          .select('enabled, charge_claim_id')
          .eq('user_id', setting.user_id)
          .maybeSingle();
        if (!current?.enabled || current.charge_claim_id !== attempt.id) {
          await stripe.paymentIntents.cancel(paymentIntent.id);
          await supabaseAdmin
            .from('auto_top_up_attempts')
            .update({ status: 'cancelled', error_class: 'disabled_before_confirmation' })
            .eq('id', attempt.id);
          continue;
        }

        let confirmed;
        try {
          confirmed = await stripe.paymentIntents.confirm(
            paymentIntent.id,
            { off_session: true },
            { idempotencyKey: `${idempotencyKey}:confirm` }
          );
        } catch {
          let reconciled;
          try {
            reconciled = await stripe.paymentIntents.retrieve(paymentIntent.id);
          } catch (reconcileError) {
            throw new AmbiguousAutoTopUpConfirmationError(
              `Unable to reconcile PaymentIntent confirmation: ${String(reconcileError)}`
            );
          }
          if (isAutoTopUpPayableStatus(reconciled.status)) {
            confirmed = reconciled;
          } else {
            try {
              const canceled = await stripe.paymentIntents.cancel(paymentIntent.id);
              if (canceled.status !== 'canceled') {
                throw new Error(`unexpected_cancel_status_${canceled.status}`);
              }
            } catch (cancelError) {
              throw new AmbiguousAutoTopUpConfirmationError(
                `Unable to cancel reconciled PaymentIntent: ${String(cancelError)}`
              );
            }
            throw new Error(`payment_intent_${reconciled.status}`);
          }
        }
        if (!isAutoTopUpPayableStatus(confirmed.status)) {
          throw new Error(`payment_intent_${confirmed.status}`);
        }
        result.paymentPending++;
      } catch (paymentError) {
        if (paymentError instanceof AmbiguousAutoTopUpConfirmationError) throw paymentError;
        const errorClass =
          paymentError instanceof Error ? paymentError.message : 'payment_intent_failed';
        const { error: failureError } = await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({ status: 'failed', error_class: errorClass })
          .eq('id', attempt.id);
        if (failureError)
          throw new Error(`Unable to persist auto top-up failure: ${failureError.message}`);
        await this.pauseSetting(setting, errorClass, attempt.id);
        result.failed++;
      }
    }
    return result;
  }

  private async pauseSetting(
    setting: IAutoTopUpSetting,
    reason: string,
    claimId?: string
  ): Promise<void> {
    const failures = setting.consecutive_failures + 1;
    const { error } = await supabaseAdmin
      .from('auto_top_up_settings')
      .update({
        consecutive_failures: failures,
        enabled: failures < 3,
        failure_reason: reason,
        ...(claimId ? { charge_claim_id: null, charge_claimed_at: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', setting.user_id)
      .eq('consent_version', setting.consent_version);
    if (error) throw new Error(`Unable to update auto top-up failure state: ${error.message}`);
  }
}

let instance: AutoTopUpService | null = null;
export function getAutoTopUpService(): AutoTopUpService {
  instance ??= new AutoTopUpService();
  return instance;
}
