import type { Metadata } from 'next';
import Link from 'next/link';
import { JSX } from 'react';
import { getTranslations } from 'next-intl/server';
import { clientEnv } from '@shared/config/env';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });

  return {
    title: t('meta.title'),
    description: t('meta.description', { APP_NAME: clientEnv.APP_NAME }),
    alternates: {
      canonical: '/terms',
    },
  };
}

export default async function TermsOfServicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<JSX.Element> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'terms' });
  const lastUpdated = clientEnv.LAST_UPDATED_DATE;

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold text-primary mb-4">{t('title')}</h1>
        <p className="text-muted-foreground mb-8">{t('lastUpdated', { date: lastUpdated })}</p>

        <div className="prose prose-slate max-w-none">
          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('acceptance.title')}</h2>
            <p className="text-muted-foreground mb-4">
              {t('acceptance.paragraph1', { APP_NAME: clientEnv.APP_NAME })}
            </p>
            <p className="text-muted-foreground">{t('acceptance.paragraph2')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('description.title')}</h2>
            <p className="text-muted-foreground mb-4">
              {t('description.intro', { APP_NAME: clientEnv.APP_NAME })}
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('description.features.0')}</li>
              <li>{t('description.features.1')}</li>
              <li>{t('description.features.2')}</li>
              <li>{t('description.features.3')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('registration.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('registration.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('registration.requirements.0')}</li>
              <li>{t('registration.requirements.1')}</li>
              <li>{t('registration.requirements.2')}</li>
              <li>{t('registration.requirements.3')}</li>
            </ul>
            <p className="text-muted-foreground">{t('registration.responsibility')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('credits.title')}</h2>

            <h3 className="text-xl font-medium text-primary mb-3">{t('credits.system.title')}</h3>
            <p className="text-muted-foreground mb-4">{t('credits.system.description')}</p>

            <h3 className="text-xl font-medium text-primary mb-3">{t('credits.free.title')}</h3>
            <p className="text-muted-foreground mb-4">{t('credits.free.description')}</p>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('credits.subscription.title')}
            </h3>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('credits.subscription.features.0')}</li>
              <li>{t('credits.subscription.features.1')}</li>
              <li>{t('credits.subscription.features.2')}</li>
              <li>{t('credits.subscription.features.3')}</li>
            </ul>

            <h3 className="text-xl font-medium text-primary mb-3">{t('credits.refunds.title')}</h3>
            <p className="text-muted-foreground mb-4">{t('credits.refunds.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('credits.refunds.reasons.0')}</li>
              <li>{t('credits.refunds.reasons.1')}</li>
              <li>{t('credits.refunds.reasons.2')}</li>
            </ul>
            <p className="text-muted-foreground">
              {t('credits.refunds.contact')}{' '}
              <a href={`mailto:${clientEnv.SUPPORT_EMAIL}`} className="text-accent hover:underline">
                {clientEnv.SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('subscriptions.title')}</h2>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('subscriptions.terms.0')}</li>
              <li>{t('subscriptions.terms.1')}</li>
              <li>{t('subscriptions.terms.2')}</li>
              <li>{t('subscriptions.terms.3')}</li>
              <li>{t('subscriptions.terms.4')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('acceptableUse.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('acceptableUse.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('acceptableUse.prohibitions.0')}</li>
              <li>{t('acceptableUse.prohibitions.1')}</li>
              <li>{t('acceptableUse.prohibitions.2')}</li>
              <li>{t('acceptableUse.prohibitions.3')}</li>
              <li>{t('acceptableUse.prohibitions.4')}</li>
              <li>{t('acceptableUse.prohibitions.5')}</li>
              <li>{t('acceptableUse.prohibitions.6')}</li>
              <li>{t('acceptableUse.prohibitions.7')}</li>
              <li>{t('acceptableUse.prohibitions.8')}</li>
            </ul>
            <p className="text-muted-foreground">{t('acceptableUse.consequence')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              {t('intellectualProperty.title')}
            </h2>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('intellectualProperty.yourContent.title')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('intellectualProperty.yourContent.description')}
            </p>

            <h3 className="text-xl font-medium text-primary mb-3">
              {t('intellectualProperty.ourService.title')}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t('intellectualProperty.ourService.description', {
                APP_NAME: clientEnv.APP_NAME,
              })}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('availability.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('availability.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('availability.limitations.0')}</li>
              <li>{t('availability.limitations.1')}</li>
              <li>{t('availability.limitations.2')}</li>
              <li>{t('availability.limitations.3')}</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('limitation.title')}</h2>
            <p className="text-muted-foreground mb-4">
              {t('limitation.intro', {
                APP_NAME: clientEnv.APP_NAME.toUpperCase(),
              })}
            </p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('limitation.exclusions.0')}</li>
              <li>{t('limitation.exclusions.1')}</li>
              <li>{t('limitation.exclusions.2')}</li>
              <li>{t('limitation.exclusions.3')}</li>
            </ul>
            <p className="text-muted-foreground">{t('limitation.cap')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('disclaimer.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('disclaimer.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('disclaimer.exclusions.0')}</li>
              <li>{t('disclaimer.exclusions.1')}</li>
              <li>{t('disclaimer.exclusions.2')}</li>
              <li>{t('disclaimer.exclusions.3')}</li>
            </ul>
            <p className="text-muted-foreground">{t('disclaimer.caveat')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">
              {t('indemnification.title')}
            </h2>
            <p className="text-muted-foreground">
              {t('indemnification.description', {
                APP_NAME: clientEnv.APP_NAME,
              })}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('termination.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('termination.intro')}</p>
            <ul className="list-disc pl-6 mb-4 text-muted-foreground">
              <li>{t('termination.reasons.0')}</li>
              <li>{t('termination.reasons.1')}</li>
              <li>{t('termination.reasons.2')}</li>
              <li>{t('termination.reasons.3')}</li>
              <li>{t('termination.reasons.4')}</li>
            </ul>
            <p className="text-muted-foreground">{t('termination.consequence')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('governingLaw.title')}</h2>
            <p className="text-muted-foreground">{t('governingLaw.description')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('severability.title')}</h2>
            <p className="text-muted-foreground">{t('severability.description')}</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-4">{t('contact.title')}</h2>
            <p className="text-muted-foreground mb-4">{t('contact.intro')}</p>
            <ul className="list-none mb-4 text-muted-foreground">
              <li>
                {t('contact.emailLabel')}{' '}
                <a href={`mailto:${clientEnv.LEGAL_EMAIL}`} className="text-accent hover:underline">
                  {clientEnv.LEGAL_EMAIL}
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-border">
          <Link href="/privacy" className="text-accent hover:underline">
            {t('viewPrivacy')} &rarr;
          </Link>
        </div>
      </div>
    </main>
  );
}
