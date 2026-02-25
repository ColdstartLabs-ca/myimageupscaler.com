'use client';

import { useModalStore } from '@client/store/modalStore';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { motion } from 'framer-motion';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroActions(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('homepage');

  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);

  return (
    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
      <motion.button
        onClick={() => openAuthModal('register')}
        className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-300 gradient-cta shine-effect"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
        {hasTrialEnabled ? t('ctaFixImages') : t('ctaUpscaleFirst')}
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </motion.button>
      <motion.button
        onClick={() => openAuthModal('login')}
        className="inline-flex items-center gap-2 px-8 py-4 glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-300"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {t('ctaSignIn')}
      </motion.button>
    </div>
  );
}
