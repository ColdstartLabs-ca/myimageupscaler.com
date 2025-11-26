import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createLogger } from '@server/monitoring/logger';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export const runtime = 'edge';

// Allowed event names for security
const ALLOWED_EVENTS = [
  'signup_started',
  'signup_completed',
  'login',
  'logout',
  'checkout_started',
  'checkout_completed',
  'checkout_abandoned',
  'image_download',
] as const;

const eventSchema = z.object({
  eventName: z.enum(ALLOWED_EVENTS),
  properties: z.record(z.unknown()).optional(),
  sessionId: z.string().optional(),
});

/**
 * POST /api/analytics/event
 *
 * Relay analytics events to Amplitude via server-side HTTP API.
 * Supports both authenticated and anonymous (marketing funnel) events.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const logger = createLogger(req, 'analytics-event');

  try {
    // 1. Parse and validate request body
    const body = await req.json();
    const validated = eventSchema.safeParse(body);

    if (!validated.success) {
      logger.warn('Invalid event payload', { errors: validated.error.errors });
      return NextResponse.json(
        { error: 'Invalid event payload', details: validated.error.errors },
        { status: 400 }
      );
    }

    const { eventName, properties = {}, sessionId } = validated.data;

    // 2. Check for authenticated user (optional)
    let userId: string | undefined;
    const authHeader = req.headers.get('authorization');

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id;
    }

    // 3. Track the event
    const success = await trackServerEvent(
      eventName,
      {
        ...properties,
        sessionId,
        source: 'api',
      },
      {
        apiKey: serverEnv.AMPLITUDE_API_KEY,
        userId,
        deviceId: sessionId,
      }
    );

    if (!success) {
      logger.warn('Failed to track event', { eventName });
      // Still return success - don't fail user actions due to analytics
    }

    logger.info('Event tracked', { eventName, userId: userId || 'anonymous' });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Analytics event error', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Return success even on error - don't block user actions
    return NextResponse.json({ success: true });
  } finally {
    await logger.flush();
  }
}
