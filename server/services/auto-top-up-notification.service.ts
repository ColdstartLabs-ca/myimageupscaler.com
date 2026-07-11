import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getEmailService } from '@server/services/email.service';

export async function notifyAutoTopUpFailure(
  userId: string,
  failures: number,
  attemptId: string
): Promise<void> {
  const claimId = crypto.randomUUID();
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
    'claim_auto_top_up_failure_notification',
    { p_attempt_id: attemptId, p_claim_id: claimId }
  );
  if (claimError) {
    throw new Error(`Unable to claim auto-top-up notice: ${claimError.message}`);
  }
  if (claimed !== true) return;

  try {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) throw new Error(`Unable to load auto top-up email recipient: ${error.message}`);
    if (data.user?.email) {
      await getEmailService().send({
        to: data.user.email,
        userId,
        type: 'transactional',
        template: 'auto-top-up-failure',
        data: { paused: failures >= 3 },
      });
    }
    const { error: updateError } = await supabaseAdmin
      .from('auto_top_up_attempts')
      .update({
        failure_notification_pending: false,
        failure_notification_claim_id: null,
        failure_notification_claimed_at: null,
        failure_notified_at: new Date().toISOString(),
      })
      .eq('id', attemptId)
      .eq('failure_notification_claim_id', claimId);
    if (updateError) {
      throw new Error(`Unable to mark auto-top-up notice sent: ${updateError.message}`);
    }
  } catch (error) {
    await supabaseAdmin
      .from('auto_top_up_attempts')
      .update({
        failure_notification_claim_id: null,
        failure_notification_claimed_at: null,
      })
      .eq('id', attemptId)
      .eq('failure_notification_claim_id', claimId);
    throw error;
  }
}
