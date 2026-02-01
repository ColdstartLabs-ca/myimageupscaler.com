/**
 * Related Blog Posts Section Component
 * Displays blog posts related to the current tool page
 *
 * NOTE: Blog posts are English-only. For non-English locales, links point to
 * the English version of the blog post to avoid 404 errors.
 */

import { FadeIn, StaggerContainer, StaggerItem } from '@/app/(pseo)/_components/ui/MotionWrappers';
import { getPostsBySlugs, type IBlogPostMeta } from '@server/blog';
import { ArrowRight, BookOpen, Clock } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';

interface IRelatedBlogPostsSectionProps {
  blogPostSlugs: string[];
  title?: string;
  subtitle?: string;
  maxPosts?: number;
  locale?: string; // Current page locale
}

/* eslint-disable @typescript-eslint/no-unused-vars -- locale accepted for API consistency */
export function RelatedBlogPostsSection({
  blogPostSlugs,
  title = 'Learn More',
  subtitle = 'Explore our guides and tutorials for tips and best practices',
  maxPosts = 3,
  locale, // Blog posts are English-only, locale not used
}: IRelatedBlogPostsSectionProps): ReactElement {
  if (!blogPostSlugs || blogPostSlugs.length === 0) {
    return <></>;
  }

  const posts = getPostsBySlugs(blogPostSlugs).slice(0, maxPosts);

  if (posts.length === 0) {
    return <></>;
  }

  // Blog posts are English-only, always link to /blog/{slug} (no locale prefix)
  // This prevents 404 errors when viewing from localized tool pages
  const getBlogHref = (slug: string) => `/blog/${slug}`;

  return (
    <section className="py-20">
      <FadeIn>
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 text-accent text-sm font-medium mb-4">
            <BookOpen className="w-4 h-4" />
            Related Guides
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-primary mb-4">{title}</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
        </div>
      </FadeIn>

      <StaggerContainer staggerDelay={0.1} className="grid md:grid-cols-3 gap-6">
        {posts.map(post => (
          <StaggerItem key={post.slug}>
            <BlogPostCard post={post} getBlogHref={getBlogHref} />
          </StaggerItem>
        ))}
      </StaggerContainer>
    </section>
  );
}

function BlogPostCard({
  post,
  getBlogHref,
}: {
  post: IBlogPostMeta;
  getBlogHref: (slug: string) => string;
}): ReactElement {
  return (
    <Link
      href={getBlogHref(post.slug)}
      className="group block bg-surface rounded-2xl p-6 border border-border hover:border-accent/50 hover:-translate-y-1 transition-all duration-300"
    >
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent mb-4">
        {post.category}
      </span>
      <h3 className="font-semibold text-primary mb-3 line-clamp-2 group-hover:text-accent transition-colors leading-snug">
        {post.title}
      </h3>
      <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{post.description}</p>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" />
          {post.readingTime}
        </span>
        <span className="text-accent flex items-center gap-1 group-hover:gap-2 transition-all">
          Read
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </Link>
  );
}
