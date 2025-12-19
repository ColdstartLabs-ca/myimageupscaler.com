import type { IIdempotencyResult, WebhookEventStatus } from '@/shared/types/stripe.types';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export class IdempotencyService {
  /**
   * Check if webhook event has already been processed.
   * If new, atomically insert with 'processing' status.
   */
  static async checkAndClaimEvent(
    eventId: string,
    eventType: string,
    payload: unknown
  ): Promise<IIdempotencyResult> {
    // First, check if event exists
    const { data: existing } = await supabaseAdmin
      .from('webhook_events')
      .select('status')
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      console.log(`Webhook event ${eventId} already exists with status: ${existing.status}`);
      return { isNew: false, existingStatus: existing.status as WebhookEventStatus };
    }

    // Try to insert - may fail if concurrent request beat us
    const { error: insertError } = await supabaseAdmin.from('webhook_events').insert({
      event_id: eventId,
      event_type: eventType,
      status: 'processing',
      payload: payload as Record<string, unknown>,
    });

    if (insertError) {
      // Unique constraint violation = another request got there first
      if (insertError.code === '23505') {
        console.log(`Webhook event ${eventId} claimed by concurrent request`);
        return { isNew: false, existingStatus: 'processing' };
      }
      // Other error - let it bubble up
      throw insertError;
    }

    console.log(`Webhook event ${eventId} claimed for processing`);
    return { isNew: true };
  }

  /**
   * Mark webhook event as completed
   * CRITICAL-3 FIX: Throws on error to trigger Stripe retry if DB update fails
   */
  static async markEventCompleted(eventId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('webhook_events')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (error) {
      console.error(`Failed to mark event ${eventId} as completed:`, error);
      // Throw to trigger 500 response - Stripe will retry the webhook
      // This prevents orphaned events stuck in 'processing' status
      throw new Error(`Database error marking event completed: ${error.message}`);
    }
  }

  /**
   * Mark webhook event as failed
   */
  static async markEventFailed(eventId: string, errorMessage: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('webhook_events')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (error) {
      console.error(`Failed to mark event ${eventId} as failed:`, error);
    }
  }

  /**
   * Mark webhook event as unrecoverable (unhandled event type)
   */
  static async markEventUnrecoverable(eventId: string, eventType: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('webhook_events')
      .update({
        status: 'unrecoverable',
        error_message: `Unhandled event type: ${eventType}`,
        completed_at: new Date().toISOString(),
      })
      .eq('event_id', eventId);

    if (error) {
      console.error(`Failed to mark event ${eventId} as unrecoverable:`, error);
    }
  }
}
