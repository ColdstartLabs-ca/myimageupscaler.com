import { trackServerEvent } from '@server/analytics';
import { normalizeCoreEventProperties } from '@server/analytics/core-event-contract';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { serverEnv } from '@shared/config/env';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const edgeFailureObservationSchema = z
  .object({
    status: z.number().int().min(400).max(599),
    rayId: z
      .string()
      .trim()
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
      .nullable()
      .optional(),
    qualityTier: z
      .string()
      .trim()
      .toLowerCase()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9._-]*$/)
      .optional(),
    scale: z.union([z.literal(2), z.literal(4), z.literal(8)]).optional(),
  })
  .strict();

const MAX_BODY_BYTES = 2048;

async function writeFailureRow(
  userId: string,
  observation: z.infer<typeof edgeFailureObservationSchema>
): Promise<void> {
  const rayId = observation.rayId ?? null;
  const { error } = await supabaseAdmin.from('processing_jobs').insert({
    user_id: userId,
    status: 'failed',
    input_image_path: 'inline://redacted',
    output_image_path: null,
    credits_used: 0,
    processing_mode: 'standard',
    error_message: 'edge_error',
    settings: {
      failure_source: 'client_edge_observation',
      edge_status: observation.status,
      ray_id: rayId,
      quality_tier: observation.qualityTier ?? null,
      scale: observation.scale ?? null,
    },
    model_id: null,
    quality_tier: observation.qualityTier ?? null,
    scale: observation.scale ?? null,
    credits_charged: 0,
  });

  if (error) throw new Error(error.message);
}

async function trackFailureEvent(
  userId: string,
  observation: z.infer<typeof edgeFailureObservationSchema>
): Promise<void> {
  const accepted = await trackServerEvent(
    'processing_failed',
    {
      telemetrySource: 'server',
      ...normalizeCoreEventProperties('processing_failed', {
        errorType: 'edge_error',
        reason: 'edge_error',
        provider: 'unknown',
        model: 'unknown',
        qualityTier: observation.qualityTier ?? 'unknown',
        retryable: true,
        durationMs: null,
        requestId: observation.rayId ?? 'unknown',
      }),
    },
    { apiKey: serverEnv.AMPLITUDE_API_KEY, userId }
  );

  if (!accepted) {
    throw new Error('Upscale edge-failure telemetry was not accepted');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = request.headers.get('X-User-Id');
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Observation payload is too large' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid observation payload' }, { status: 400 });
  }

  const parsed = edgeFailureObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid observation payload' }, { status: 400 });
  }

  const [rowResult, eventResult] = await Promise.allSettled([
    writeFailureRow(userId, parsed.data),
    trackFailureEvent(userId, parsed.data),
  ]);

  if (rowResult.status === 'rejected') {
    console.warn('Failed to persist upscale edge-failure observation', {
      userId,
      error:
        rowResult.reason instanceof Error ? rowResult.reason.message : String(rowResult.reason),
    });
  }
  if (eventResult.status === 'rejected') {
    console.warn('Failed to track upscale edge-failure observation', {
      userId,
      error:
        eventResult.reason instanceof Error
          ? eventResult.reason.message
          : String(eventResult.reason),
    });
  }

  if (rowResult.status === 'rejected' || eventResult.status === 'rejected') {
    return NextResponse.json(
      {
        success: false,
        rowPersisted: rowResult.status === 'fulfilled',
        telemetryAccepted: eventResult.status === 'fulfilled',
      },
      { status: 503 }
    );
  }

  return NextResponse.json({ success: true }, { status: 202 });
}
