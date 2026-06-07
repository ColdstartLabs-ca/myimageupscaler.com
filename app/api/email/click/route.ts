import { NextRequest, NextResponse } from 'next/server';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const queueId = url.searchParams.get('q');
  const destination = url.searchParams.get('url');
  const token = url.searchParams.get('token');

  if (!queueId || !destination || !token) {
    return NextResponse.json({ error: 'Missing click tracking parameters' }, { status: 400 });
  }

  const lifecycleService = getEmailLifecycleService();
  if (!lifecycleService.verifyClickToken(queueId, destination, token)) {
    return NextResponse.json({ error: 'Invalid click token' }, { status: 401 });
  }

  try {
    const { redirectUrl } = await lifecycleService.recordClick({ queueId, destination });
    return NextResponse.redirect(new URL(redirectUrl, request.url), 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid lifecycle email click';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
