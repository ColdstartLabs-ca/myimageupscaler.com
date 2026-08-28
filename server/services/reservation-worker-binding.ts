import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const ACTIVE_RAY_PREFIX = 'active_ray:';

export function workerRayBinding(rayId: string): string {
  return `${ACTIVE_RAY_PREFIX}${rayId}`;
}

/**
 * Bind a durable reservation to Cloudflare's server-issued invocation id before
 * provider work. If the bind cannot be persisted, refund and fail closed so a
 * later Tail event can never mutate an unrelated reservation.
 */
export async function bindReservationToWorkerRay(
  userId: string,
  jobId: string,
  rayId?: string
): Promise<void> {
  if (!rayId) return;

  const { data, error } = await supabaseAdmin
    .from('processing_credit_reservations')
    .update({ failure_reason: workerRayBinding(rayId), updated_at: new Date().toISOString() })
    .eq('job_id', jobId)
    .eq('user_id', userId)
    .eq('status', 'processing')
    .select('job_id')
    .maybeSingle();

  if (!error && data?.job_id === jobId) return;

  const { error: refundError } = await supabaseAdmin.rpc('refund_processing_credit_reservation', {
    p_user_id: userId,
    p_job_id: jobId,
    p_failure_reason: 'worker_ray_binding_failed',
  });
  if (refundError) {
    console.error('Failed to refund reservation after Worker ray binding failure', {
      jobId,
      error: refundError.message,
    });
  }

  throw new Error(
    `Failed to bind processing reservation to Worker invocation: ${error?.message ?? 'no row updated'}`
  );
}
