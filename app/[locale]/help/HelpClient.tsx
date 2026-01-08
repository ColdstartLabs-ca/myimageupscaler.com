'use client';

import Link from 'next/link';
import { clientEnv } from '@shared/config/env';
import { useTranslations } from 'next-intl';

export function HelpClient() {
  const t = useTranslations('help');

  return (
    <main className="flex-1">
      <div className="container mx-auto py-16 px-6 max-w-4xl">
        <h1 className="text-4xl font-bold mb-4">{t('page.title')}</h1>
        <p className="text-lg text-muted-foreground mb-12">
          {t('page.subtitle', { appName: clientEnv.APP_NAME })}
        </p>

        {/* Quick Links */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <a
            href="#getting-started"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">{t('quickLinks.gettingStarted')}</h3>
            <p className="text-sm text-muted-foreground">{t('quickLinks.gettingStartedDesc')}</p>
          </a>
          <a
            href="#credits-billing"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">{t('quickLinks.creditsBilling')}</h3>
            <p className="text-sm text-muted-foreground">{t('quickLinks.creditsBillingDesc')}</p>
          </a>
          <a
            href="#technical"
            className="block p-6 bg-surface-light hover:bg-surface-light rounded-xl transition-colors"
          >
            <h3 className="text-lg font-semibold mb-2">{t('quickLinks.technicalSupport')}</h3>
            <p className="text-sm text-muted-foreground">{t('quickLinks.technicalSupportDesc')}</p>
          </a>
        </div>

        {/* Getting Started */}
        <section id="getting-started" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">{t('gettingStarted.title')}</h2>

          <div className="space-y-4">
            {/* FAQ 1 - How to Start */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('gettingStarted.faqs.howToStart.question', { appName: clientEnv.APP_NAME })}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('gettingStarted.faqs.howToStart.answerIntro')}
                </p>
                <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <Link href="/dashboard" className="text-accent hover:underline">
                      {t('gettingStarted.faqs.howToStart.answerStep1')}
                    </Link>{' '}
                    {t('gettingStarted.faqs.howToStart.answerStep2')}
                  </li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep3')}</li>
                  <li>
                    {t('gettingStarted.faqs.howToStart.answerStep4')}{' '}
                    <Link href="/?signup=1" className="text-accent hover:underline">
                      {t('gettingStarted.faqs.howToStart.answerStep5')}
                    </Link>
                  </li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep6')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep7')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep8')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep9')}</li>
                </ol>
              </div>
            </details>

            {/* FAQ 2 - Supported Formats */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('gettingStarted.faqs.supportedFormats.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('gettingStarted.faqs.supportedFormats.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>{t('gettingStarted.faqs.supportedFormats.format1')}</strong>
                  </li>
                  <li>
                    <strong>{t('gettingStarted.faqs.supportedFormats.format2')}</strong>
                  </li>
                  <li>
                    <strong>{t('gettingStarted.faqs.supportedFormats.format3')}</strong>
                  </li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  {t('gettingStarted.faqs.supportedFormats.maxFileSize')}{' '}
                  <strong>{t('gettingStarted.faqs.supportedFormats.maxFileSizeValue')}</strong>
                </p>
              </div>
            </details>

            {/* FAQ 3 - Upscale Difference */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('gettingStarted.faqs.upscaleDifference.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  <strong>{t('gettingStarted.faqs.upscaleDifference.2xIntro')}</strong>{' '}
                  {t('gettingStarted.faqs.upscaleDifference.2xDesc')}
                </p>
                <p className="text-muted-foreground mb-4">
                  <strong>{t('gettingStarted.faqs.upscaleDifference.4xIntro')}</strong>{' '}
                  {t('gettingStarted.faqs.upscaleDifference.4xDesc')}
                </p>
                <p className="text-muted-foreground">
                  {t('gettingStarted.faqs.upscaleDifference.example')}
                </p>
              </div>
            </details>

            {/* FAQ 4 - Processing Time */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('gettingStarted.faqs.processingTime.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  {t('gettingStarted.faqs.processingTime.answer')}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Credits & Billing */}
        <section id="credits-billing" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">{t('creditsBilling.title')}</h2>

          <div className="space-y-4">
            {/* What are Credits FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.whatAreCredits.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('creditsBilling.faqs.whatAreCredits.answerPart1')}
                </p>
                <p className="text-muted-foreground">
                  {t('creditsBilling.faqs.whatAreCredits.answerPart2')}{' '}
                  <strong>{t('creditsBilling.faqs.whatAreCredits.answerPart3')}</strong>{' '}
                  {t('creditsBilling.faqs.whatAreCredits.answerPart4')}
                </p>
              </div>
            </details>

            {/* Purchase Credits FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.purchaseCredits.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('creditsBilling.faqs.purchaseCredits.answerIntro')}{' '}
                  <Link href="/pricing" className="text-accent hover:underline">
                    {t('creditsBilling.faqs.purchaseCredits.pricingPage')}
                  </Link>{' '}
                  {t('creditsBilling.faqs.purchaseCredits.answerMid')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>{t('creditsBilling.faqs.purchaseCredits.plan1')}</strong>
                  </li>
                  <li>
                    <strong>{t('creditsBilling.faqs.purchaseCredits.plan2')}</strong>
                  </li>
                  <li>
                    <strong>{t('creditsBilling.faqs.purchaseCredits.plan3')}</strong>
                  </li>
                </ul>
              </div>
            </details>

            {/* Credits Expiry FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.creditsExpire.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  {t('creditsBilling.faqs.creditsExpire.answer')}
                </p>
              </div>
            </details>

            {/* Cancel Subscription FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.cancelSubscription.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('creditsBilling.faqs.cancelSubscription.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    {t('creditsBilling.faqs.cancelSubscription.option1')}{' '}
                    <Link href="/dashboard/billing" className="text-accent hover:underline">
                      {t('creditsBilling.faqs.cancelSubscription.option2')}
                    </Link>
                  </li>
                  <li>{t('creditsBilling.faqs.cancelSubscription.option3')}</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  {t('creditsBilling.faqs.cancelSubscription.answerOutro')}
                </p>
              </div>
            </details>

            {/* Payment Methods FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.paymentMethods.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  {t('creditsBilling.faqs.paymentMethods.answer')}
                </p>
              </div>
            </details>

            {/* Refund FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('creditsBilling.faqs.refunds.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('creditsBilling.faqs.refunds.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>{t('creditsBilling.faqs.refunds.reason1')}</li>
                  <li>{t('creditsBilling.faqs.refunds.reason2')}</li>
                  <li>{t('creditsBilling.faqs.refunds.reason3')}</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  Contact{' '}
                  <a
                    href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                    className="text-accent hover:underline"
                  >
                    {clientEnv.SUPPORT_EMAIL}
                  </a>{' '}
                  {t('creditsBilling.faqs.refunds.contactSupport')}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Technical Support */}
        <section id="technical" className="mb-12">
          <h2 className="text-3xl font-bold mb-6">{t('technicalSupport.title')}</h2>

          <div className="space-y-4">
            {/* Failed Processing FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('technicalSupport.faqs.failedProcessing.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('technicalSupport.faqs.failedProcessing.answerIntro')}
                </p>
                <ol className="list-decimal pl-6 space-y-2 text-muted-foreground">
                  <li>{t('technicalSupport.faqs.failedProcessing.step1')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step2')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step3')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step4')}</li>
                  <li>
                    {t('technicalSupport.faqs.failedProcessing.step5')}{' '}
                    <a
                      href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
                      className="text-accent hover:underline"
                    >
                      {clientEnv.SUPPORT_EMAIL}
                    </a>
                  </li>
                </ol>
              </div>
            </details>

            {/* Quality FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('technicalSupport.faqs.qualityIssues.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('technicalSupport.faqs.qualityIssues.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>
                    <strong>{t('technicalSupport.faqs.qualityIssues.result1')}</strong>
                  </li>
                  <li>
                    <strong>{t('technicalSupport.faqs.qualityIssues.result2')}</strong>
                  </li>
                  <li>
                    <strong>{t('technicalSupport.faqs.qualityIssues.result3')}</strong>
                  </li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  {t('technicalSupport.faqs.qualityIssues.answerOutro')}
                </p>
              </div>
            </details>

            {/* Privacy FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('technicalSupport.faqs.dataPrivacy.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {t('technicalSupport.faqs.dataPrivacy.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>{t('technicalSupport.faqs.dataPrivacy.point1')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point2')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point3')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point4')}</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  {t('technicalSupport.faqs.dataPrivacy.answerOutro')}{' '}
                  <Link href="/privacy" className="text-accent hover:underline">
                    {t('technicalSupport.faqs.dataPrivacy.privacyPolicy')}
                  </Link>{' '}
                  {t('technicalSupport.faqs.dataPrivacy.answerEnd')}
                </p>
              </div>
            </details>

            {/* Commercial Use FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('technicalSupport.faqs.commercialUse.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground">
                  {t('technicalSupport.faqs.commercialUse.answer')}
                </p>
              </div>
            </details>

            {/* Browsers FAQ */}
            <details className="group bg-surface-light rounded-xl">
              <summary className="flex items-center justify-between cursor-pointer p-5 text-lg font-medium list-none">
                {t('technicalSupport.faqs.browserSupport.question')}
                <svg
                  className="w-5 h-5 text-muted-foreground group-open:rotate-180 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-muted-foreground mb-4">
                  {clientEnv.APP_NAME} {t('technicalSupport.faqs.browserSupport.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                  <li>{t('technicalSupport.faqs.browserSupport.browser1')}</li>
                  <li>{t('technicalSupport.faqs.browserSupport.browser2')}</li>
                  <li>{t('technicalSupport.faqs.browserSupport.browser3')}</li>
                </ul>
                <p className="text-muted-foreground mt-4">
                  {t('technicalSupport.faqs.browserSupport.jsNote')}
                </p>
              </div>
            </details>
          </div>
        </section>

        {/* Contact Support */}
        <section className="mt-16 p-8 bg-gradient-to-br from-accent/10 to-secondary/10 rounded-xl border border-accent/20">
          <h2 className="text-2xl font-bold mb-4">{t('cta.title')}</h2>
          <p className="text-muted-foreground mb-6">{t('cta.description')}</p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href={`mailto:${clientEnv.SUPPORT_EMAIL}`}
              className="inline-flex items-center justify-center px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              {t('cta.emailSupport')}
            </a>
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center px-6 py-3 border border-border text-muted-foreground font-medium rounded-lg hover:bg-surface transition-colors"
            >
              {t('cta.viewPricing')}
            </Link>
          </div>
        </section>

        {/* Related Links */}
        <div className="mt-12 pt-8 border-t border-border flex flex-wrap gap-6">
          <Link href="/privacy" className="text-accent hover:underline">
            {t('relatedLinks.privacy')}
          </Link>
          <Link href="/terms" className="text-accent hover:underline">
            {t('relatedLinks.terms')}
          </Link>
          <Link href="/blog" className="text-accent hover:underline">
            {t('relatedLinks.blog')}
          </Link>
        </div>
      </div>
    </main>
  );
}
