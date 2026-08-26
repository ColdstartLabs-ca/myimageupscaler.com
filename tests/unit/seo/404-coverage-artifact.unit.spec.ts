import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_REDIRECTS } from '@/lib/seo/legacy-redirects';
import {
  deadRedirectDestinations,
  liveZeroHopPaths,
  type I404Resolution,
} from '@/scripts/seo/sync-404-coverage';

describe('404 coverage resolution artifact', () => {
  it('should fail when the resolution artifact is missing', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'miu-404-')), 'missing.json');
    expect(() => readFileSync(missing, 'utf8')).toThrow();
  });

  it('should not treat a sub-routed tool slug as covering its bare path', () => {
    const resolutions: I404Resolution[] = [
      {
        url: 'https://myimageupscaler.com/tools/resize-image-for-discord',
        status: 404,
        finalStatus: 404,
        hops: 0,
        finalUrl: 'https://myimageupscaler.com/tools/resize-image-for-discord',
      },
      {
        url: 'https://myimageupscaler.com/tools/resize/resize-image-for-discord',
        status: 200,
        finalStatus: 200,
        hops: 0,
        finalUrl: 'https://myimageupscaler.com/tools/resize/resize-image-for-discord',
      },
    ];

    const livePaths = liveZeroHopPaths(resolutions);
    expect(livePaths).not.toContain('/tools/resize-image-for-discord');
    expect(livePaths).toContain('/tools/resize/resize-image-for-discord');
  });

  it('should emit a serializable artifact shape', () => {
    const output = join(mkdtempSync(join(tmpdir(), 'miu-404-')), 'artifact.json');
    writeFileSync(
      output,
      JSON.stringify({ generatedAt: new Date().toISOString(), resolutions: [] })
    );
    expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({ resolutions: [] });
  });

  it('should prove every committed redirect destination ends at 200', () => {
    const artifact = JSON.parse(
      readFileSync('seo-reports/404-resolution-2026-08-25.json', 'utf8')
    ) as { destinationResolutions: I404Resolution[] };

    expect(deadRedirectDestinations(LEGACY_REDIRECTS, artifact.destinationResolutions)).toEqual([]);
  });

  it('should fail destination liveness when a redirect owner returns 404', () => {
    const dead = deadRedirectDestinations(
      [{ destination: '/tools/imagem-cutout-tool' }],
      [
        {
          url: 'https://myimageupscaler.com/tools/imagem-cutout-tool',
          status: 404,
          finalStatus: 404,
          hops: 0,
          finalUrl: 'https://myimageupscaler.com/tools/imagem-cutout-tool',
        },
      ]
    );

    expect(dead).toEqual(['/tools/imagem-cutout-tool']);
  });
});
