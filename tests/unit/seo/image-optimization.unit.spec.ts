import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import imageLoader from '@client/utils/image-loader';

const ROOT = path.resolve(process.cwd());
const configSource = fs.readFileSync(path.join(ROOT, 'next.config.js'), 'utf8');

describe('custom image optimization', () => {
  it('should request a width-matched Unsplash image', () => {
    const result = imageLoader({
      src: 'https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=1200&h=630&fit=crop&q=80',
      width: 640,
    });
    const url = new URL(result);

    expect(url.hostname).toBe('images.unsplash.com');
    expect(url.searchParams.get('w')).toBe('640');
    expect(url.searchParams.get('h')).toBeNull();
    expect(url.searchParams.get('q')).toBe('75');
    expect(url.searchParams.get('fm')).toBe('avif');
  });

  it('should route same-origin images through /cdn-cgi/image', () => {
    const result = imageLoader({ src: '/before-after/hero/x.webp', width: 390, quality: 70 });

    expect(result).toBe('/cdn-cgi/image/width=390,quality=70,format=auto/before-after/hero/x.webp');
  });

  it('should route the acceptance blog hero through Supabase image transforms', () => {
    const result = imageLoader({
      src: 'https://xqysaylskffsfwunczbd.supabase.co/storage/v1/object/public/blog-images/2026/06/1782083222853-fixing-pixelated-photos-featured-v2.webp',
      width: 390,
    });
    const url = new URL(result);

    expect(url.hostname).toBe('xqysaylskffsfwunczbd.supabase.co');
    expect(url.pathname).toBe(
      '/storage/v1/render/image/public/blog-images/2026/06/1782083222853-fixing-pixelated-photos-featured-v2.webp'
    );
    expect(url.searchParams.get('width')).toBe('390');
    expect(url.searchParams.get('quality')).toBe('75');
    expect(url.searchParams.get('format')).toBe('avif');
  });

  it('should preserve the required DiceBear passthrough', () => {
    const result = imageLoader({
      src: 'https://api.dicebear.com/9.x/initials/svg?seed=MyImageUpscaler',
      width: 390,
    });

    expect(result).toBe('https://api.dicebear.com/9.x/initials/svg?seed=MyImageUpscaler');
  });

  it('should not set images.unoptimized', () => {
    expect(configSource).not.toMatch(/\bunoptimized\s*:/);
    expect(configSource).toContain("loader: 'custom'");
    expect(configSource).toContain("loaderFile: './client/utils/image-loader.ts'");
  });
});
