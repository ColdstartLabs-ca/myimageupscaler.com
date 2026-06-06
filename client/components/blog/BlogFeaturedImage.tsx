import Image from 'next/image';

interface IBlogFeaturedImageProps {
  src: string;
  alt: string;
  className?: string;
}

/** True when the URL points at a photographic stock image, not a generated title-card OG graphic. */
export function isPhotographicFeaturedImage(imageUrl: string): boolean {
  try {
    const hostname = new URL(imageUrl).hostname;
    return hostname === 'images.unsplash.com' || hostname.endsWith('.unsplash.com');
  } catch {
    return false;
  }
}

export function BlogFeaturedImage({
  src,
  alt,
  className = '',
}: IBlogFeaturedImageProps): JSX.Element {
  const isPhoto = isPhotographicFeaturedImage(src);

  return (
    <figure className={className}>
      <div className="relative overflow-hidden rounded-2xl border border-white/20 bg-white/[0.04] shadow-2xl shadow-accent/10">
        <div className="relative aspect-[16/9] overflow-hidden lg:aspect-[4/3]">
          <Image
            src={src}
            alt={alt}
            fill
            className={isPhoto ? 'object-cover' : 'object-cover object-top'}
            sizes="(max-width: 1024px) 100vw, 540px"
            priority
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-main/40 via-transparent to-transparent" />
        </div>
      </div>
    </figure>
  );
}
