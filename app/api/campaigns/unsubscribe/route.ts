/**
 * Campaign Unsubscribe API Endpoint
 *
 * One-click unsubscribe endpoint for email recipients.
 * Supports both POST (List-Unsubscribe-Post) and GET (one-click links).
 *
 * POST /api/campaigns/unsubscribe
 * GET /api/campaigns/unsubscribe?token=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { unsubscribeSchema, type IUnsubscribeResult } from '@shared/validation/campaign.schema';
import { getCampaignService } from '@server/services/campaign.service';
import { createLogger } from '@server/monitoring/logger';
import { ErrorCodes, createErrorResponse } from '@shared/utils/errors';

/**
 * GET handler for one-click unsubscribe links
 *
 * Email clients often use GET for one-click unsubscribe.
 * This renders a simple HTML page confirming the unsubscribe.
 *
 * @param request - The incoming request
 * @returns HTML response with unsubscribe confirmation
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'campaign-unsubscribe');

  try {
    // Extract token from query parameters
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      logger.warn('Unsubscribe request missing token');
      return renderUnsubscribePage(false, 'Invalid unsubscribe link. Token is required.');
    }

    // Validate token format
    const validatedInput = unsubscribeSchema.parse({ token });

    logger.info('Processing GET unsubscribe request');

    // Process unsubscribe
    const campaignService = getCampaignService();
    const success = await campaignService.processUnsubscribe(validatedInput.token);

    if (success) {
      logger.info('Unsubscribe successful');
      return renderUnsubscribePage(
        true,
        'You have been successfully unsubscribed from this email list.'
      );
    } else {
      logger.warn('Unsubscribe failed - invalid or expired token');
      return renderUnsubscribePage(false, 'This unsubscribe link is invalid or has expired.');
    }
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      logger.warn('Invalid unsubscribe token format', { errors: error.errors });
      return renderUnsubscribePage(false, 'Invalid unsubscribe link format.');
    }

    // Handle unexpected errors
    logger.error('Unexpected error in unsubscribe', { error });
    return renderUnsubscribePage(false, 'An error occurred. Please try again or contact support.');
  } finally {
    await logger.flush();
  }
}

/**
 * POST handler for List-Unsubscribe-Post header
 *
 * Email providers (Gmail, Outlook) use POST for one-click unsubscribe.
 * Returns JSON response as per RFC 8058.
 *
 * @param request - The incoming request
 * @returns JSON response with unsubscribe result
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const logger = createLogger(request, 'campaign-unsubscribe');

  try {
    // Check Content-Type for List-Unsubscribe-Post
    const contentType = request.headers.get('content-type') || '';
    const isListUnsubscribePost = request.headers.get('list-unsubscribe-post') === 'Yes';

    let token: string;

    // Handle different content types
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Form-encoded data
      const formData = await request.formData();
      token = formData.get('token') as string;
    } else if (contentType.includes('application/json')) {
      // JSON data
      const body = await request.json();
      token = body.token;
    } else if (isListUnsubscribePost) {
      // RFC 8058 List-Unsubscribe-Post (usually empty body)
      const text = await request.text();
      const params = new URLSearchParams(text);
      token = params.get('token') || '';
    } else {
      // Try to parse as JSON first, then form data
      try {
        const body = await request.json();
        token = body.token;
      } catch {
        const text = await request.text();
        const params = new URLSearchParams(text);
        token = params.get('token') || '';
      }
    }

    // Validate token
    const validatedInput = unsubscribeSchema.parse({ token });

    logger.info('Processing POST unsubscribe request');

    // Process unsubscribe
    const campaignService = getCampaignService();
    const success = await campaignService.processUnsubscribe(validatedInput.token);

    const response: IUnsubscribeResult = {
      success,
      message: success
        ? 'You have been successfully unsubscribed.'
        : 'Invalid or expired unsubscribe token.',
    };

    logger.info('Unsubscribe result', { success });

    return NextResponse.json(response, { status: success ? 200 : 400 });
  } catch (error) {
    // Handle validation errors
    if (error instanceof ZodError) {
      const { body, status } = createErrorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid unsubscribe token',
        400,
        { validationErrors: error.errors }
      );
      return NextResponse.json(body, { status });
    }

    // Handle unexpected errors
    logger.error('Unexpected error in unsubscribe POST', { error });
    const { body, status } = createErrorResponse(
      ErrorCodes.INTERNAL_ERROR,
      'An unexpected error occurred',
      500
    );
    return NextResponse.json(body, { status });
  } finally {
    await logger.flush();
  }
}

/**
 * Render a simple HTML page for GET unsubscribe requests
 *
 * @param success - Whether the unsubscribe was successful
 * @param message - Message to display
 * @returns HTML response
 */
function renderUnsubscribePage(success: boolean, message: string): NextResponse {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - MyImageUpscaler</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 480px;
      padding: 40px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      text-align: center;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    }
    .success .icon {
      background-color: #dcfce7;
      color: #16a34a;
    }
    .error .icon {
      background-color: #fee2e2;
      color: #dc2626;
    }
    h1 {
      font-size: 24px;
      margin: 0 0 12px;
      color: #1f2937;
    }
    p {
      font-size: 16px;
      color: #6b7280;
      margin: 0 0 24px;
      line-height: 1.5;
    }
    a {
      display: inline-block;
      padding: 12px 24px;
      background-color: #3b82f6;
      color: white;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
    }
    a:hover {
      background-color: #2563eb;
    }
  </style>
</head>
<body>
  <div class="container ${success ? 'success' : 'error'}">
    <div class="icon">${success ? '✓' : '✕'}</div>
    <h1>${success ? 'Unsubscribed' : 'Unable to Unsubscribe'}</h1>
    <p>${message}</p>
    <a href="https://myimageupscaler.com">Return to MyImageUpscaler</a>
  </div>
</body>
</html>
  `.trim();

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
