import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getPostBySlug, getAllPosts } from '@server/blog';
import {
  Clock,
  ArrowLeft,
  Lightbulb,
  Info,
  AlertTriangle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { ReadingProgress } from '@client/components/blog/ReadingProgress';
import { RelatedToolsSection } from '../_components/RelatedToolsSection';
import { BlogCTA, parseCTAMarker } from '@client/components/blog/BlogCTA';

// Convert MDX Callout components to blockquotes with type markers
function preprocessContent(content: string): string {
  return content.replace(
    /<Callout type="(\w+)">\n?([\s\S]*?)\n?<\/Callout>/g,
    (_, type, text) => `> [!${type.toUpperCase()}]\n> ${text.trim().replace(/\n/g, '\n> ')}`
  );
}

interface IPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return {
    title: post.title,
    description: post.description,
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
      images: post.image
        ? [{ url: post.image, width: 1200, height: 630, alt: post.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: post.image ? [post.image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: IPageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const allPosts = getAllPosts();
  const relatedPosts = allPosts
    .filter(p => p.slug !== slug && p.category === post.category)
    .slice(0, 3);

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    author: {
      '@type': 'Person',
      name: post.author,
    },
    datePublished: post.date,
    dateModified: post.date,
    publisher: {
      '@type': 'Organization',
      name: `${clientEnv.APP_NAME} AI`,
      logo: {
        '@type': 'ImageObject',
        url: `${clientEnv.BASE_URL}/og-image.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${clientEnv.BASE_URL}/blog/${slug}`,
    },
    image: post.image || `${clientEnv.BASE_URL}/og-image.png`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />

      <ReadingProgress />

      <article className="min-h-screen bg-main">
        {/* Header */}
        <header className="relative pt-8 pb-16 md:pt-12 md:pb-24 overflow-hidden">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent pointer-events-none" />

          <div className="container mx-auto px-4 max-w-4xl relative z-10">
            {/* Back Link */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-text-secondary hover:text-accent transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Blog
            </Link>

            {/* Category & Reading Time */}
            <div className="flex items-center gap-3 mb-6">
              <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-accent/10 text-accent border border-accent/20">
                {post.category}
              </span>
              <span className="text-sm text-text-secondary flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {post.readingTime}
              </span>
            </div>

            {/* Title */}
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-[1.15] tracking-tight">
              {post.title}
            </h1>

            {/* Description */}
            <p className="text-xl text-text-secondary mb-8 leading-relaxed max-w-3xl">
              {post.description}
            </p>

            {/* Author & Date */}
            <p className="text-sm text-text-secondary">
              {clientEnv.APP_NAME} Team &middot;{' '}
              {new Date(post.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>

            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-8 pt-8 border-t border-border">
                {post.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-surface-light text-text-secondary border border-border/50 hover:border-accent/30 hover:text-accent transition-colors"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Cover Image */}
        {post.image && (
          <div className="container mx-auto px-4 max-w-4xl mb-12">
            <div className="relative aspect-[2/1] rounded-3xl overflow-hidden shadow-2xl">
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
                priority
                unoptimized
              />
              <div className="absolute inset-0 bg-gradient-to-t from-main/20 via-transparent to-transparent" />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="pb-20">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="prose prose-lg prose-invert max-w-none prose-headings:font-display prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-primary prose-img:rounded-2xl prose-img:shadow-lg">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: ({ src, alt }) => (
                    <span className="block my-8">
                      <Image
                        src={src || ''}
                        alt={alt || ''}
                        width={800}
                        height={450}
                        className="rounded-lg w-full h-auto"
                        unoptimized={src?.startsWith('http')}
                      />
                    </span>
                  ),
                  a: ({ href, children }) => (
                    <Link
                      href={href || '#'}
                      className="text-accent hover:underline"
                      target={href?.startsWith('http') ? '_blank' : undefined}
                      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    >
                      {children}
                    </Link>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-surface-light px-1.5 py-0.5 rounded text-sm text-accent">
                        {children}
                      </code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="bg-surface-light p-4 rounded-lg overflow-x-auto border border-border">
                      {children}
                    </pre>
                  ),
                  blockquote: ({ children }) => {
                    // Safely extract text from React children for pattern matching
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const extractText = (node: any): string => {
                      if (typeof node === 'string') return node;
                      if (typeof node === 'number') return String(node);
                      if (!node) return '';
                      if (Array.isArray(node)) return node.map(extractText).join('');
                      if (node?.props?.children) return extractText(node.props.children);
                      return '';
                    };
                    const childrenAsString = extractText(children);

                    // Check for CTA markers first
                    const ctaResult = parseCTAMarker(childrenAsString);
                    if (ctaResult) {
                      return (
                        <BlogCTA
                          type={ctaResult.type}
                          toolSlug={ctaResult.toolSlug}
                        />
                      );
                    }

                    const tipMatch = childrenAsString.match(/\[!TIP\]\s*/);
                    const infoMatch = childrenAsString.match(/\[!INFO\]\s*/);
                    const warningMatch = childrenAsString.match(/\[!WARNING\]\s*/);

                    if (tipMatch || infoMatch || warningMatch) {
                      const type = tipMatch ? 'tip' : infoMatch ? 'info' : 'warning';
                      const Icon =
                        type === 'tip' ? Lightbulb : type === 'info' ? Info : AlertTriangle;
                      const colors = {
                        tip: 'border-emerald-500/50 bg-emerald-500/10',
                        info: 'border-accent/50 bg-accent/10',
                        warning: 'border-amber-500/50 bg-amber-500/10',
                      };
                      const iconColors = {
                        tip: 'text-emerald-400',
                        info: 'text-accent',
                        warning: 'text-amber-400',
                      };

                      // Strip the marker and render clean text
                      const cleanedContent = childrenAsString.replace(/\[!(TIP|INFO|WARNING)\]\s*/, '');

                      return (
                        <div
                          className={`not-prose my-6 p-4 rounded-lg border-l-4 ${colors[type]}`}
                        >
                          <div className="flex gap-3">
                            <Icon
                              className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconColors[type]}`}
                            />
                            <div className="text-muted-foreground">{cleanedContent}</div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <blockquote className="border-l-4 border-accent/50 pl-4 italic text-muted-foreground">
                        {children}
                      </blockquote>
                    );
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-6">
                      <table className="min-w-full border-collapse">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => (
                    <th className="border border-border bg-surface-light px-4 py-2 text-left font-semibold text-primary">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="border border-border px-4 py-2 text-muted-foreground">
                      {children}
                    </td>
                  ),
                }}
              >
                {preprocessContent(post.content)}
              </Markdown>
            </div>
          </div>
        </div>

        {/* Related Tools */}
        <RelatedToolsSection blogSlug={slug} />

        {/* Related Posts */}
        {relatedPosts.length > 0 && (
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
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-accent/10 text-accent mb-4">
                      {related.category}
                    </span>
                    <h3 className="font-display font-semibold text-white mb-3 line-clamp-2 group-hover:text-accent transition-colors leading-snug">
                      {related.title}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-text-secondary">
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {related.readingTime}
                      </span>
                      <span className="text-accent flex items-center gap-1 group-hover:gap-2 transition-all">
                        Read
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA */}
        <section className="relative py-20 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent via-tertiary to-accent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]" />
          <div className="container mx-auto px-4 max-w-4xl text-center relative z-10">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-white mb-4">
              Ready to Try AI Image Enhancement?
            </h2>
            <p className="text-white/80 mb-8 text-lg max-w-xl mx-auto">
              Upload your image and see the results in seconds. Start with 10 free credits.
            </p>
            <Link
              href="/?signup=1"
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-accent font-semibold rounded-xl hover:bg-white/90 hover:shadow-lg transition-all duration-300"
            >
              Try {clientEnv.APP_NAME} Free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </article>
    </>
  );
}
