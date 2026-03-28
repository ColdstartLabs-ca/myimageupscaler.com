import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';
import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';
import type { UserSegment } from '@/shared/types/stripe.types';

interface IUpgradeCardProps {
  onUpgrade: () => void;
  userSegment: UserSegment;
}

export const UpgradeCard: React.FC<IUpgradeCardProps> = ({ onUpgrade, userSegment }) => {
  const t = useTranslations('dashboard');
  const { pricingRegion } = useRegionTier();

  // Determine copy based on user segment
  const isCreditPurchaser = userSegment === 'credit_purchaser';
  const title = isCreditPurchaser
    ? t.has('sidebar.subscribeTitle')
      ? t('sidebar.subscribeTitle')
      : 'Subscribe & Save'
    : t.has('sidebar.upgradeTitle')
      ? t('sidebar.upgradeTitle')
      : 'Upgrade to Pro';

  const description = isCreditPurchaser
    ? t.has('sidebar.subscribeDesc')
      ? t('sidebar.subscribeDesc')
      : 'Get monthly credits, priority processing, and exclusive features.'
    : t.has('sidebar.upgradeDesc')
      ? t('sidebar.upgradeDesc')
      : 'Get more credits, faster processing, and premium features.';

  const ctaText = isCreditPurchaser
    ? t.has('sidebar.subscribeCta')
      ? t('sidebar.subscribeCta')
      : 'View Subscriptions'
    : t.has('sidebar.upgradeCta')
      ? t('sidebar.upgradeCta')
      : 'View Plans';

  const handleUpgradeClick = () => {
    analytics.track('upgrade_prompt_clicked', {
      trigger: 'upgrade_card',
      destination: isCreditPurchaser ? 'billing_subscription_tab' : 'upgrade_modal',
      userSegment,
      currentPlan: userSegment,
      pricingRegion: pricingRegion || 'standard',
    });
    onUpgrade();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
      className="mx-3 mt-6 mb-2 p-4 rounded-xl relative overflow-hidden group glass-strong border-accent/20 bg-gradient-to-br from-accent/10 to-transparent"
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-0 right-0 w-24 h-24 bg-accent/20 rounded-full blur-2xl -mr-10 -mt-10 group-hover:scale-150 duration-700"
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <motion.div
            animate={{ rotate: [-5, 5, -5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="p-1.5 rounded-lg bg-accent/20 text-accent flex items-center justify-center"
          >
            <Zap className="w-4 h-4" />
          </motion.div>
          <h4 className="font-bold text-white text-sm">{title}</h4>
        </div>

        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{description}</p>

        <button
          onClick={handleUpgradeClick}
          className="flex items-center justify-center w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/50 text-white text-xs font-semibold rounded-lg transition-all duration-300 group-hover:bg-accent/10"
        >
          {ctaText}
        </button>
      </div>
    </motion.div>
  );
};
