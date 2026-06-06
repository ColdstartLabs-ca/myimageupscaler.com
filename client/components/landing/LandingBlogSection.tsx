import { LandingSection } from '@client/components/landing/LandingSection';
import { getPostsBySlugs, type IBlogPostMeta } from '@server/blog';
import { ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { ReactElement } from 'react';

interface ILandingBlogSectionProps {
  blogPostSlugs: string[];
  title?: string;
  titleHighlight?: string;
  subtitle?: string;
  maxPosts?: number;
}

export function LandingBlogSection({
  blogPostSlugs,
  title = 'From the',
  titleHighlight = 'Blog',
  subtitle = 'Guides and tutorials to get the most from AI image tools',
  maxPosts = 4,
}: ILandingBlogSectionProps): ReactElement | null {
  if (!blogPostSlugs?.length) {
    return null;
  }

  const posts = getPostsBySlugs(blogPostSlugs).slice(0, maxPosts);

  if (posts.length === 0) {
    return null;
  }

  return (
    <LandingSection
      ambient
      fadeTop
      className="py-20"
      innerClassName="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-secondary">Guides</p>
        <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          {title} <span className="gradient-text-primary">{titleHighlight}</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-light text-text-secondary">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {posts.map(post => (
          <BlogPostCard key={post.slug} post={post} />
        ))}
      </div>
    </LandingSection>
  );
}

function BlogPostCard({ post }: { post: IBlogPostMeta }): ReactElement {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col rounded-xl border border-surface-light bg-surface/60 p-5 transition-colors duration-200 hover:border-accent/40 hover:bg-surface"
    >
      <span className="mb-3 inline-flex w-fit items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
        {post.category}
      </span>
      <h3 className="line-clamp-2 text-base font-bold text-white transition-colors group-hover:gradient-text-secondary">
        {post.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 flex-1 text-sm font-light leading-snug text-text-secondary">
        {post.description}
      </p>
      <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {post.readingTime}
        </span>
        <span className="flex items-center gap-1 text-accent transition-all group-hover:gap-2">
          Read
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
