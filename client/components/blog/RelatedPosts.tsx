'use client';

import { BookOpen } from 'lucide-react';
import { BlogSectionHeader } from '@client/components/blog/BlogSectionHeader';
import { BlogPostCard } from '@client/components/blog/BlogPostCard';

interface IBlogPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  category: string;
  readingTime: string;
  image?: string;
  date?: string;
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
            <BlogPostCard
              key={related.slug}
              slug={related.slug}
              title={related.title}
              category={related.category}
              readingTime={related.readingTime}
              description={related.description}
              image={related.image}
              date={related.date}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
