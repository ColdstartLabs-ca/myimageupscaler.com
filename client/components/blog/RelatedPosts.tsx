'use client';

import Link from 'next/link';
import { Clock, ArrowRight, BookOpen } from 'lucide-react';
import { BlogSectionHeader } from '@client/components/blog/BlogSectionHeader';

interface IBlogPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  category: string;
  readingTime: string;
}

interface IRelatedPostsProps {
  currentPost: IBlogPost;
  relatedPosts: IBlogPost[];
}

export function RelatedPosts({
  currentPost: _currentPost,
  relatedPosts,
}: IRelatedPostsProps): JSX.Element | null {
  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <section className="border-t border-border bg-main py-16">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="mb-8">
          <BlogSectionHeader icon={BookOpen} title="Continue Reading" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {relatedPosts.map(related => (
            <Link
              key={related.slug}
              href={`/blog/${related.slug}`}
              className="group rounded-2xl border border-border bg-surface-light p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/50"
            >
              {related.category ? (
                <span className="mb-4 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                  {related.category}
                </span>
              ) : null}

              <h3 className="mb-3 line-clamp-2 font-display text-lg font-semibold leading-snug text-primary transition-colors group-hover:text-accent">
                {related.title}
              </h3>

              <p className="mb-4 line-clamp-3 text-base leading-relaxed text-text-secondary">
                {related.description}
              </p>

              <div className="flex items-center justify-between text-sm text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  {related.readingTime}
                </span>
                <span className="flex items-center gap-1 text-accent transition-all group-hover:gap-2">
                  Read
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
