import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { clientEnv } from '@shared/config/env';
import { CREDIT_COSTS } from '@shared/config/credits.config';
import {
  blogPrimaryButtonClass,
  blogSecondaryButtonClass,
  blogCardClass,
} from '@client/components/blog/blog-ui';

interface IBlogCtaCardProps {
  className?: string;
  description?: string;
}

export async function BlogCtaCard({
  className = '',
  description,
}: IBlogCtaCardProps): Promise<JSX.Element> {
  const t = await getTranslations('blog.cta');

  return (
    <div className={`${blogCardClass} border-accent/20 p-8 text-center md:p-10 ${className}`.trim()}>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
        <Sparkles className="h-6 w-6 text-accent" />
      </div>
      <h2 className="font-display text-2xl font-bold text-primary md:text-3xl">{t('title')}</h2>
      <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-text-secondary">
        {description ??
          `Upload your image and see the results in seconds. Start with ${CREDIT_COSTS.DEFAULT_FREE_CREDITS} free credits.`}
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/?signup=1" className={blogPrimaryButtonClass}>
          Try {clientEnv.APP_NAME} Free
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link href="/pricing" className={blogSecondaryButtonClass}>
          {t('secondaryButton')}
        </Link>
      </div>
    </div>
  );
}
