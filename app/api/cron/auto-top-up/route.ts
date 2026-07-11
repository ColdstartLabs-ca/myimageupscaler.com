import { NextRequest, NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { getAutoTopUpService } from '@server/services/auto-top-up.service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requested = Number(new URL(request.url).searchParams.get('limit') ?? 25);
  const limit = Number.isFinite(requested) ? Math.min(100, Math.max(1, Math.floor(requested))) : 25;
  try {
    return NextResponse.json({ data: await getAutoTopUpService().processEligible(limit) });
  } catch (error) {
    console.error('[AUTO_TOP_UP_CRON] Failed', error);
    return NextResponse.json({ error: 'Auto top-up processing failed' }, { status: 500 });
  }
}
