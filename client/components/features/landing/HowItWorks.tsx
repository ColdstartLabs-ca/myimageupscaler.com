'use client';

import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';
import { motion } from 'framer-motion';
import { ArrowRight, Download, UploadCloud, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React from 'react';

const HowItWorks: React.FC = () => {
  const t = useTranslations('howItWorks');

  const steps = [
    {
      id: 1,
      name: t('steps.upload.name'),
      description: t('steps.upload.description'),
      icon: UploadCloud,
    },
    {
      id: 2,
      name: t('steps.enhancement.name'),
      description: t('steps.enhancement.description'),
      icon: Wand2,
    },
    {
      id: 3,
      name: t('steps.download.name'),
      description: t('steps.download.description'),
      icon: Download,
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-32 bg-main border-y border-border relative overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn className="text-center mb-24">
          <h3 className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">
            {t('section.badge')}
          </h3>
          <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl mb-6">
            {t('section.title')}{' '}
            <span className="gradient-text-primary">{t('section.titleHighlight')}</span>
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto font-light">
            {t('section.description')}
          </p>
        </FadeIn>

        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <motion.div
            className="hidden md:block absolute top-[48px] left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-secondary/20 to-transparent -z-10"
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1.5, delay: 0.5, ease: 'easeInOut' }}
          />

          <StaggerContainer
            staggerDelay={0.2}
            className="grid grid-cols-1 gap-16 md:grid-cols-3 relative z-10"
          >
            {steps.map((step, index) => (
              <StaggerItem key={step.id}>
                <motion.div
                  className="group relative flex flex-col items-center text-center"
                  whileHover={{ y: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {/* Icon Bubble */}
                  <div className="relative mb-10">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] glass-strong shadow-2xl group-hover:border-secondary/30 transition-all duration-500 z-10 relative bg-white/5">
                      <step.icon
                        className="h-10 w-10 text-accent group-hover:scale-110 transition-transform duration-500"
                        strokeWidth={1.5}
                      />
                    </div>
                    {/* Number Badge */}
                    <motion.div
                      className="absolute -top-3 -right-3 h-10 w-10 bg-gradient-to-br from-accent to-secondary rounded-2xl text-white font-black flex items-center justify-center border-4 border-main shadow-xl z-20"
                      initial={{ scale: 0, rotate: -20 }}
                      whileInView={{ scale: 1, rotate: 0 }}
                      viewport={{ once: true }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 15,
                        delay: 0.3 + index * 0.15,
                      }}
                    >
                      {step.id}
                    </motion.div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-4 tracking-tight">{step.name}</h3>
                  <p className="text-text-secondary leading-relaxed px-6 font-light">
                    {step.description}
                  </p>

                  {/* Mobile Arrow */}
                  {index < steps.length - 1 && (
                    <div className="md:hidden mt-12 opacity-30">
                      <ArrowRight className="text-white rotate-90" size={32} />
                    </div>
                  )}
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default HowItWorks;
