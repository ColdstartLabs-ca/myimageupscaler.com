'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UploadCloud, Wand2, Download, ArrowRight } from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';

const steps = [
  {
    id: 1,
    name: 'Upload',
    description:
      'Drag & drop your images. We support high-res input up to 64MB on paid tiers (5MB on free tier) via API.',
    icon: UploadCloud,
  },
  {
    id: 2,
    name: 'Process',
    description: 'Our AI reconstructs details, corrects lighting, and sharpens edges instantly.',
    icon: Wand2,
  },
  {
    id: 3,
    name: 'Download',
    description: 'Get your 4K result. Export in PNG for lossless quality or efficient WebP.',
    icon: Download,
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="py-24 bg-main border-y border-white/10">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn className="text-center mb-20">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl mb-4">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your workflow in three simple steps. No complex settings, just results.
          </p>
        </FadeIn>

        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <motion.div
            className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent -z-10 -translate-y-full"
            initial={{ scaleX: 0, opacity: 0 }}
            whileInView={{ scaleX: 1, opacity: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
          />

          <StaggerContainer
            staggerDelay={0.2}
            className="grid grid-cols-1 gap-12 md:grid-cols-3 relative z-10"
          >
            {steps.map((step, index) => (
              <StaggerItem key={step.id}>
                <motion.div
                  className="group relative flex flex-col items-center text-center"
                  whileHover={{ y: -5 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {/* Icon Bubble */}
                  <div className="relative mb-8">
                    <motion.div
                      className="flex h-24 w-24 items-center justify-center rounded-3xl glass-card shadow-xl group-hover:border-accent/30 transition-colors duration-300 z-10 relative"
                      whileHover={{ scale: 1.1 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                    >
                      <motion.div
                        initial={{ rotate: 0 }}
                        whileHover={{ rotate: 10, scale: 1.1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 10 }}
                      >
                        <step.icon className="h-10 w-10 text-accent" strokeWidth={1.5} />
                      </motion.div>
                    </motion.div>
                    {/* Number Badge */}
                    <motion.div
                      className="absolute -top-3 -right-3 h-8 w-8 bg-accent rounded-full text-white font-bold flex items-center justify-center border-4 border-base shadow-sm z-20"
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
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

                  <h3 className="text-xl font-bold text-white mb-3">{step.name}</h3>
                  <p className="text-muted-foreground leading-relaxed px-4">{step.description}</p>

                  {/* Mobile Arrow */}
                  {index < steps.length - 1 && (
                    <motion.div
                      className="md:hidden mt-8"
                      initial={{ opacity: 0, y: -10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 }}
                    >
                      <ArrowRight className="text-muted-foreground rotate-90" />
                    </motion.div>
                  )}
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>

        {/* Call to Action Area */}
        <FadeIn delay={0.5} className="mt-20 text-center">
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass shadow-sm text-sm text-muted-foreground"
            animate={{
              boxShadow: [
                '0 0 0 0 rgba(45, 129, 255, 0)',
                '0 0 0 4px rgba(45, 129, 255, 0.1)',
                '0 0 0 0 rgba(45, 129, 255, 0)',
              ],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: 'loop',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Systems operational
          </motion.div>
        </FadeIn>
      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default HowItWorks;
