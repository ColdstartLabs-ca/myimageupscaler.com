import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';
import { getTranslations } from 'next-intl/server';
import { clientEnv } from '@shared/config/env';
import { getOpenGraphMetadata, getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });

  const title = t('meta.title');
  const description = t('meta.description', { APP_NAME: 'MyImageUpscaler' });
  const openGraph = getOpenGraphMetadata('/privacy', title, description, locale as Locale);
  const canonicalUrl = getCanonicalUrl('/privacy', locale as Locale);

  return {
    title,
    description,
    openGraph,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'privacy' });
  const lastUpdated = clientEnv.LAST_UPDATED_DATE;

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-primary mb-4">{t('title')}</h1>
        <p className="text-muted-foreground mb-8">{t('lastUpdated', { date: lastUpdated })}</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('introduction.title')}</h2>
            <p className="text-muted-foreground mb-4">
              {t('introduction.paragraph1', { APP_NAME: clientEnv.APP_NAME })}
            </p>
            <p className="text-muted-foreground">
              {t('introduction.paragraph2', { APP_NAME: clientEnv.APP_NAME })}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('collection.title')}</h2>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('collection.account.title')}
            </h3>
            <p className="text-muted-foreground mb-4">{t('collection.account.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('collection.account.items.0')}</li>
              <li>{t('collection.account.items.1')}</li>
              <li>{t('collection.account.items.2')}</li>
              <li>{t('collection.account.items.3')}</li>
            </ul>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('collection.images.title')}
            </h3>
            <p className="text-muted-foreground mb-4">{t('collection.images.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('collection.images.items.0')}</li>
              <li>{t('collection.images.items.1')}</li>
              <li>{t('collection.images.items.2')}</li>
            </ul>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('collection.payment.title')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('collection.payment.description')}{' '}
              <a
                href="https://stripe.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                {t('collection.payment.privacyPolicyLink')}
              </a>
              .
            </p>

            <h3 className="text-xl font-medium text-primary mb-3">{t('collection.usage.title')}</h3>
            <p className="text-muted-foreground mb-4">{t('collection.usage.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('collection.usage.items.0')}</li>
              <li>{t('collection.usage.items.1')}</li>
              <li>{t('collection.usage.items.2')}</li>
              <li>{t('collection.usage.items.3')}</li>
              <li>{t('collection.usage.items.4')}</li>
              <li>{t('collection.usage.items.5')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('usage.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('usage.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('usage.items.0')}</li>
              <li>{t('usage.items.1')}</li>
              <li>{t('usage.items.2')}</li>
              <li>{t('usage.items.3')}</li>
              <li>{t('usage.items.4')}</li>
              <li>{t('usage.items.5')}</li>
              <li>{t('usage.items.6')}</li>
              <li>{t('usage.items.7')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('sharing.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('sharing.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>
                <strong>{t('sharing.providers.0.label')}</strong>{' '}
                {t('sharing.providers.0.description')}
              </li>
              <li>
                <strong>{t('sharing.providers.1.label')}</strong>{' '}
                {t('sharing.providers.1.description')}
              </li>
              <li>
                <strong>{t('sharing.providers.2.label')}</strong>{' '}
                {t('sharing.providers.2.description')}
              </li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('security.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('security.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('security.measures.0')}</li>
              <li>{t('security.measures.1')}</li>
              <li>{t('security.measures.2')}</li>
              <li>{t('security.measures.3')}</li>
              <li>{t('security.measures.4')}</li>
            </ul>
            <p className="text-muted-foreground">{t('security.disclaimer')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('retention.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('retention.paragraph1')}</p>
            <p className="text-muted-foreground">{t('retention.paragraph2')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('rights.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('rights.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>
                <strong>{t('rights.rightsList.0.label')}</strong>{' '}
                {t('rights.rightsList.0.description')}
              </li>
              <li>
                <strong>{t('rights.rightsList.1.label')}</strong>{' '}
                {t('rights.rightsList.1.description')}
              </li>
              <li>
                <strong>{t('rights.rightsList.2.label')}</strong>{' '}
                {t('rights.rightsList.2.description')}
              </li>
              <li>
                <strong>{t('rights.rightsList.3.label')}</strong>{' '}
                {t('rights.rightsList.3.description')}
              </li>
              <li>
                <strong>{t('rights.rightsList.4.label')}</strong>{' '}
                {t('rights.rightsList.4.description')}
              </li>
            </ul>
            <p className="text-muted-foreground">
              {t('rights.contact')}{' '}
              <a href={`mailto:${clientEnv.PRIVACY_EMAIL}`} className="text-accent hover:underline">
                {clientEnv.PRIVACY_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('cookies.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('cookies.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('cookies.uses.0')}</li>
              <li>{t('cookies.uses.1')}</li>
              <li>{t('cookies.uses.2')}</li>
              <li>{t('cookies.uses.3')}</li>
            </ul>
            <p className="text-muted-foreground">{t('cookies.control')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('children.title')}</h2>
            <p className="text-muted-foreground">{t('children.description')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('international.title')}</h2>
            <p className="text-muted-foreground">{t('international.description')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('changes.title')}</h2>
            <p className="text-muted-foreground">{t('changes.description')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('contact.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('contact.intro')}</p>
            <ul className="list-none mb-4 text-muted-foreground">
              <li>
                {t('contact.emailLabel')}{' '}
                <a
                  href={`mailto:${clientEnv.PRIVACY_EMAIL}`}
                  className="text-accent hover:underline"
                >
                  {clientEnv.PRIVACY_EMAIL}
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <Link href="/terms" className="text-accent hover:underline">
            {t('viewTerms')} &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
