/**
 * Cron Job: Send Abandoned Checkout Recovery Emails
 *
 * * Runs every 15 minutes via Vercel Cron or Cloudflare Workers
 *
 * @see docs/PRDs/checkout-recovery-system.md Phase 5
 */

import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { sendDueRecoveryEmails } from '@server/services/recovery-email.service';
import { trackServerEvent } from '@server/analytics';

/**
 * Authentication middleware for cron jobs
 */
function validateCronAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return false;
  }

  // Support both Bearer token and direct secret comparison
  const token = authHeader.replace('Bearer ', '');

  // Reject empty tokens or empty secrets to prevent bypass attacks
  if (!token || !serverEnv.CRON_SECRET) {
    return false;
  }

  const isValid = token === serverEnv.CRON_SECRET;

  if (!isValid) {
    console.warn('[cron/recover-abandoned-checkouts] Invalid cron secret');
  }

  return isValid;
}

/**
 * GET /api/cron/recover-abandoned-checkouts
 *
 * Sends recovery emails for abandoned checkouts that are due.
 *
 * Query params:
 * - dryRun: If true, returns what would be sent without actually sending
 *
 * Response:
 * {
 *   success: true;
 *   data: {
 *     email1hr: { sent: number; failed: number; total: number };
 *     email24hr: { sent: number; failed: number; total: number };
 *     email72hr: { sent: number; failed: number; total: number };
 *     totalSent: number;
 *     totalFailed: number;
 *     dryRun: boolean;
 *   };
 *   timestamp: string;
 * }
 */
export async function GET(request: NextRequest) {
  // Validate authentication
  if (!validateCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get('dryRun') === 'true';

  try {
    // Send all three types of recovery emails in parallel
    const [email1hr, email24hr, email72hr] = await Promise.all([
      sendDueRecoveryEmails('1hr', { dryRun }),
      sendDueRecoveryEmails('24hr', { dryRun }),
      sendDueRecoveryEmails('72hr', { dryRun }),
    ]);

    const response = {
      success: true,
      data: {
        email1hr,
        email24hr,
        email72hr,
        totalSent: email1hr.sent + email24hr.sent + email72hr.sent,
        totalFailed: email1hr.failed + email24hr.failed + email72hr.failed,
        dryRun,
      },
      timestamp: new Date().toISOString(),
    };

    // Track cron execution
    await trackServerEvent(
      'recovery_cron_executed',
      {
        dryRun,
        email1hrTotal: email1hr.total,
        email24hrTotal: email24hr.total,
        email72hrTotal: email72hr.total,
        totalSent: response.data.totalSent,
        totalFailed: response.data.totalFailed,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY }
    );

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[cron/recover-abandoned-checkouts] Error:', error);

    await trackServerEvent(
      'recovery_cron_error',
      {
        error: errorMessage,
        dryRun,
      },
      { apiKey: serverEnv.AMPLITUDE_API_KEY }
    );

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
