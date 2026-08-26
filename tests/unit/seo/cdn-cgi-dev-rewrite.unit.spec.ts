import { describe, expect, it } from 'vitest';
import { getCdnCgiDevRewrites } from '@lib/dev/cdn-cgi-rewrite';

describe('cdn-cgi dev rewrite', () => {
  it('should serve the untransformed asset in development', () => {
    expect(getCdnCgiDevRewrites('development')).toEqual([
      { source: '/cdn-cgi/image/:options/:path*', destination: '/:path*' },
    ]);
  });

  it('should stay out of the way outside development', () => {
    expect(getCdnCgiDevRewrites('production')).toEqual([]);
    expect(getCdnCgiDevRewrites('test')).toEqual([]);
    expect(getCdnCgiDevRewrites(undefined)).toEqual([]);
  });
});
