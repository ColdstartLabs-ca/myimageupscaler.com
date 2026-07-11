import Link from 'next/link';
import { ArrowRight, Calendar, Clock, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { BlogFeaturedImage } from '@client/components/blog/BlogFeaturedImage';
import { BlogGuideNav } from '@client/components/blog/BlogGuideNav';
import type { ITableOfContentsItem } from '@client/components/blog/BlogGuideSidebar';
import type { IBlogSpecialistProfile } from '@lib/blog/specialist-profile';
import {
  blogCategoryBadgeClass,
  blogPrimaryButtonClass,
  blogSecondaryButtonClass,
  splitBlogHeroTitle,
} from '@client/components/blog/blog-ui';

interface IBlogPostHeroSectionProps {
  title: string;
  description: string;
  category: string;
  readingTime: string;
  publishedDate: string;
  tryLabel: string;
  pricingLabel: string;
  image?: string;
  tableOfContents: ITableOfContentsItem[];
  specialist?: IBlogSpecialistProfile;
  intentNotice?: {
    text: string;
    href: string;
    linkLabel: string;
  };
}

export function BlogPostHeroSection({
  title,
  description,
  category,
  readingTime,
  publishedDate,
  tryLabel,
  pricingLabel,
  image,
  tableOfContents,
  specialist,
  intentNotice,
}: IBlogPostHeroSectionProps): JSX.Element {
  const { lead, highlight } = splitBlogHeroTitle(title);

  return (
    <section className="mb-10 lg:mb-14">
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10">
        <div className="contents lg:block">
          <header className="order-1 space-y-4">
            <span className={blogCategoryBadgeClass}>{category}</span>

            <h1 className="font-display text-[1.875rem] font-black leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.08]">
              {lead}
              {highlight ? (
                <span className="mt-1 block gradient-text-primary sm:mt-2">{highlight}</span>
              ) : null}
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-text-secondary lg:text-lg">
              {description}
            </p>

            {intentNotice ? (
              <aside className="max-w-xl rounded-xl border border-accent/30 bg-accent/10 p-3 text-sm leading-relaxed text-text-secondary">
                <span>{intentNotice.text}</span>{' '}
                <Link
                  href={intentNotice.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-accent hover:underline"
                >
                  {intentNotice.linkLabel}
                </Link>
              </aside>
            ) : null}
          </header>

          <div className="order-3 space-y-5 lg:mt-6">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {readingTime}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                {publishedDate}
              </span>
            </p>

            {specialist ? (
              <div className="flex max-w-xl items-center gap-3 rounded-xl border border-border bg-surface/70 p-3">
                <Image
                  src={specialist.image}
                  alt={`${specialist.name}, ${specialist.role}`}
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-full object-cover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    Reviewed by{' '}
                    <Link href={specialist.url} className="text-accent hover:underline">
                      {specialist.name}
                    </Link>
                  </p>
                  <p className="text-xs leading-relaxed text-text-secondary">{specialist.role}</p>
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/?signup=1" className={`group ${blogPrimaryButtonClass}`}>
                <Sparkles
                  className="h-5 w-5 transition-transform group-hover:rotate-12"
                  aria-hidden="true"
                />
                {tryLabel}
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
              <Link href="/pricing" className={blogSecondaryButtonClass}>
                {pricingLabel}
              </Link>
            </div>
          </div>
        </div>

        {image ? (
          <div className="order-2 lg:order-none">
            <BlogFeaturedImage src={image} alt={title} />
          </div>
        ) : null}
      </div>

      <BlogGuideNav items={tableOfContents} readingTime={readingTime} className="mt-6 lg:hidden" />
    </section>
  );
}
