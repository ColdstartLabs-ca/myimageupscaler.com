import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createGscAccessToken: vi.fn(),
  queryAllSearchAnalyticsRows: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    GSC_SERVICE_ACCOUNT_EMAIL: 'test-service-account@example.iam.gserviceaccount.com',
    GSC_PRIVATE_KEY: 'test-private-key',
    GSC_SITE_URL: 'https://myimageupscaler.com',
  },
}));

vi.mock('@/server/services/gsc.service', () => ({
  createGscAccessToken: mocks.createGscAccessToken,
  queryAllSearchAnalyticsRows: mocks.queryAllSearchAnalyticsRows,
}));

vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: mocks.mkdir,
    writeFile: mocks.writeFile,
  },
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}));

import { INTENT_CLUSTERS } from '@/lib/seo/intent-ownership';
import {
  measureCluster,
  normalizePagePath,
  parseDateRange,
  renderClusterReport,
  summarizeClusterRows,
} from '@/scripts/seo/measure-cluster';

const cluster = INTENT_CLUSTERS[0];

describe('cluster measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createGscAccessToken.mockResolvedValue('test-access-token');
    mocks.queryAllSearchAnalyticsRows.mockResolvedValue([
      {
        keys: [cluster.ownerPath],
        clicks: 513,
        impressions: 1000,
        ctr: 0.513,
        position: 7,
      },
      {
        keys: [cluster.memberPaths[0]],
        clicks: 11,
        impressions: 100,
        ctr: 0.11,
        position: 10,
      },
      {
        keys: [cluster.memberPaths[1]],
        clicks: 13,
        impressions: 100,
        ctr: 0.13,
        position: 11,
      },
      {
        keys: [cluster.memberPaths[2]],
        clicks: 17,
        impressions: 100,
        ctr: 0.17,
        position: 12,
      },
      {
        keys: [cluster.memberPaths[3]],
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        position: 8,
      },
      {
        keys: [cluster.measurementPaths![0]],
        clicks: 329,
        impressions: 1000,
        ctr: 0.329,
        position: 8,
      },
    ]);
    mocks.mkdir.mockResolvedValue(undefined);
    mocks.writeFile.mockResolvedValue(undefined);
  });

  test('orchestrates the PRD baseline scope when writing a cluster report', async () => {
    const outputPath = '/tmp/cluster-gif-orchestration-regression.md';

    await expect(
      measureCluster({
        clusterName: 'gif',
        window: parseDateRange('2026-08-05:2026-09-01', 'window'),
        baseline: parseDateRange('2026-06-16:2026-07-13', 'baseline'),
        outputPath,
      })
    ).resolves.toBe(outputPath);

    expect(mocks.createGscAccessToken).toHaveBeenCalledWith(
      'test-service-account@example.iam.gserviceaccount.com',
      'test-private-key'
    );
    expect(mocks.queryAllSearchAnalyticsRows).toHaveBeenCalledTimes(2);
    expect(mocks.writeFile).toHaveBeenCalledWith(outputPath, expect.any(String), 'utf8');

    const report = mocks.writeFile.mock.calls[0]?.[1] as string;

    expect(report).toContain('| Pre-split baseline | 2026-06-16 | 2026-07-13 | 3 | 847 clicks');
    expect(report).toContain('| `/format-scale/gif-upscale-16x` | 5 | 100 | 5.00% | 8.00 | 5 |');
    expect(report).toContain(
      '| `/formats/upscale-gif-images` | 513 | 1,000 | 51.30% | 7.00 | 513 |'
    );
    expect(report).toContain('| `/scale/upscale-16x` | 329 | 1,000 | 32.90% | 8.00 | 329 |');
    expect(report).toContain('| `/format-scale/gif-upscale-2x` | 11 | 100 | 11.00% | 10.00 | — |');
    expect(report).toContain('| `/format-scale/gif-upscale-4x` | 13 | 100 | 13.00% | 11.00 | — |');
    expect(report).toContain('| `/format-scale/gif-upscale-8x` | 17 | 100 | 17.00% | 12.00 | — |');
    expect(report).toContain('Deferred candidates');
    expect(report).toContain('/scale/upscale-16x');
    expect(report).toContain('upscale 16x');
    expect(report).toContain('not a current GIF member');
    expect(report).toContain('exact 28-day Phase 0 gate');
  });

  test('rejects a CLI baseline date range outside the fixed GIF contract', async () => {
    await expect(
      measureCluster({
        clusterName: 'gif',
        window: parseDateRange('2026-08-05:2026-09-01', 'window'),
        baseline: parseDateRange('2026-06-17:2026-07-13', 'baseline'),
        outputPath: '/tmp/cluster-gif-invalid-baseline.md',
      })
    ).rejects.toThrow(
      'Baseline range for cluster "gif" must be 2026-06-16:2026-07-13; received 2026-06-17:2026-07-13'
    );

    expect(mocks.createGscAccessToken).not.toHaveBeenCalled();
    expect(mocks.queryAllSearchAnalyticsRows).not.toHaveBeenCalled();
  });

  test('normalizes GSC URLs to paths', () => {
    expect(normalizePagePath('https://myimageupscaler.com/formats/upscale-gif-images/')).toBe(
      '/formats/upscale-gif-images'
    );
    expect(normalizePagePath('/format-scale/gif-upscale-16x?utm_source=test')).toBe(
      '/format-scale/gif-upscale-16x'
    );
  });

  test('rejects malformed or reversed date windows', () => {
    expect(() => parseDateRange('2026-08-05:2026-08-01', 'window')).toThrow(
      '--window must be YYYY-MM-DD:YYYY-MM-DD'
    );
    expect(parseDateRange('2026-08-05:2026-08-10', 'window')).toEqual({
      startDate: '2026-08-05',
      endDate: '2026-08-10',
    });
  });

  test('aggregates cluster and owner metrics separately', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: ['https://myimageupscaler.com/formats/upscale-gif-images'],
          clicks: 10,
          impressions: 100,
          ctr: 0.1,
          position: 5,
        },
        {
          keys: ['https://myimageupscaler.com/format-scale/gif-upscale-16x/'],
          clicks: 4,
          impressions: 20,
          ctr: 0.2,
          position: 10,
        },
        {
          keys: ['https://myimageupscaler.com/other-page'],
          clicks: 100,
          impressions: 100,
          ctr: 1,
          position: 1,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-08-10' }
    );

    expect(measurement.matchedRows).toBe(2);
    expect(measurement.owner.clicks).toBe(10);
    expect(measurement.cluster.clicks).toBe(14);
    expect(measurement.cluster.impressions).toBe(120);
    expect(measurement.cluster.position).toBeCloseTo(5.8333, 3);
  });

  test('uses the PRD 04 three-path baseline instead of the six-path post set', () => {
    const rows = [
      {
        keys: [cluster.ownerPath],
        clicks: 513,
        impressions: 1000,
        ctr: 0.513,
        position: 7,
      },
      {
        keys: [cluster.memberPaths[0]],
        clicks: 2,
        impressions: 100,
        ctr: 0.02,
        position: 8,
      },
      {
        keys: [cluster.memberPaths[1]],
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        position: 9,
      },
      {
        keys: [cluster.memberPaths[2]],
        clicks: 1,
        impressions: 100,
        ctr: 0.01,
        position: 10,
      },
      {
        keys: [cluster.memberPaths[3]],
        clicks: 5,
        impressions: 100,
        ctr: 0.05,
        position: 7,
      },
      {
        keys: [cluster.measurementPaths![0]],
        clicks: 329,
        impressions: 1000,
        ctr: 0.329,
        position: 8,
      },
    ];
    const post = summarizeClusterRows(
      cluster,
      rows,
      { startDate: '2026-08-05', endDate: '2026-09-01' },
      'post-consolidation'
    );
    const baseline = summarizeClusterRows(
      cluster,
      rows,
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );

    expect(post.matchedRows).toBe(6);
    expect(post.cluster.clicks).toBe(855);
    expect(baseline.matchedRows).toBe(3);
    expect(baseline.cluster.clicks).toBe(847);
    expect(Object.keys(baseline.byPath)).toEqual([
      '/format-scale/gif-upscale-16x',
      '/formats/upscale-gif-images',
      '/scale/upscale-16x',
    ]);
    expect(baseline.byPath).not.toHaveProperty('/format-scale/gif-upscale-2x');
    expect(baseline.byPath).not.toHaveProperty('/format-scale/gif-upscale-4x');
    expect(baseline.byPath).not.toHaveProperty('/format-scale/gif-upscale-8x');
  });

  test('renders both windows and the owner decision gate', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 900,
          impressions: 1000,
          ctr: 0.9,
          position: 6,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-01' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 847,
          impressions: 1000,
          ctr: 0.847,
          position: 6,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(report).toContain('PASS — mechanism works');
    expect(report).toContain('Pre-split baseline');
    expect(report).toContain('/formats/upscale-gif-images');
  });

  test('fails closed when supplied baseline clicks are below the fixed floor', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 700,
          impressions: 1000,
          ctr: 0.7,
          position: 6,
        },
        {
          keys: [cluster.memberPaths[0]],
          clicks: 200,
          impressions: 300,
          ctr: 0.667,
          position: 8,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-01' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 600,
          impressions: 1000,
          ctr: 0.6,
          position: 6,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(measurement.owner.clicks).toBe(700);
    expect(measurement.cluster.clicks).toBe(900);
    expect(baseline.cluster.clicks).toBe(600);
    expect(report).toContain('INVALID BASELINE');
    expect(report).toContain('below the fixed 847-click floor');
    expect(report).not.toContain('PASS — mechanism works');
  });

  test('does not pass when owner clicks equal the baseline', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 847,
          impressions: 1000,
          ctr: 0.847,
          position: 6,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-01' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 847,
          impressions: 1000,
          ctr: 0.847,
          position: 6,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(measurement.cluster.clicks).toBe(baseline.cluster.clicks);
    expect(report).toContain('PARTIAL — owner is below');
    expect(report).not.toContain('PASS — mechanism works');
    expect(report).not.toContain('STOP-LOSS');
  });

  test('does not pass a 700-click owner when the cluster is below the 847-click baseline', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 700,
          impressions: 1000,
          ctr: 0.7,
          position: 6,
        },
        {
          keys: [cluster.memberPaths[0]],
          clicks: 100,
          impressions: 200,
          ctr: 0.5,
          position: 8,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-01' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 513,
          impressions: 1000,
          ctr: 0.513,
          position: 7,
        },
        {
          keys: [cluster.memberPaths[3]],
          clicks: 5,
          impressions: 100,
          ctr: 0.05,
          position: 7,
        },
        {
          keys: [cluster.measurementPaths![0]],
          clicks: 329,
          impressions: 500,
          ctr: 0.658,
          position: 8,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );

    const report = renderClusterReport(cluster, measurement, baseline);

    expect(measurement.owner.clicks).toBe(700);
    expect(measurement.cluster.clicks).toBe(800);
    expect(baseline.cluster.clicks).toBe(847);
    expect(report).toContain('STOP-LOSS');
    expect(report).not.toContain('PASS — mechanism works');
  });

  test('does not pass with a non-28-day baseline window', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 700,
          impressions: 1000,
          ctr: 0.7,
          position: 6,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-01' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 600,
          impressions: 1000,
          ctr: 0.6,
          position: 6,
        },
      ],
      { startDate: '2026-06-17', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(report).toContain(
      'NOT ELIGIBLE — pre-split baseline window is 27 days; the Phase 0 gate requires exactly 28 inclusive days'
    );
    expect(report).not.toContain('PASS — mechanism works');
  });

  test('does not pass with an overlong post-consolidation window', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 700,
          impressions: 1000,
          ctr: 0.7,
          position: 6,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-09-02' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 600,
          impressions: 1000,
          ctr: 0.6,
          position: 6,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(report).toContain(
      'NOT ELIGIBLE — measured post-consolidation window is 29 days; the Phase 0 gate requires exactly 28 inclusive days'
    );
    expect(report).not.toContain('PASS — mechanism works');
  });

  test('keeps a short post-consolidation window provisional', () => {
    const measurement = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 700,
          impressions: 1000,
          ctr: 0.7,
          position: 6,
        },
      ],
      { startDate: '2026-08-05', endDate: '2026-08-10' }
    );
    const baseline = summarizeClusterRows(
      cluster,
      [
        {
          keys: [cluster.ownerPath],
          clicks: 600,
          impressions: 1000,
          ctr: 0.6,
          position: 6,
        },
      ],
      { startDate: '2026-06-16', endDate: '2026-07-13' },
      'pre-split-baseline'
    );
    const report = renderClusterReport(cluster, measurement, baseline);

    expect(report).toContain(
      'PENDING — 6-day window is provisional; do not use this result as the Phase 0 gate'
    );
    expect(report).not.toContain('PASS — mechanism works');
  });
});
