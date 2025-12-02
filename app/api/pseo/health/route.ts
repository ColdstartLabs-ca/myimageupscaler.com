/**
 * pSEO Health Check Endpoint
 * Monitors pSEO page generation and data availability
 */

import { NextResponse } from 'next/server';
import { getAllToolSlugs, getToolData } from '@/lib/seo/data-loader';
import { serverEnv } from '@shared/config/env';

export const dynamic = 'force-dynamic';

interface IHealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    dataLoader: {
      status: 'pass' | 'fail';
      message: string;
      duration?: number;
    };
    samplePage: {
      status: 'pass' | 'fail';
      message: string;
      duration?: number;
    };
  };
  metadata: {
    totalToolPages: number;
    environment: string;
  };
}

export async function GET(): Promise<NextResponse<IHealthCheckResult>> {
  const startTime = Date.now();
  const checks: IHealthCheckResult['checks'] = {
    dataLoader: { status: 'fail', message: '' },
    samplePage: { status: 'fail', message: '' },
  };

  let totalToolPages = 0;
  let overallStatus: IHealthCheckResult['status'] = 'healthy';

  // Check 1: Data Loader - Can we load slugs?
  try {
    const dataLoaderStart = Date.now();
    const slugs = await getAllToolSlugs();
    const dataLoaderDuration = Date.now() - dataLoaderStart;

    totalToolPages = slugs.length;

    if (slugs.length === 0) {
      checks.dataLoader = {
        status: 'fail',
        message: 'No tool pages found in data',
        duration: dataLoaderDuration,
      };
      overallStatus = 'unhealthy';
    } else {
      checks.dataLoader = {
        status: 'pass',
        message: `Successfully loaded ${slugs.length} tool slugs`,
        duration: dataLoaderDuration,
      };
    }
  } catch (error) {
    checks.dataLoader = {
      status: 'fail',
      message: `Data loader error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
    overallStatus = 'unhealthy';
  }

  // Check 2: Sample Page - Can we load a specific page?
  if (totalToolPages > 0) {
    try {
      const samplePageStart = Date.now();
      const sampleSlug = 'ai-image-upscaler'; // Use known slug
      const page = await getToolData(sampleSlug);
      const samplePageDuration = Date.now() - samplePageStart;

      if (!page) {
        checks.samplePage = {
          status: 'fail',
          message: `Sample page "${sampleSlug}" not found`,
          duration: samplePageDuration,
        };
        overallStatus = 'degraded';
      } else {
        // Validate page structure
        const requiredFields = ['slug', 'title', 'metaTitle', 'h1', 'features', 'faq'];
        const missingFields = requiredFields.filter(field => !(field in page));

        if (missingFields.length > 0) {
          checks.samplePage = {
            status: 'fail',
            message: `Sample page missing fields: ${missingFields.join(', ')}`,
            duration: samplePageDuration,
          };
          overallStatus = 'degraded';
        } else {
          checks.samplePage = {
            status: 'pass',
            message: `Sample page loaded successfully with all required fields`,
            duration: samplePageDuration,
          };
        }
      }
    } catch (error) {
      checks.samplePage = {
        status: 'fail',
        message: `Sample page error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      overallStatus = 'degraded';
    }
  }

  const result: IHealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    metadata: {
      totalToolPages,
      environment: serverEnv.ENV,
    },
  };

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(result, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
