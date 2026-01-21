'use client';

import { AmbientBackground } from '@client/components/landing/AmbientBackground';
import { SupportModal } from '@client/components/modal/support/SupportModal';
import { FAQ } from '@client/components/ui/FAQ';
import { FadeIn, ScaleIn } from '@client/components/ui/MotionWrappers';
import { clientEnv } from '@shared/config/env';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  Book,
  CreditCard,
  LifeBuoy,
  MessageCircle,
  Search,
  Settings,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export function HelpClient() {
  const t = useTranslations('help');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  // FAQ Categories and Items
  const faqCategories = useMemo(
    () => [
      {
        id: 'getting-started',
        title: t('gettingStarted.title'),
        icon: <Book className="w-5 h-5" />,
        items: [
          {
            id: 'how-to-start',
            question: t('gettingStarted.faqs.howToStart.question', { appName: clientEnv.APP_NAME }),
            answer: (
              <div className="space-y-4">
                <p>{t('gettingStarted.faqs.howToStart.answerIntro')}</p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>
                    <Link href="/?signup=1" className="text-accent hover:underline">
                      {t('gettingStarted.faqs.howToStart.answerStep1')}
                    </Link>{' '}
                    {t('gettingStarted.faqs.howToStart.answerStep2')}
                  </li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep3')}</li>
                  <li>
                    {t('gettingStarted.faqs.howToStart.answerStep4')}{' '}
                    <Link href="/dashboard" className="text-accent hover:underline">
                      {t('gettingStarted.faqs.howToStart.answerStep5')}
                    </Link>
                  </li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep6')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep7')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep8')}</li>
                  <li>{t('gettingStarted.faqs.howToStart.answerStep9')}</li>
                </ol>
              </div>
            ),
            searchContent:
              t('gettingStarted.faqs.howToStart.question', { appName: clientEnv.APP_NAME }) +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerIntro') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep1') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep2') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep3') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep4') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep5') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep6') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep7') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep8') +
              ' ' +
              t('gettingStarted.faqs.howToStart.answerStep9'),
          },
          {
            id: 'supported-formats',
            question: t('gettingStarted.faqs.supportedFormats.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('gettingStarted.faqs.supportedFormats.answerIntro')}</p>
                <ul className="list-disc pl-6 space-y-2">
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
                <p>
                  {t('gettingStarted.faqs.supportedFormats.maxFileSize')}{' '}
                  <strong>{t('gettingStarted.faqs.supportedFormats.maxFileSizeValue')}</strong>
                </p>
              </div>
            ),
            searchContent:
              t('gettingStarted.faqs.supportedFormats.question') +
              ' ' +
              t('gettingStarted.faqs.supportedFormats.answerIntro') +
              ' ' +
              t('gettingStarted.faqs.supportedFormats.format1') +
              ' ' +
              t('gettingStarted.faqs.supportedFormats.format2') +
              ' ' +
              t('gettingStarted.faqs.supportedFormats.format3'),
          },
          {
            id: 'upscale-difference',
            question: t('gettingStarted.faqs.upscaleDifference.question'),
            answer: (
              <div className="space-y-4">
                <p>
                  <strong>{t('gettingStarted.faqs.upscaleDifference.2xIntro')}</strong>{' '}
                  {t('gettingStarted.faqs.upscaleDifference.2xDesc')}
                </p>
                <p>
                  <strong>{t('gettingStarted.faqs.upscaleDifference.4xIntro')}</strong>{' '}
                  {t('gettingStarted.faqs.upscaleDifference.4xDesc')}
                </p>
                <p className="text-sm italic">
                  {t('gettingStarted.faqs.upscaleDifference.example')}
                </p>
              </div>
            ),
            searchContent:
              t('gettingStarted.faqs.upscaleDifference.question') +
              ' ' +
              t('gettingStarted.faqs.upscaleDifference.2xIntro') +
              ' ' +
              t('gettingStarted.faqs.upscaleDifference.2xDesc') +
              ' ' +
              t('gettingStarted.faqs.upscaleDifference.4xIntro') +
              ' ' +
              t('gettingStarted.faqs.upscaleDifference.4xDesc'),
          },
          {
            id: 'processing-time',
            question: t('gettingStarted.faqs.processingTime.question'),
            answer: <p>{t('gettingStarted.faqs.processingTime.answer')}</p>,
            searchContent:
              t('gettingStarted.faqs.processingTime.question') +
              ' ' +
              t('gettingStarted.faqs.processingTime.answer'),
          },
        ],
      },
      {
        id: 'credits-billing',
        title: t('creditsBilling.title'),
        icon: <CreditCard className="w-5 h-5" />,
        items: [
          {
            id: 'what-are-credits',
            question: t('creditsBilling.faqs.whatAreCredits.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('creditsBilling.faqs.whatAreCredits.answerPart1')}</p>
                <p>
                  {t('creditsBilling.faqs.whatAreCredits.answerPart2')}{' '}
                  <strong>{t('creditsBilling.faqs.whatAreCredits.answerPart3')}</strong>{' '}
                  {t('creditsBilling.faqs.whatAreCredits.answerPart4')}
                </p>
              </div>
            ),
            searchContent:
              t('creditsBilling.faqs.whatAreCredits.question') +
              ' ' +
              t('creditsBilling.faqs.whatAreCredits.answerPart1') +
              ' ' +
              t('creditsBilling.faqs.whatAreCredits.answerPart2'),
          },
          {
            id: 'purchase-credits',
            question: t('creditsBilling.faqs.purchaseCredits.question'),
            answer: (
              <div className="space-y-4">
                <p>
                  {t('creditsBilling.faqs.purchaseCredits.answerIntro')}{' '}
                  <Link href="/pricing" className="text-accent hover:underline">
                    {t('creditsBilling.faqs.purchaseCredits.pricingPage')}
                  </Link>{' '}
                  {t('creditsBilling.faqs.purchaseCredits.answerMid')}
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>{t('creditsBilling.faqs.purchaseCredits.plan1')}</li>
                  <li>{t('creditsBilling.faqs.purchaseCredits.plan2')}</li>
                  <li>{t('creditsBilling.faqs.purchaseCredits.plan3')}</li>
                </ul>
              </div>
            ),
            searchContent:
              t('creditsBilling.faqs.purchaseCredits.question') +
              ' ' +
              t('creditsBilling.faqs.purchaseCredits.answerIntro') +
              ' ' +
              t('creditsBilling.faqs.purchaseCredits.plan1') +
              ' ' +
              t('creditsBilling.faqs.purchaseCredits.plan2') +
              ' ' +
              t('creditsBilling.faqs.purchaseCredits.plan3'),
          },
          {
            id: 'credits-expire',
            question: t('creditsBilling.faqs.creditsExpire.question'),
            answer: <p>{t('creditsBilling.faqs.creditsExpire.answer')}</p>,
            searchContent:
              t('creditsBilling.faqs.creditsExpire.question') +
              ' ' +
              t('creditsBilling.faqs.creditsExpire.answer'),
          },
          {
            id: 'cancel-subscription',
            question: t('creditsBilling.faqs.cancelSubscription.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('creditsBilling.faqs.cancelSubscription.answerIntro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    {t('creditsBilling.faqs.cancelSubscription.option1')}{' '}
                    <Link href="/dashboard/billing" className="text-accent hover:underline">
                      {t('creditsBilling.faqs.cancelSubscription.option2')}
                    </Link>
                  </li>
                  <li>{t('creditsBilling.faqs.cancelSubscription.option3')}</li>
                </ul>
                <p>{t('creditsBilling.faqs.cancelSubscription.answerOutro')}</p>
              </div>
            ),
            searchContent:
              t('creditsBilling.faqs.cancelSubscription.question') +
              ' ' +
              t('creditsBilling.faqs.cancelSubscription.answerIntro') +
              ' ' +
              t('creditsBilling.faqs.cancelSubscription.option1') +
              ' ' +
              t('creditsBilling.faqs.cancelSubscription.option3'),
          },
          {
            id: 'payment-methods',
            question: t('creditsBilling.faqs.paymentMethods.question'),
            answer: <p>{t('creditsBilling.faqs.paymentMethods.answer')}</p>,
            searchContent:
              t('creditsBilling.faqs.paymentMethods.question') +
              ' ' +
              t('creditsBilling.faqs.paymentMethods.answer'),
          },
          {
            id: 'refunds',
            question: t('creditsBilling.faqs.refunds.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('creditsBilling.faqs.refunds.answerIntro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>{t('creditsBilling.faqs.refunds.reason1')}</li>
                  <li>{t('creditsBilling.faqs.refunds.reason2')}</li>
                  <li>{t('creditsBilling.faqs.refunds.reason3')}</li>
                </ul>
                <p>
                  <button
                    onClick={() => setIsSupportModalOpen(true)}
                    className="text-accent hover:underline"
                  >
                    {t('cta.contactSupport')}
                  </button>{' '}
                  {t('creditsBilling.faqs.refunds.contactSupport')}
                </p>
              </div>
            ),
            searchContent:
              t('creditsBilling.faqs.refunds.question') +
              ' ' +
              t('creditsBilling.faqs.refunds.answerIntro') +
              ' ' +
              t('creditsBilling.faqs.refunds.reason1') +
              ' ' +
              t('creditsBilling.faqs.refunds.reason2') +
              ' ' +
              t('creditsBilling.faqs.refunds.reason3'),
          },
        ],
      },
      {
        id: 'technical',
        title: t('technicalSupport.title'),
        icon: <Settings className="w-5 h-5" />,
        items: [
          {
            id: 'failed-processing',
            question: t('technicalSupport.faqs.failedProcessing.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('technicalSupport.faqs.failedProcessing.answerIntro')}</p>
                <ol className="list-decimal pl-6 space-y-2">
                  <li>{t('technicalSupport.faqs.failedProcessing.step1')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step2')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step3')}</li>
                  <li>{t('technicalSupport.faqs.failedProcessing.step4')}</li>
                  <li>
                    {t('technicalSupport.faqs.failedProcessing.step5')}{' '}
                    <button
                      onClick={() => setIsSupportModalOpen(true)}
                      className="text-accent hover:underline"
                    >
                      {t('cta.supportTeam')}
                    </button>
                  </li>
                </ol>
              </div>
            ),
            searchContent:
              t('technicalSupport.faqs.failedProcessing.question') +
              ' ' +
              t('technicalSupport.faqs.failedProcessing.answerIntro') +
              ' ' +
              t('technicalSupport.faqs.failedProcessing.step1') +
              ' ' +
              t('technicalSupport.faqs.failedProcessing.step5'),
          },
          {
            id: 'quality-issues',
            question: t('technicalSupport.faqs.qualityIssues.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('technicalSupport.faqs.qualityIssues.answerIntro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>{t('technicalSupport.faqs.qualityIssues.result1')}</li>
                  <li>{t('technicalSupport.faqs.qualityIssues.result2')}</li>
                  <li>{t('technicalSupport.faqs.qualityIssues.result3')}</li>
                </ul>
                <p>{t('technicalSupport.faqs.qualityIssues.answerOutro')}</p>
              </div>
            ),
            searchContent:
              t('technicalSupport.faqs.qualityIssues.question') +
              ' ' +
              t('technicalSupport.faqs.qualityIssues.answerIntro') +
              ' ' +
              t('technicalSupport.faqs.qualityIssues.result1') +
              ' ' +
              t('technicalSupport.faqs.qualityIssues.result2') +
              ' ' +
              t('technicalSupport.faqs.qualityIssues.result3'),
          },
          {
            id: 'privacy',
            question: t('technicalSupport.faqs.dataPrivacy.question'),
            answer: (
              <div className="space-y-4">
                <p>{t('technicalSupport.faqs.dataPrivacy.answerIntro')}</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>{t('technicalSupport.faqs.dataPrivacy.point1')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point2')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point3')}</li>
                  <li>{t('technicalSupport.faqs.dataPrivacy.point4')}</li>
                </ul>
                <p>
                  {t('technicalSupport.faqs.dataPrivacy.answerOutro')}{' '}
                  <Link href="/privacy" className="text-accent hover:underline">
                    {t('technicalSupport.faqs.dataPrivacy.privacyPolicy')}
                  </Link>{' '}
                  {t('technicalSupport.faqs.dataPrivacy.answerEnd')}
                </p>
              </div>
            ),
            searchContent:
              t('technicalSupport.faqs.dataPrivacy.question') +
              ' ' +
              t('technicalSupport.faqs.dataPrivacy.point1') +
              ' ' +
              t('technicalSupport.faqs.dataPrivacy.point2'),
          },
          {
            id: 'commercial-use',
            question: t('technicalSupport.faqs.commercialUse.question'),
            answer: <p>{t('technicalSupport.faqs.commercialUse.answer')}</p>,
            searchContent:
              t('technicalSupport.faqs.commercialUse.question') +
              ' ' +
              t('technicalSupport.faqs.commercialUse.answer'),
          },
          {
            id: 'browser-support',
            question: t('technicalSupport.faqs.browserSupport.question'),
            answer: (
              <div className="space-y-4">
                <p>
                  {clientEnv.APP_NAME} {t('technicalSupport.faqs.browserSupport.answerIntro')}
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>{t('technicalSupport.faqs.browserSupport.browser1')}</li>
                  <li>{t('technicalSupport.faqs.browserSupport.browser2')}</li>
                  <li>{t('technicalSupport.faqs.browserSupport.browser3')}</li>
                </ul>
                <p>{t('technicalSupport.faqs.browserSupport.jsNote')}</p>
              </div>
            ),
            searchContent:
              t('technicalSupport.faqs.browserSupport.question') +
              ' ' +
              t('technicalSupport.faqs.browserSupport.answerIntro') +
              ' ' +
              t('technicalSupport.faqs.browserSupport.browser1') +
              ' ' +
              t('technicalSupport.faqs.browserSupport.browser2'),
          },
        ],
      },
    ],
    [t]
  );

  // Filtered FAQs based on search
  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) return faqCategories;

    const query = searchQuery.toLowerCase();
    return faqCategories
      .map(category => ({
        ...category,
        items: category.items.filter(
          item =>
            item.question.toLowerCase().includes(query) ||
            item.searchContent.toLowerCase().includes(query)
        ),
      }))
      .filter(category => category.items.length > 0);
  }, [searchQuery, faqCategories]);

  return (
    <main className="flex-1 bg-main selection:bg-accent/20 selection:text-white">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 hero-gradient-2025 z-20">
        <AmbientBackground variant="hero" />

        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 relative z-10">
          <FadeIn>
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-strong text-xs font-semibold text-accent mb-8"
            >
              <LifeBuoy size={14} className="text-secondary" />
              <span>{t('page.title')}</span>
            </motion.div>

            <h1 className="text-5xl font-black tracking-tight text-white mb-6 leading-tight">
              {t('page.title')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-xl text-text-secondary leading-relaxed font-light mb-8">
              {t('page.subtitle', { appName: clientEnv.APP_NAME })}
            </p>

            {/* Primary Contact Support CTA */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex justify-center mb-8"
            >
              <motion.button
                onClick={() => setIsSupportModalOpen(true)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-3 px-8 py-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-2xl transition-all duration-300 shadow-xl shadow-accent/40 hover:shadow-accent/60 gradient-cta shine-effect"
              >
                <MessageCircle size={22} />
                <span className="text-lg">{t('cta.contactSupport')}</span>
              </motion.button>
            </motion.div>
          </FadeIn>

          {/* Search Bar & Quick Links - Outside FadeIn for stability during typing */}
          <div className="max-w-2xl mx-auto space-y-8">
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                <Search
                  className={`w-5 h-5 transition-colors duration-300 ${searchQuery ? 'text-accent' : 'text-text-muted group-focus-within:text-accent'
                    }`}
                />
              </div>
              <input
                type="text"
                placeholder={t('page.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="block w-full pl-14 pr-12 py-5 bg-surface/50 border border-white/10 hover:border-white/20 focus:border-accent/50 rounded-2xl text-white placeholder:text-text-muted focus:ring-4 focus:ring-accent/10 transition-all duration-300 glass"
              />
              <AnimatePresence>
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-5 flex items-center text-text-muted hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-wrap justify-center gap-3">
              {faqCategories.map(category => (
                <button
                  key={category.id}
                  onClick={() => {
                    const element = document.getElementById(category.id);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass-strong hover:bg-white/5 text-text-secondary hover:text-white border border-white/10 hover:border-accent/30 transition-all duration-300 text-sm font-medium"
                >
                  <span className="text-accent/70">{category.icon}</span>
                  <span>{category.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="py-16 md:py-24 relative min-h-[600px]">
        <AmbientBackground variant="section" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative z-10">
          <AnimatePresence>
            {filteredFaqs.length > 0 ? (
              <motion.div
                key="results"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-16"
              >
                {filteredFaqs.map(category => (
                  <div key={category.id} id={category.id} className="scroll-mt-32">
                    <div className="mb-10 flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-accent/10 text-accent">
                        {category.icon}
                      </div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">
                        {category.title}
                      </h2>
                    </div>

                    <FAQ
                      items={category.items.map(item => ({
                        question: item.question,
                        answer: item.answer,
                      }))}
                      className="glass-strong rounded-2xl p-2 md:p-4 border border-white/5"
                    />
                  </div>
                ))}
              </motion.div>
            ) : (
              <motion.div
                key="no-results"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center py-20 glass-strong rounded-3xl border border-white/10"
              >
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Search size={32} className="text-text-muted" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">
                  {t('page.noResults', { query: searchQuery })}
                </h3>
                <p className="text-text-secondary mb-8">{t('page.noResultsDescription')}</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium border border-white/10"
                >
                  {t('page.clearSearch')}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Support CTA */}
      <section className="py-16 relative">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <ScaleIn>
            <div className="relative p-1 md:p-px rounded-3xl overflow-hidden group">
              {/* Gradient Border */}
              <div className="absolute inset-0 bg-gradient-to-r from-accent via-secondary to-accent opacity-20 group-hover:opacity-40 transition-opacity duration-500 animate-gradient-x"></div>

              <div className="relative bg-surface-dark/90 backdrop-blur-xl p-8 md:p-12 rounded-[22px] flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-3xl font-black text-white mb-4 tracking-tight">
                    {t('cta.title')}
                  </h2>
                  <p className="text-lg text-text-secondary font-light">{t('cta.description')}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 shrink-0">
                  <motion.button
                    onClick={() => setIsSupportModalOpen(true)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-white font-bold rounded-xl transition-all duration-300 gradient-cta shine-effect shadow-lg shadow-accent/20"
                  >
                    <MessageCircle size={20} />
                    {t('cta.emailSupport')}
                  </motion.button>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-300"
                  >
                    {t('cta.viewPricing')}
                    <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </div>
          </ScaleIn>
        </div>
      </section>

      {/* Footer Links */}
      <section className="pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="pt-10 border-t border-white/5 flex flex-wrap justify-center gap-8 md:gap-12">
            <Link
              href="/privacy"
              className="text-text-muted hover:text-accent transition-colors text-sm font-medium"
            >
              {t('relatedLinks.privacy')}
            </Link>
            <Link
              href="/terms"
              className="text-text-muted hover:text-accent transition-colors text-sm font-medium"
            >
              {t('relatedLinks.terms')}
            </Link>
            <Link
              href="/blog"
              className="text-text-muted hover:text-accent transition-colors text-sm font-medium"
            >
              {t('relatedLinks.blog')}
            </Link>
          </div>
        </div>
      </section>

      <SupportModal isOpen={isSupportModalOpen} onClose={() => setIsSupportModalOpen(false)} />
    </main>
  );
}
