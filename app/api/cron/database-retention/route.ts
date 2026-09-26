import { NextRequest, NextResponse } from 'next/server';
import { runDatabaseRetention } from '@server/services/databaseRetention.service';
import { serverEnv } from '@shared/config/env';

function parseBatchSize(request: NextRequest): number | undefined {
  const raw = request.nextUrl.searchParams.get('batchSize');
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDatabaseRetention({
      dryRun: request.nextUrl.searchParams.get('dryRun') === 'true',
      batchSize: parseBatchSize(request),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CRON] Database retention failed:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
