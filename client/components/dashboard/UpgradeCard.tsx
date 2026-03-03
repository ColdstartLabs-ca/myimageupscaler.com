import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import React from 'react';

export const UpgradeCard: React.FC = () => {
  const t = useTranslations('dashboard');

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
          opacity: [0.3, 0.6, 0.3]
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
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
          <h4 className="font-bold text-white text-sm">
            {t.has('sidebar.upgradeTitle') ? t('sidebar.upgradeTitle') : 'Upgrade to Pro'}
          </h4>
        </div>

        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          {t.has('sidebar.upgradeDesc')
            ? t('sidebar.upgradeDesc')
            : 'Get more credits, faster processing, and premium features.'}
        </p>

        <Link
          href="/dashboard/billing"
          className="flex items-center justify-center w-full py-2 px-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-accent/50 text-white text-xs font-semibold rounded-lg transition-all duration-300 group-hover:bg-accent/10"
        >
          {t.has('sidebar.upgradeCta') ? t('sidebar.upgradeCta') : 'View Plans'}
        </Link>
      </div>
    </motion.div>
  );
};
