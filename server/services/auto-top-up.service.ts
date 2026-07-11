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
}

export interface IAutoTopUpRunResult {
  scanned: number;
  claimed: number;
  paymentPending: number;
  failed: number;
}

function dailyAttemptKey(userId: string, consentVersion: string, now: Date): string {
  return `auto-top-up:${userId}:${consentVersion}:${now.toISOString().slice(0, 10)}`;
}

export class AutoTopUpService {
  async processEligible(limit = 25, now = new Date()): Promise<IAutoTopUpRunResult> {
    const { data, error } = await supabaseAdmin
      .from('auto_top_up_settings')
      .select(
        'user_id, threshold_credits, pack_key, stripe_price_id, stripe_customer_id, stripe_payment_method_id, consent_version, consecutive_failures'
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
      const { data: balance } = await supabaseAdmin
        .from('user_credits')
        .select('total_credits_balance')
        .eq('user_id', setting.user_id)
        .maybeSingle();
      const startingBalance = Number(balance?.total_credits_balance ?? 0);
      if (startingBalance > setting.threshold_credits) continue;

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
      if (claimError || !attempt) continue;
      result.claimed++;

      const { data: current } = await supabaseAdmin
        .from('auto_top_up_settings')
        .select('enabled, stripe_payment_method_id, consent_version')
        .eq('user_id', setting.user_id)
        .maybeSingle();
      if (
        !current?.enabled ||
        current.consent_version !== setting.consent_version ||
        current.stripe_payment_method_id !== setting.stripe_payment_method_id
      ) {
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
            off_session: true,
            confirm: true,
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
        await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({
            status: 'payment_pending',
            stripe_payment_intent_id: paymentIntent.id,
            amount_cents: price.unit_amount,
            currency: price.currency,
          })
          .eq('id', attempt.id);
        result.paymentPending++;
      } catch (paymentError) {
        const errorClass =
          paymentError instanceof Error ? paymentError.name : 'payment_intent_failed';
        await supabaseAdmin
          .from('auto_top_up_attempts')
          .update({ status: 'failed', error_class: errorClass })
          .eq('id', attempt.id);
        await this.pauseSetting(setting, errorClass);
        result.failed++;
      }
    }
    return result;
  }

  private async pauseSetting(setting: IAutoTopUpSetting, reason: string): Promise<void> {
    const failures = setting.consecutive_failures + 1;
    await supabaseAdmin
      .from('auto_top_up_settings')
      .update({
        consecutive_failures: failures,
        enabled: failures < 3,
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', setting.user_id)
      .eq('consent_version', setting.consent_version);
  }
}

let instance: AutoTopUpService | null = null;
export function getAutoTopUpService(): AutoTopUpService {
  instance ??= new AutoTopUpService();
  return instance;
}
