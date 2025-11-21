import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/middleware/getAuthenticatedUser';

export const runtime = 'edge'; // Cloudflare Worker compatible

/**
 * Example Protected API Route
 *
 * This route demonstrates how to use the middleware authentication system.
 * The middleware.ts file automatically:
 * 1. Verifies the JWT from the Authorization header
 * 2. Applies rate limiting (50 requests per 10 seconds)
 * 3. Sets X-User-Id header for downstream handlers
 *
 * If the request reaches this handler, authentication has already succeeded.
 */

export async function GET(req: NextRequest) {
  // Extract user information from middleware headers
  // The middleware already verified the JWT and set these headers
  const userId = req.headers.get('X-User-Id');
  const userEmail = req.headers.get('X-User-Email');
  const rateLimitRemaining = req.headers.get('X-RateLimit-Remaining');

  // Optional: Fetch full user profile from database
  // This is only needed if you need more than just the user ID
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json(
      {
        error: 'User not found',
        message: 'Authenticated but user profile not found in database',
      },
      { status: 404 }
    );
  }

  // Return protected data
  return NextResponse.json({
    message: 'Successfully accessed protected route',
    user: {
      id: userId,
      email: userEmail,
      // Include additional profile data from database
      profile: user,
    },
    rateLimit: {
      remaining: rateLimitRemaining,
      limit: 50,
      window: '10 seconds',
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Example POST endpoint
 * Demonstrates creating resources for authenticated users
 */
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse request body
  const body = await req.json();

  // TODO: Add your business logic here
  // Example: Create a resource for the authenticated user
  // const result = await createResource({ userId: user.id, ...body });

  return NextResponse.json({
    message: 'Resource created successfully',
    userId: user.id,
    data: body,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Example PATCH endpoint
 * Demonstrates updating resources for authenticated users
 */
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  // TODO: Add your business logic here
  // Example: Update a resource owned by the authenticated user
  // const result = await updateResource({ userId: user.id, ...body });

  return NextResponse.json({
    message: 'Resource updated successfully',
    userId: user.id,
    data: body,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Example DELETE endpoint
 * Demonstrates deleting resources for authenticated users
 */
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // TODO: Add your business logic here
  // Example: Delete a resource owned by the authenticated user
  // const result = await deleteResource({ userId: user.id });

  return NextResponse.json({
    message: 'Resource deleted successfully',
    userId: user.id,
    timestamp: new Date().toISOString(),
  });
}
