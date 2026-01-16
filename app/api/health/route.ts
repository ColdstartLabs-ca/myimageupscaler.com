import { NextResponse } from 'next/server';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

export const dynamic = 'force-dynamic';

interface IHealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  region: string;
  checks: {
    database: {
      status: 'pass' | 'fail';
      message: string;
      duration?: number;
    };
  };
}

export async function GET(): Promise<NextResponse<IHealthCheckResult>> {
  const checks: IHealthCheckResult['checks'] = {
    database: { status: 'fail', message: '' },
  };

  let overallStatus: IHealthCheckResult['status'] = 'healthy';
  const region = serverEnv.CF_PAGES_URL ? 'Cloudflare' : 'Local';

  // Check 1: Database connectivity
  try {
    const dbStart = Date.now();
    const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
    const dbDuration = Date.now() - dbStart;

    if (error) {
      checks.database = {
        status: 'fail',
        message: `Database error: ${error.message}`,
        duration: dbDuration,
      };
      overallStatus = 'unhealthy';
    } else {
      checks.database = {
        status: 'pass',
        message: 'Database connection successful',
        duration: dbDuration,
      };
    }
  } catch (error) {
    checks.database = {
      status: 'fail',
      message: `Database check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
    overallStatus = 'unhealthy';
  }

  const result: IHealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    region,
    checks,
  };

  // Return 200 for healthy/degraded, 503 for unhealthy
  const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
