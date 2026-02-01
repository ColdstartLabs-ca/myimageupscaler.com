/**
 * IndexNow Submission API Route
 *
 * API endpoint for submitting URLs to IndexNow for faster search engine indexing.
 * Protected by x-cron-secret header authentication (same as cron routes).
 *
 * POST /api/seo/indexnow
 * Headers: x-cron-secret: <CRON_SECRET>
 *
 * Request body:
 * ```json
 * {
 *   "urls": ["https://myimageupscaler.com/page1", "https://myimageupscaler.com/page2"],
 *   "options": {
 *     "batchSize": 1000,
 *     "delayMs": 1000
 *   }
 * }
 * ```
 *
 * Or submit a single URL:
 * ```json
 * {
 *   "url": "https://myimageupscaler.com/page"
 * }
 * ```
 *
 * GET /api/seo/indexnow
 * Headers: x-cron-secret: <CRON_SECRET>
 * Returns IndexNow configuration status
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { submitUrl, submitBatch, getSubmissionStatus } from '@lib/seo/indexnow';
import { serverEnv } from '@shared/config/env';

// =============================================================================
// Authentication
// =============================================================================

/**
 * Validate the cron secret header
 */
function validateAuth(request: NextRequest): boolean {
  const cronSecret = request.headers.get('x-cron-secret');
  return cronSecret === serverEnv.CRON_SECRET && serverEnv.CRON_SECRET !== '';
}

// =============================================================================
// Validation Schemas
// =============================================================================

const singleUrlSchema = z.object({
  url: z.string().url('Invalid URL format'),
});

const batchUrlsSchema = z.object({
  urls: z.array(z.string().url('Invalid URL format')).min(1, 'At least one URL required'),
  options: z
    .object({
      batchSize: z.number().int().min(1).max(10000).optional(),
      delayMs: z.number().int().min(0).max(60000).optional(),
    })
    .optional(),
});

// =============================================================================
// GET Handler - Status
// =============================================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Validate authentication
  if (!validateAuth(request)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing x-cron-secret header',
      },
      { status: 401 }
    );
  }

  try {
    const status = await getSubmissionStatus();

    return NextResponse.json({
      success: true,
      data: status,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// POST Handler - Submit URLs
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Validate authentication
  if (!validateAuth(request)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized: Invalid or missing x-cron-secret header',
      },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    // Try single URL submission first
    const singleUrlResult = singleUrlSchema.safeParse(body);

    if (singleUrlResult.success) {
      const result = await submitUrl(singleUrlResult.data.url);

      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    // Try batch submission
    const batchUrlsResult = batchUrlsSchema.safeParse(body);

    if (batchUrlsResult.success) {
      const result = await submitBatch(batchUrlsResult.data.urls, batchUrlsResult.data.options);

      return NextResponse.json({
        success: result.success,
        data: result,
      });
    }

    // Neither schema matched
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid request body. Expected { url: string } or { urls: string[] }',
      },
      { status: 400 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
