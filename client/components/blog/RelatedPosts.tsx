'use client';

import Link from 'next/link';
import { Clock, ArrowRight, Sparkles } from 'lucide-react';

// Local interface for blog post (matching what's actually returned from the service)
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

export function RelatedPosts({ currentPost, relatedPosts }: IRelatedPostsProps): JSX.Element | null {
  if (relatedPosts.length === 0) {
    return null;
  }

  return (
    <section className="py-20 bg-surface border-t border-border">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-accent" />
          </div>
          <h2 className="font-display text-2xl font-bold text-white">Continue Reading</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {relatedPosts.map(related => (
            <Link
              key={related.slug}
              href={`/blog/${related.slug}`}
              className="group bg-surface-light rounded-2xl p-6 border border-border hover:border-accent/50 hover:-translate-y-1 transition-all duration-300"
            >
              {/* Category Badge */}
              {related.category && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent mb-4">
                  {related.category}
                </span>
              )}

              {/* Title */}
              <h3 className="font-display text-xl font-semibold text-text-primary mb-3 line-clamp-2 group-hover:text-accent transition-colors leading-snug">
                {related.title}
              </h3>

              {/* Description */}
              <p className="text-base text-text-secondary leading-relaxed mb-4 line-clamp-3">
                {related.description}
              </p>

              {/* Meta Row */}
              <div className="flex items-center justify-between text-sm text-text-muted-aa">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {related.readingTime}
                </span>
                <span className="flex items-center gap-1 text-accent group-hover:gap-2 transition-all">
                  Read
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
