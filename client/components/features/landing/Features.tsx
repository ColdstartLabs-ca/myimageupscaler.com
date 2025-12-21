'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Type,
  Zap,
  ShieldCheck,
  Image as ImageIcon,
  Sparkles,
  Lock,
  Cpu,
  CheckCircle2,
} from 'lucide-react';
import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';

const features = [
  {
    icon: Type,
    name: 'Text Preservation',
    description:
      'Proprietary text detection ensures logos and fonts remain sharp and readable, unlike traditional GANs.',
    color: 'text-accent',
  },
  {
    icon: Zap,
    name: 'Lightning Fast',
    description: 'Optimized processing engine enhances images quickly with advanced AI technology.',
    color: 'text-accent',
  },
  {
    icon: ShieldCheck,
    name: 'Ethical AI',
    description:
      'Zero-retention policy for enterprise security. We restore faithfully without altering identity or content.',
    color: 'text-accent',
  },
  {
    icon: ImageIcon,
    name: 'Batch Processing',
    description:
      'Upload multiple images at once. Paid tiers support batch processing: Hobby (10 images), Pro (50 images), Business (500 images). Free tier limited to single image.',
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
    <section id="features" className="py-24 bg-surface relative overflow-hidden">
      {/* Decorative bg blob */}
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-1/3 h-full bg-main -z-10 skew-x-12 opacity-50"></div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <FadeIn className="mx-auto max-w-2xl lg:text-center mb-16">
          <h2 className="text-sm font-bold uppercase tracking-wide text-accent">Feature Rich</h2>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Everything you need for professional results
          </p>
          <p className="mt-6 text-lg text-muted-foreground leading-8">
            We combine state-of-the-art generative AI with traditional computer vision to deliver
            the best of both worlds: creativity and fidelity.
          </p>
        </FadeIn>

        <StaggerContainer
          staggerDelay={0.1}
          className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4"
        >
          {features.map(feature => (
            <StaggerItem key={feature.name}>
              <motion.div
                className="group relative p-8 glass-card rounded-2xl hover:shadow-xl transition-shadow duration-300 animated-border h-full"
                whileHover={{ y: -8, transition: { duration: 0.3 } }}
              >
                <motion.div
                  className={`inline-flex items-center justify-center h-12 w-12 rounded-xl mb-6 bg-surface/10 ${feature.color}`}
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <feature.icon size={24} strokeWidth={2.5} />
                </motion.div>

                <h3 className="text-lg font-bold text-white mb-3 group-hover:text-accent transition-colors">
                  {feature.name}
                </h3>

                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Secondary Feature Strip */}
        <FadeIn delay={0.3} className="mt-20 border-t border-white/10 pt-16">
          <StaggerContainer
            staggerDelay={0.1}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center"
          >
            {secondaryFeatures.map(feature => (
              <StaggerItem key={feature.name}>
                <motion.div
                  className="flex flex-col items-center gap-2"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <motion.div
                    className="p-2 bg-surface/10 rounded-full text-muted-foreground"
                    whileHover={{ backgroundColor: 'rgba(45, 129, 255, 0.2)', color: '#2D81FF' }}
                    transition={{ duration: 0.2 }}
                  >
                    <feature.icon size={16} />
                  </motion.div>
                  <span className="font-semibold text-white">{feature.name}</span>
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
