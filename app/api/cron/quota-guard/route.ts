import { NextRequest, NextResponse } from 'next/server';
import { runDailyQuotaGuard } from '@server/services/quotaGuard.service';
import { serverEnv } from '@shared/config/env';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDailyQuotaGuard();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Quota guard failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
