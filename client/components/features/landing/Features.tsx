'use client';

import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';
import { motion } from 'framer-motion';
import { CheckCircle2, Cpu, Image as ImageIcon, Lock, Sparkles, Type, Zap } from 'lucide-react';
import React from 'react';

const features = [
  {
    icon: Type,
    name: 'Text & Logos Stay Sharp',
    description: 'Most AI image enhancers blur text. Ours keeps it crisp—even at 4x scale.',
    color: 'text-accent',
  },
  {
    icon: ImageIcon,
    name: 'Batch Upscale 500 Images',
    description: 'Bulk photo enhancer. Upload hundreds of images, get 4K results in minutes.',
    color: 'text-accent',
  },
  {
    icon: Zap,
    name: '6 Quality Tiers',
    description: 'From quick previews to print-ready 4K. Pick the quality that fits your budget.',
    color: 'text-accent',
  },
  {
    icon: Cpu,
    name: 'Smart AI Detection',
    description: 'Auto-detects faces, text, products—applies the right enhancement automatically.',
    color: 'text-accent',
  },
];

const secondaryFeatures = [
  { icon: Sparkles, name: 'Face Enhancement' },
  { icon: Lock, name: 'Secure Processing' },
  { icon: Cpu, name: 'Fast Processing' },
  { icon: CheckCircle2, name: 'High Availability' },
];

const Features: React.FC = () => {
  return (
    <section id="features" className="py-32 bg-main relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn className="mx-auto max-w-2xl lg:text-center mb-16">
          <h2 className="text-sm font-bold uppercase tracking-widest text-secondary mb-3">
            AI Photo Enhancer Features
          </h2>
          <p className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            Image quality enhancer that{' '}
            <span className="gradient-text-primary">preserves real detail</span>
          </p>
          <p className="mt-6 text-xl text-text-secondary leading-8 font-light">
            No blur, no artifacts. Our AI image upscaler reconstructs authentic detail—naturally
            sharp, not over-processed.
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

        {/* Secondary Feature Strip */}
        <FadeIn delay={0.3} className="mt-24 border-t border-border pt-16">
          <StaggerContainer
            staggerDelay={0.1}
            className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center"
          >
            {secondaryFeatures.map(feature => (
              <StaggerItem key={feature.name}>
                <motion.div
                  className="flex flex-col items-center gap-3 group"
                  whileHover={{ y: -4 }}
                >
                  <div className="p-3 bg-surface rounded-full text-text-muted transition-all duration-300 group-hover:bg-accent/20 group-hover:text-accent">
                    <feature.icon size={20} />
                  </div>
                  <span className="font-bold text-white group-hover:text-accent transition-colors tracking-wide">
                    {feature.name}
                  </span>
                </motion.div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </FadeIn>
      </div>
    </section>
  );
};

// eslint-disable-next-line import/no-default-export
export default Features;
