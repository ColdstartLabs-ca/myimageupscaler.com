import { monitorUpscaleCompletionRate } from '@server/services/upscale-completion-health.service';
import { serverEnv } from '@shared/config/env';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (
    serverEnv.CRON_SECRET === '' ||
    request.headers.get('x-cron-secret') !== serverEnv.CRON_SECRET
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const alerted = await monitorUpscaleCompletionRate();
    return NextResponse.json({ success: true, alerted });
  } catch (error) {
    console.error('Upscale completion health cron failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: 'Upscale completion health check failed' },
      { status: 500 }
    );
  }
}
