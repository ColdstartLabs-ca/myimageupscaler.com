import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Calendar, Clock, Sparkles } from 'lucide-react';
import { blogCategoryBadgeClass } from '@client/components/blog/blog-ui';

interface IBlogPostCardProps {
  slug: string;
  title: string;
  category: string;
  readingTime: string;
  description?: string;
  image?: string;
  date?: string;
}

export function BlogPostCard({
  slug,
  title,
  category,
  readingTime,
  description,
  image,
  date,
}: IBlogPostCardProps): JSX.Element {
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <Link href={`/blog/${slug}`} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-lg">
        <div className="relative aspect-[16/9] overflow-hidden">
          {image ? (
            <Image
              src={image}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 33vw"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-accent/10 via-secondary/5 to-surface-light">
              <Sparkles className="h-6 w-6 text-accent opacity-50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
        </div>

        <div className="flex flex-1 flex-col p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className={blogCategoryBadgeClass}>{category}</span>
            <span className="flex items-center gap-1 text-xs text-text-secondary">
              <Clock className="h-3 w-3" />
              {readingTime}
            </span>
          </div>

          <h3 className="mb-2 line-clamp-2 font-display text-lg font-semibold leading-snug text-primary transition-colors group-hover:text-accent">
            {title}
          </h3>

          {description ? (
            <p className="mb-4 line-clamp-2 flex-1 text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            {formattedDate ? (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Calendar className="h-3.5 w-3.5" />
                {formattedDate}
              </span>
            ) : (
              <span />
            )}
            <span className="flex items-center gap-1 text-sm font-medium text-accent transition-all group-hover:gap-2">
              Read
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
