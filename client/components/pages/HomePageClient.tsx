'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Features from '@client/components/features/landing/Features';
import HowItWorks from '@client/components/features/landing/HowItWorks';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { clientEnv } from '@shared/config/env';
import { HeroBeforeAfter } from '@client/components/landing/HeroBeforeAfter';
import { FadeIn } from '@client/components/ui/MotionWrappers';

// Animation variants for hero section
const heroContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.1,
    },
  },
};

const heroItemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.4, 0.25, 1] as const,
    },
  },
};

export function HomePageClient(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();
  const searchParams = useSearchParams();

  // Check if any plan has trial enabled
  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);

  // Check for login prompt from middleware redirect
  useEffect(() => {
    const loginRequired = searchParams.get('login');
    const nextUrl = searchParams.get('next');

    if (loginRequired === '1' && nextUrl) {
      // Store the intended destination
      prepareAuthRedirect('dashboard_access', {
        returnTo: nextUrl,
      });

      // Show a toast explaining why login is needed
      showToast({
        message: 'Please sign in to access the dashboard',
        type: 'info',
        duration: 5000,
      });

      // Open the auth modal after a short delay
      setTimeout(() => {
        openAuthModal('login');
      }, 500);

      // Clean up the URL
      const url = new URL(window.location.href);
      url.searchParams.delete('login');
      url.searchParams.delete('next');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, openAuthModal, showToast]);

  return (
    <main className="flex-grow bg-main font-sans selection:bg-accent/20 selection:text-white">
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 lg:pt-32 lg:pb-24 overflow-hidden hero-gradient">
        {/* Background Gradients - Enhanced with dynamic light effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-br from-accent/30 via-accent/20 to-accent-light/30 blur-[150px] -z-10 rounded-full pointer-events-none animate-pulse-slow"></div>
        <div className="absolute top-20 right-10 w-72 h-72 bg-accent/20 blur-[100px] -z-10 rounded-full pointer-events-none animate-float"></div>
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-accent-light/20 blur-[120px] -z-10 rounded-full pointer-events-none animate-float-delayed"></div>

        <motion.div
          className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8 relative"
          initial="hidden"
          animate="visible"
          variants={heroContainerVariants}
        >
          {/* Badge - with glassmorphism */}
          <motion.div
            variants={heroItemVariants}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-xs font-semibold text-accent mb-8 hover:shadow-xl hover:shadow-accent/20 transition-all duration-300 cursor-default group"
          >
            <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse"></span>
            <span className="group-hover:scale-105 transition-transform">v2.0 Now Available</span>
            <span className="w-px h-3 bg-accent/30 mx-1"></span>
            <span className="text-muted-foreground group-hover:text-white transition-colors">
              Enhanced Generation
            </span>
          </motion.div>

          <motion.h1
            variants={heroItemVariants}
            className="text-6xl font-black tracking-tight text-white sm:text-7xl md:text-8xl mb-6 max-w-5xl mx-auto leading-[1.05]"
          >
            Upscale Images <br className="hidden sm:block" />
            <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-light to-accent animate-gradient">
              For Professional Use
            </span>
          </motion.h1>

          <motion.p
            variants={heroItemVariants}
            className="mx-auto mt-8 max-w-2xl text-xl sm:text-2xl text-muted-foreground leading-relaxed font-light"
          >
            Enhance resolution, remove noise, and restore details in seconds.
            <br />
            The only upscaler designed to{' '}
            <span className="relative text-white font-bold after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-full after:h-1 after:bg-gradient-to-r after:from-accent after:to-accent after:rounded-full">
              preserve text and logos
            </span>{' '}
            perfectly.
          </motion.p>

          {/* Hero CTA Buttons */}
          <motion.div
            variants={heroItemVariants}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <motion.button
              onClick={() => openAuthModal('register')}
              className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-colors duration-300 cta-gradient-cyan"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
              {hasTrialEnabled ? 'Start Free Trial' : 'Sign Up Free'}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
            <motion.button
              onClick={() => openAuthModal('login')}
              className="inline-flex items-center gap-2 px-8 py-4 glass hover:bg-surface/10 text-white font-semibold rounded-xl transition-colors duration-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Sign In
            </motion.button>
          </motion.div>

          <motion.p variants={heroItemVariants} className="mt-4 text-sm text-muted-foreground">
            No credit card required &bull; 10 free credits included
          </motion.p>

          {/* Hero Before/After Slider */}
          <motion.div
            className="mt-12"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.7, ease: [0.25, 0.4, 0.25, 1] as const }}
          >
            <HeroBeforeAfter />
          </motion.div>
        </motion.div>
      </section>

      {/* Landing Page Sections */}
      <Features />
      <HowItWorks />

      {/* Pricing CTA Section */}
      <FadeIn>
        <section className="py-16 bg-surface">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to get started?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Choose from flexible subscription plans or one-time credit packs. Get monthly credits
              with automatic rollover, or pay as you go.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.a
                href="/pricing"
                className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-colors duration-300 cta-gradient-cyan"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                View Pricing Plans
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </motion.a>
              <motion.button
                onClick={() => openAuthModal('register')}
                className="inline-flex items-center gap-2 px-8 py-4 glass hover:bg-surface/10 text-white font-semibold rounded-xl transition-colors duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {hasTrialEnabled ? 'Start Free Trial' : 'Sign Up Free'}
              </motion.button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              10 free credits to get started &bull; No credit card required
            </p>
          </div>
        </section>
      </FadeIn>

      {/* Final CTA Section */}
      <FadeIn>
        <section className="relative py-24 overflow-hidden">
          {/* Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-accent/20 via-surface to-accent/10"></div>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.03%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22%2F%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E')] opacity-30"></div>

          <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Images?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Join over 10,000 businesses using {clientEnv.APP_NAME} to enhance their images. Start
              your free trial today.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <motion.button
                onClick={() => openAuthModal('register')}
                className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-colors duration-300 cta-gradient-cyan"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
                {hasTrialEnabled ? 'Start Free Trial' : 'Sign Up Free'}
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
              <motion.a
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 glass hover:bg-surface/10 text-white font-semibold rounded-xl transition-colors duration-300"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                View Pricing
              </motion.a>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required &bull; 10 free credits &bull; Cancel anytime
            </p>
          </div>
        </section>
      </FadeIn>
    </main>
  );
}
