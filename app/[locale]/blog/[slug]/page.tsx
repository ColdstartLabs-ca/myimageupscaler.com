import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { getTranslations } from 'next-intl/server';
import {
  getPublishedPostBySlug,
  getAllPublishedPosts,
  getAllPublishedSlugs,
} from '@server/services/blog.service';
import {
  Clock,
  ArrowLeft,
  Lightbulb,
  Info,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Calendar,
  ListChecks,
  ChevronRight,
} from 'lucide-react';
import { clientEnv } from '@shared/config/env';
import { ReadingProgress } from '@client/components/blog/ReadingProgress';
import { CompactToolsBanner } from '../_components/RelatedToolsSection';
import { BlogPostFooter } from '../_components/BlogPostFooter';
import { BlogCTA, parseCTAMarker } from '@client/components/blog/BlogCTA';
import { buildBlogAboutEntities, buildBlogBreadcrumbJsonLd } from '@lib/seo/blog-template-signals';

// Convert MDX Callout components to blockquotes with type markers
function preprocessContent(content: string): string {
  return (
    content
      .replace(
        /<Callout type="(\w+)">\n?([\s\S]*?)\n?<\/Callout>/g,
        (_, type, text) => `> [!${type.toUpperCase()}]\n> ${text.trim().replace(/\n/g, '\n> ')}`
      )
      // <iframe> is not in CommonMark's block-level HTML tag list, so remark-parse
      // treats it as inline HTML and escapes it. Wrapping in <div> (which IS in the
      // block list) ensures remark treats it as a raw HTML block that rehype-raw can render.
      .replace(/(<iframe\b[^>]*>[\s\S]*?<\/iframe>)/gi, '\n\n<div>$1</div>\n\n')
  );
}

/**
 * Extract FAQ Q&A pairs from markdown content.
 * Looks for H3 headings under any H2 section containing "faq", "fragen", "questions", or "häufig".
 * Returns null if no FAQ section is found.
 */
function extractFaqSchema(
  content: string
): { '@context': string; '@type': string; mainEntity: object[] } | null {
  const lines = content.split('\n');
  const faqs: { question: string; answer: string }[] = [];

  let inFaqSection = false;
  let currentQuestion: string | null = null;
  let currentAnswerLines: string[] = [];

  const FAQ_SECTION_RE = /^##\s+.*(faq|fragen|questions|häufig|frequently)/i;
  const H2_RE = /^##\s+/;
  const H3_RE = /^###\s+(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (H2_RE.test(line)) {
      // Flush pending Q&A when entering a new H2 section
      if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
        currentQuestion = null;
        currentAnswerLines = [];
      }
      inFaqSection = FAQ_SECTION_RE.test(line);
      continue;
    }

    if (!inFaqSection) continue;

    const h3Match = line.match(H3_RE);
    if (h3Match) {
      // Save previous Q&A
      if (currentQuestion && currentAnswerLines.length > 0) {
        faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
      }
      currentQuestion = h3Match[1].trim();
      currentAnswerLines = [];
      continue;
    }

    if (currentQuestion && line.trim()) {
      // Strip markdown links and formatting for clean answer text
      const cleanLine = line
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim();
      if (cleanLine) currentAnswerLines.push(cleanLine);
    }
  }

  // Flush last Q&A
  if (inFaqSection && currentQuestion && currentAnswerLines.length > 0) {
    faqs.push({ question: currentQuestion, answer: currentAnswerLines.join(' ').trim() });
  }

  if (faqs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

interface IPageProps {
  params: Promise<{ slug: string; locale: string }>;
}

function getPostPublishedDate(post: {
  published_at?: string;
  created_at?: string;
  date?: string;
}): string {
  return post.published_at || post.created_at || post.date || '1970-01-01T00:00:00.000Z';
}

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function extractTextFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractTextFromNode).join('');
  if (typeof node === 'object' && 'props' in node) {
    const props = node.props as { children?: ReactNode };
    return extractTextFromNode(props.children);
  }
  return '';
}

function extractTableOfContents(content: string): { id: string; title: string }[] {
  return content
    .split('\n')
    .map(line => line.match(/^##\s+(.+)/)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading))
    .filter(heading => !/^faq$/i.test(heading))
    .slice(0, 8)
    .map(title => ({ title, id: slugifyHeading(title) }));
}

function getQuickVerdict(post: { title: string; description: string; category: string }): string {
  const trimmedDescription = post.description.trim();
  const firstSentence = trimmedDescription.match(/^(.+?[.!?])(?:\s|$)/)?.[1];

  if (firstSentence && firstSentence.length >= 70) {
    return firstSentence;
  }

  return `${trimmedDescription} Use the guide below to choose the right workflow, then test the result with your own image.`;
}

export async function generateStaticParams() {
  const slugs = await getAllPublishedSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  // Blog posts are English-only content, so canonical should always point to English version
  const canonicalUrl = `${clientEnv.BASE_URL}/blog/${slug}`;
  const defaultOgImage = '/og-image.png';

  const postDate = getPostPublishedDate(post);

  return {
    title: post.seo_title || post.title,
    description: post.seo_description || post.description,
    authors: [{ name: post.author }],
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      url: canonicalUrl,
      publishedTime: postDate,
      authors: [post.author],
      images: post.image
        ? [{ url: post.image, width: 1200, height: 630, alt: post.title }]
        : [{ url: defaultOgImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.seo_title || post.title,
      description: post.seo_description || post.description,
      images: post.image ? [post.image] : [defaultOgImage],
    },
  };
}

export default async function BlogPostPage({ params }: IPageProps) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  const ctaT = await getTranslations('blog.cta');

  if (!post) {
    notFound();
  }

  const allPosts = await getAllPublishedPosts();
  const relatedPosts = allPosts
    .filter(p => p.slug !== slug && p.category === post.category)
    .slice(0, 3);

  const postDate = getPostPublishedDate(post);
  const tableOfContents = extractTableOfContents(post.content);
  const schemaOrg = { appName: clientEnv.APP_NAME, baseUrl: clientEnv.BASE_URL };
  const quickVerdict = getQuickVerdict(post);

  // FAQ JSON-LD (auto-extracted from content if FAQ section exists)
  const faqJsonLd = extractFaqSchema(post.content);

  // Article JSON-LD
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    keywords: post.tags,
    about: buildBlogAboutEntities(post.tags),
    author: {
      '@type': 'Organization',
      name: post.author,
      url: `${clientEnv.BASE_URL}/about`,
    },
    datePublished: postDate,
    dateModified: postDate,
    publisher: {
      '@type': 'Organization',
      name: clientEnv.APP_NAME,
      logo: `${clientEnv.BASE_URL}/logo/horizontal-logo-full.png`,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${clientEnv.BASE_URL}/blog/${slug}`,
    },
    image: post.image || `${clientEnv.BASE_URL}/og-image.png`,
  };
  const breadcrumbJsonLd = buildBlogBreadcrumbJsonLd(post, schemaOrg);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      <ReadingProgress />

      <article className="min-h-screen bg-main">
        {/* Header */}
        <header className="relative overflow-hidden pb-12 pt-8 md:pb-16 md:pt-12">
          {/* Subtle gradient background */}
          <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent pointer-events-none" />

          <div className="container relative z-10 mx-auto max-w-6xl px-4">
            {/* Back Link */}
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-text-secondary hover:text-accent transition-colors mb-8 group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Back to Blog
            </Link>

            <nav
              aria-label="Breadcrumb"
              className="mb-6 flex flex-wrap items-center gap-2 text-sm text-text-secondary"
            >
              <Link href="/blog" className="transition-colors hover:text-accent">
                Blog
              </Link>
              <ChevronRight className="h-4 w-4 text-text-muted" />
              <Link
                href={`/blog?q=${encodeURIComponent(post.category)}`}
                className="transition-colors hover:text-accent"
              >
                {post.category}
              </Link>
              <ChevronRight className="h-4 w-4 text-text-muted" />
              <span className="max-w-[42rem] truncate text-text-muted">{post.title}</span>
            </nav>

            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
              <div>
                {/* Category & Reading Time */}
                <div className="mb-6 flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent">
                    {post.category}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                    <Clock className="h-4 w-4" />
                    {post.readingTime}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-text-secondary">
                    <Calendar className="h-4 w-4" />
                    Updated{' '}
                    {new Date(postDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                {/* Title - H1 tag */}
                <h1 className="mb-6 font-display text-3xl font-bold leading-[1.15] tracking-tight text-white md:text-4xl lg:text-5xl">
                  {post.title}
                </h1>

                {/* Description */}
                <p className="mb-8 max-w-3xl text-xl leading-relaxed text-text-secondary">
                  {post.description}
                </p>

                {/* Above-the-fold CTAs */}
                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/?signup=1"
                    className="group inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white shadow-lg shadow-accent/25 gradient-cta transition-all hover:scale-[1.02] hover:opacity-90 active:scale-[0.98]"
                  >
                    <Sparkles className="h-5 w-5" />
                    {ctaT('try.button')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-6 py-3 text-sm font-semibold text-accent transition-all hover:border-accent/70 hover:bg-accent/15"
                  >
                    {ctaT('secondaryButton')}
                  </Link>
                </div>

                {/* Author & Date */}
                <p className="text-sm text-text-secondary">
                  By {clientEnv.APP_NAME} Team &middot;{' '}
                  {new Date(postDate).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              <aside className="rounded-2xl border border-border bg-surface/90 p-4 shadow-card backdrop-blur">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
                      <ListChecks className="h-4 w-4 text-accent" />
                    </div>
                    <h2 className="font-display text-lg font-bold text-primary">In This Guide</h2>
                  </div>
                  <span className="flex-shrink-0 rounded-full border border-border bg-main/40 px-3 py-1 text-xs font-semibold text-text-secondary">
                    {post.readingTime}
                  </span>
                </div>
                <div className="grid gap-1.5 text-sm text-text-secondary">
                  {tableOfContents.length > 0 ? (
                    tableOfContents.slice(0, 4).map((item, index) => (
                      <Link
                        key={item.id}
                        href={`#${item.id}`}
                        className="group flex items-start gap-2 rounded-lg px-2 py-2 transition-all hover:bg-accent/10"
                      >
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-semibold text-accent">
                          {index + 1}
                        </span>
                        <span className="leading-snug text-primary transition-colors group-hover:text-accent">
                          {item.title}
                        </span>
                      </Link>
                    ))
                  ) : (
                    <p className="rounded-lg bg-main/40 px-3 py-2 leading-relaxed">
                      Start with the practical steps, then compare the result with your original
                      image.
                    </p>
                  )}
                  <Link
                    href="/?signup=1"
                    className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent/90"
                  >
                    Try the Fix Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </aside>
            </div>

            {/* Tags */}
            {post.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2 border-t border-border pt-8">
                {post.tags.map(tag => (
                  <Link
                    key={tag}
                    href={`/blog?q=${encodeURIComponent(tag)}`}
                    className="inline-flex items-center rounded-lg border border-border/50 bg-surface-light px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-accent/30 hover:text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Cover Image */}
        {post.image && (
          <div className="container mx-auto mb-8 max-w-4xl px-4">
            <div className="relative aspect-[2/1] rounded-3xl overflow-hidden shadow-2xl">
              <Image
                src={post.image}
                alt={post.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 896px"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-main/20 via-transparent to-transparent" />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="pb-20">
          <div className="container mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <div id="article-content" className="min-w-0">
              <CompactToolsBanner blogSlug={slug} />
              <div className="prose prose-lg prose-invert max-w-none prose-headings:scroll-mt-28 prose-headings:font-display prose-headings:tracking-tight prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-p:leading-relaxed prose-li:leading-relaxed prose-a:text-accent prose-a:no-underline hover:prose-a:underline prose-strong:text-primary prose-img:rounded-2xl prose-img:shadow-lg">
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  components={{
                    img: ({ src, alt }) => (
                      <span className="block my-8">
                        <Image
                          src={src || ''}
                          alt={alt || ''}
                          width={800}
                          height={450}
                          className="rounded-lg w-full h-auto"
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
                        return <BlogCTA type={ctaResult.type} toolSlug={ctaResult.toolSlug} />;
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
                        const cleanedContent = childrenAsString.replace(
                          /\[!(TIP|INFO|WARNING)\]\s*/,
                          ''
                        );

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
                    h1: ({ children }) => (
                      <h2 className="text-3xl font-bold text-white mt-12 mb-4">{children}</h2>
                    ),
                    h2: ({ children }) => {
                      const headingText = extractTextFromNode(children);
                      return (
                        <h2 id={slugifyHeading(headingText)} className="group">
                          {children}
                        </h2>
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
                    iframe: ({ src, ...props }) => (
                      <span className="block my-8 rounded-xl overflow-hidden">
                        <iframe
                          src={src}
                          {...props}
                          className="w-full"
                          style={{ aspectRatio: '16 / 9' }}
                        />
                      </span>
                    ),
                  }}
                >
                  {preprocessContent(post.content)}
                </Markdown>
              </div>
            </div>
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10">
                    <ListChecks className="h-4 w-4 text-accent" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-primary">On this page</h2>
                </div>
                {tableOfContents.length > 0 ? (
                  <nav className="grid gap-2">
                    {tableOfContents.map(item => (
                      <Link
                        key={item.id}
                        href={`#${item.id}`}
                        className="rounded-lg px-3 py-2 text-sm leading-snug text-text-secondary transition-all hover:bg-accent/10 hover:text-accent"
                      >
                        {item.title}
                      </Link>
                    ))}
                  </nav>
                ) : (
                  <p className="text-sm leading-relaxed text-text-secondary">
                    Follow the guide from setup through the final image check.
                  </p>
                )}
                <div className="mt-5 border-t border-border pt-5">
                  <p className="text-sm font-semibold text-primary">Need the shortcut?</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-secondary">
                    Upload an image and compare the result before applying the guide manually.
                  </p>
                  <Link
                    href="/?signup=1"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
                  >
                    Try Free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </aside>
          </div>
        </div>

        <BlogPostFooter blogSlug={slug} relatedPosts={relatedPosts} quickVerdict={quickVerdict} />
      </article>
    </>
  );
}
