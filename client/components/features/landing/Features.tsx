'use client';

import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';
import { motion } from 'framer-motion';
import { CheckCircle2, Cpu, Image as ImageIcon, Lock, Sparkles, Type, Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

const Features: React.FC = () => {
  const t = useTranslations('features');

  const features = [
    {
      icon: Type,
      name: t('features.textLogos.name'),
      description: t('features.textLogos.description'),
      color: 'text-accent',
    },
    {
      icon: ImageIcon,
      name: t('features.batchUpscale.name'),
      description: t('features.batchUpscale.description'),
      color: 'text-accent',
    },
    {
      icon: Zap,
      name: t('features.qualityTiers.name'),
      description: t('features.qualityTiers.description'),
      color: 'text-accent',
    },
    {
      icon: Cpu,
      name: t('features.smartDetection.name'),
      description: t('features.smartDetection.description'),
      color: 'text-accent',
    },
  ];

  const secondaryFeatures = [
    { icon: Sparkles, name: t('secondaryFeatures.faceEnhancement') },
    { icon: Lock, name: t('secondaryFeatures.secureProcessing') },
    { icon: Cpu, name: t('secondaryFeatures.fastProcessing') },
    { icon: CheckCircle2, name: t('secondaryFeatures.highAvailability') },
  ];

  return (
    <section id="features" className="py-32 bg-main relative">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn className="mx-auto max-w-2xl lg:text-center mb-16">
          <h3 className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">
            {t('section.badge')}
          </h3>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {t('section.title')}{' '}
            <span className="gradient-text-primary">{t('section.titleHighlight')}</span>
          </h2>
          <p className="mt-6 text-xl text-text-secondary leading-8 font-light">
            {t('section.description')}
          </p>
        </FadeIn>

        <StaggerContainer
          staggerDelay={0.1}
          className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4"
        >
          {features.map(feature => (
            <StaggerItem key={feature.name}>
              <motion.div className="group relative h-full glass-card-2025 animated-border-violet flex flex-col">
                <div
                  className={`inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6 bg-gradient-to-br from-accent/20 to-secondary/20 text-accent group-hover:scale-110 transition-transform`}
                >
                  <feature.icon size={24} strokeWidth={2} />
                </div>

                <h3 className="text-xl font-bold text-white mb-3 group-hover:gradient-text-secondary transition-colors">
                  {feature.name}
                </h3>

                <p className="text-text-secondary text-sm leading-relaxed font-light">
                  {feature.description}
                </p>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Secondary Feature Strip - Improved Alignment */}
        <FadeIn delay={0.3} className="mt-24 border-t border-white/5 pt-16">
          <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-10 md:gap-x-20">
            {secondaryFeatures.map(feature => (
              <motion.div
                key={feature.name}
                className="flex flex-col items-center gap-4 group"
                whileHover={{ y: -4 }}
              >
                <div className="p-3 bg-white/5 rounded-full text-text-muted transition-all duration-300 group-hover:bg-accent/20 group-hover:text-accent group-hover:scale-110">
                  <feature.icon size={20} />
                </div>
                <span className="text-sm font-bold text-text-secondary group-hover:text-white transition-colors tracking-wide whitespace-nowrap">
                  {feature.name}
                </span>
              </motion.div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section >
  );
};

// eslint-disable-next-line import/no-default-export
export default Features;
