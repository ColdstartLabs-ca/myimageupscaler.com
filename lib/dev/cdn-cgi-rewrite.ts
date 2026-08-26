/**
 * Cloudflare Image Resizing serves `/cdn-cgi/image/<options>/<path>` at the edge,
 * so the custom image loader's URLs have no handler in `next dev` and 404 there.
 * In development only, map them back to the untransformed asset.
 */
export interface ICdnCgiDevRewrite {
  source: string;
  destination: string;
}

export function getCdnCgiDevRewrites(nodeEnv: string | undefined): ICdnCgiDevRewrite[] {
  if (nodeEnv !== 'development') return [];

  return [{ source: '/cdn-cgi/image/:options/:path*', destination: '/:path*' }];
}
