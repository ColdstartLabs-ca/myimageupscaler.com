import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Sparkles, Wand2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { BlogSectionHeader } from '@client/components/blog/BlogSectionHeader';
import { getToolsForBlogPost } from '@/lib/seo/data-loader';
import type { IToolPage } from '@/lib/seo/pseo-types';
import { clientEnv } from '@shared/config/env';
import { CREDIT_COSTS } from '@shared/config/credits.config';

interface IBlogPostMeta {
  slug: string;
  title: string;
  category: string;
  readingTime: string;
}

interface IBlogPostFooterProps {
  blogSlug: string;
  relatedPosts: IBlogPostMeta[];
  quickVerdict: string;
}

export async function BlogPostFooter({
  blogSlug,
  relatedPosts,
  quickVerdict,
}: IBlogPostFooterProps): Promise<JSX.Element> {
  const tools = await getToolsForBlogPost(blogSlug);
  const t = await getTranslations('blog.cta');

  return (
    <>
      <section className="border-t border-border bg-surface">
        <div className="container mx-auto max-w-4xl space-y-10 px-4 py-16">
          {tools.length > 0 ? (
            <div className="space-y-6">
              <BlogSectionHeader
                icon={Wand2}
                title="Try It Yourself"
                subtitle="Use our AI tools to put these techniques into practice"
              />
              <div className="grid gap-4">
                {tools.map(tool => (
                  <ToolCard key={tool.slug} tool={tool} />
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-surface-light p-6 shadow-card">
            <BlogSectionHeader icon={CheckCircle2} title="Quick Verdict" iconVariant="success" />
            <p className="mt-4 text-base leading-relaxed text-text-secondary">
              <Link href="/?signup=1" className="font-semibold text-accent hover:underline">
                {clientEnv.APP_NAME}
              </Link>{' '}
              is the fastest path when you want to improve image quality without installing
              software. {quickVerdict}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/?signup=1"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-md shadow-accent/25 transition-all hover:bg-accent/90"
              >
                Try the Fix Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-main/40 px-5 py-3 text-sm font-semibold text-accent transition-all hover:border-accent/50 hover:bg-accent/10"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {relatedPosts.length > 0 ? (
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
                  <span className="mb-4 inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
                    {related.category}
                  </span>
                  <h3 className="mb-3 line-clamp-2 font-display font-semibold leading-snug text-primary transition-colors group-hover:text-accent">
                    {related.title}
                  </h3>
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
      ) : null}

      <section className="border-t border-border bg-surface py-16">
        <div className="container mx-auto max-w-4xl px-4">
          <div className="rounded-2xl border border-accent/20 bg-surface-light p-8 text-center shadow-card md:p-10">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
              <Sparkles className="h-6 w-6 text-accent" />
            </div>
            <h2 className="font-display text-2xl font-bold text-primary md:text-3xl">
              {t('title')}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-text-secondary">
              Upload your image and see the results in seconds. Start with{' '}
              {CREDIT_COSTS.DEFAULT_FREE_CREDITS} free credits.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/?signup=1"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/25 gradient-cta transition-all hover:opacity-90"
              >
                Try {clientEnv.APP_NAME} Free
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-main/40 px-6 py-3 text-sm font-semibold text-accent transition-all hover:border-accent/50 hover:bg-accent/10"
              >
                {t('secondaryButton')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ToolCard({ tool }: { tool: IToolPage }): JSX.Element {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-surface-light p-5 transition-all duration-300 hover:border-accent/50"
    >
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-accent/10">
        <Sparkles className="h-6 w-6 text-accent" />
      </div>
      <div className="min-w-0 flex-grow">
        <h3 className="font-semibold text-primary transition-colors group-hover:text-accent">
          {tool.title}
        </h3>
        <p className="line-clamp-1 text-sm text-text-secondary">{tool.intro}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1 text-accent transition-all group-hover:gap-2">
        <span className="hidden text-sm font-medium sm:inline">{tool.ctaText}</span>
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
