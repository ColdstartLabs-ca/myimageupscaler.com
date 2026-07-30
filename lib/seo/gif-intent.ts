export const GIF_FORMAT_SCALE_SLUGS = [
  'gif-upscale-2x',
  'gif-upscale-4x',
  'gif-upscale-8x',
  'gif-upscale-16x',
] as const;

export const GIF_FORMAT_OWNER_SLUG = 'upscale-gif-images';
export const GIF_FORMAT_OWNER_PATH = `/formats/${GIF_FORMAT_OWNER_SLUG}`;

const GIF_FORMAT_SCALE_SLUG_SET = new Set<string>(GIF_FORMAT_SCALE_SLUGS);

export function isGifFormatScaleSlug(slug: string): boolean {
  return GIF_FORMAT_SCALE_SLUG_SET.has(slug);
}
