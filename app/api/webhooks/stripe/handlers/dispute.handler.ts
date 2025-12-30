import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { stripe } from '@server/stripe';
import Stripe from 'stripe';

/**
 * Dispute Handler
 * Handles Stripe charge disputes with credit holds and account flagging
 */
export class DisputeHandler {
  /**
   * Handle charge dispute created - immediate credit hold and account flagging
   */
  static async handleChargeDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;

    if (!chargeId) {
      console.error(`[DISPUTE] No charge ID in dispute ${dispute.id}`);
      throw new Error('Invalid dispute: missing charge ID');
    }

    console.log(
      `[DISPUTE] Charge dispute ${dispute.id} created for charge ${chargeId}, amount: ${dispute.amount} cents`
    );

    // 1. Get charge details to find customer
    const charge = await stripe.charges.retrieve(chargeId);
    const customerId = charge.customer as string;

    if (!customerId) {
      console.error(`[DISPUTE] No customer ID for charge ${chargeId}`);
      throw new Error('Invalid charge: missing customer ID');
    }

    // 2. Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, subscription_credits_balance, purchased_credits_balance')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error(`[DISPUTE] No profile found for customer ${customerId}`);
      throw new Error('Profile not found for dispute');
    }

    // 3. Flag account as disputed (prevents further credit usage)
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ dispute_status: 'pending' })
      .eq('id', profile.id);

    if (updateError) {
      console.error(`[DISPUTE] Failed to flag account:`, updateError);
    }

    // 4. Calculate credits to hold (dispute amount / average credit value)
    // Using $0.10 per credit as estimate based on subscription pricing
    const disputeAmountCents = dispute.amount;
    const creditsToHold = Math.ceil(disputeAmountCents / 10);

    console.log(
      `[DISPUTE] Holding ${creditsToHold} credits for dispute ${dispute.id} (amount: ${disputeAmountCents} cents)`
    );

    // 5. Clawback credits immediately to hold them during dispute resolution
    const { data: clawbackResult, error: clawbackError } = await supabaseAdmin.rpc(
      'clawback_credits_v2',
      {
        p_target_user_id: profile.id,
        p_amount: creditsToHold,
        p_reason: `Dispute hold: ${dispute.id}`,
        p_ref_id: `dispute_${dispute.id}`,
        p_pool: 'auto', // Clawback from subscription first (FIFO)
      }
    );

    if (clawbackError) {
      console.error(`[DISPUTE] Clawback failed:`, clawbackError);
    } else if (clawbackResult && clawbackResult.length > 0) {
      const result = clawbackResult[0];
      console.log(
        `[DISPUTE] Clawed back ${result.subscription_clawed + result.purchased_clawed} credits ` +
          `(sub: ${result.subscription_clawed}, pur: ${result.purchased_clawed})`
      );
    }

    // 6. Log dispute event for audit trail
    const { error: insertError } = await supabaseAdmin.from('dispute_events').insert({
      dispute_id: dispute.id,
      user_id: profile.id,
      charge_id: chargeId,
      amount_cents: disputeAmountCents,
      credits_held: creditsToHold,
      status: 'created',
      reason: dispute.reason,
    });

    if (insertError) {
      console.error(`[DISPUTE] Failed to log dispute event:`, insertError);
    }

    // 7. Send admin notification
    console.log(
      `[DISPUTE_ALERT] User ${profile.id} disputed charge ${chargeId} for ${disputeAmountCents} cents ` +
        `(reason: ${dispute.reason}). Account flagged, ${creditsToHold} credits held.`
    );

    // TODO: Integrate with email/Slack notification service
    // await sendAdminNotification({
    //   type: 'dispute_created',
    //   disputeId: dispute.id,
    //   userId: profile.id,
    //   amount: disputeAmountCents,
    //   creditsHeld: creditsToHold,
    //   reason: dispute.reason,
    // });
  }

  /**
   * Handle dispute updated - track status changes
   */
  static async handleChargeDisputeUpdated(dispute: Stripe.Dispute): Promise<void> {
    console.log(`[DISPUTE] Dispute ${dispute.id} updated, status: ${dispute.status}`);

    const { error } = await supabaseAdmin
      .from('dispute_events')
      .update({
        status: dispute.status === 'won' ? 'won' : 'updated',
        updated_at: new Date().toISOString(),
      })
      .eq('dispute_id', dispute.id);

    if (error) {
      console.error(`[DISPUTE] Failed to update dispute event:`, error);
    }

    // If dispute is won in our favor, restore account status
    if (dispute.status === 'won') {
      const { data: events } = await supabaseAdmin
        .from('dispute_events')
        .select('user_id')
        .eq('dispute_id', dispute.id)
        .single();

      if (events) {
        await supabaseAdmin
          .from('profiles')
          .update({ dispute_status: 'resolved' })
          .eq('id', events.user_id);

        console.log(`[DISPUTE] Dispute ${dispute.id} won, account ${events.user_id} restored`);
      }
    }
  }

  /**
   * Handle dispute closed - final resolution
   */
  static async handleChargeDisputeClosed(dispute: Stripe.Dispute): Promise<void> {
    console.log(`[DISPUTE] Dispute ${dispute.id} closed, status: ${dispute.status}`);

    const { error } = await supabaseAdmin
      .from('dispute_events')
      .update({
        status: 'closed',
        updated_at: new Date().toISOString(),
      })
      .eq('dispute_id', dispute.id);

    if (error) {
      console.error(`[DISPUTE] Failed to close dispute event:`, error);
    }
  }
}
