import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { workerRayBinding } from '@server/services/reservation-worker-binding';

const hardWorkerOutcomes = z.enum(['exception', 'exceededCpu', 'exceededMemory']);
const tailRefundSchema = z
  .object({
    jobId: z.string().uuid(),
    outcome: hardWorkerOutcomes,
    rayId: z.string().trim().min(1).max(128),
  })
  .strict();

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (
    serverEnv.CRON_SECRET === '' ||
    request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 1_024) {
    return NextResponse.json({ error: 'Invalid tail refund payload' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid tail refund payload' }, { status: 400 });
  }

  const parsed = tailRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid tail refund payload' }, { status: 400 });
  }

  const { jobId, outcome, rayId } = parsed.data;
  const { data: reservation, error: lookupError } = await supabaseAdmin
    .from('processing_credit_reservations')
    .select('user_id, status, failure_reason')
    .eq('job_id', jobId)
    .maybeSingle();

  if (lookupError) {
    console.error('Tail refund reservation lookup failed', {
      jobId,
      outcome,
      error: lookupError.message,
    });
    return NextResponse.json({ success: false, refunded: false }, { status: 503 });
  }

  if (
    !reservation ||
    reservation.status !== 'processing' ||
    reservation.failure_reason !== workerRayBinding(rayId)
  ) {
    return NextResponse.json({ success: true, refunded: false });
  }

  const { data: refunded, error: refundError } = await supabaseAdmin.rpc(
    'refund_processing_credit_reservation',
    {
      p_user_id: reservation.user_id,
      p_job_id: jobId,
      p_failure_reason: `tail_observed_${outcome}`,
    }
  );

  if (refundError) {
    console.error('Tail-observed Worker failure refund failed', {
      jobId,
      outcome,
      error: refundError.message,
    });
    return NextResponse.json({ success: false, refunded: false }, { status: 503 });
  }

  return NextResponse.json({ success: true, refunded: refunded === true });
}
