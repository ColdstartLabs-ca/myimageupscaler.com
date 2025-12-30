'use client';

import { motion, useInView, Variants, HTMLMotionProps } from 'framer-motion';
import { ReactElement, ReactNode, useRef } from 'react';

// Smooth easing for professional feel
const smoothEasing: [number, number, number, number] = [0.25, 0.4, 0.25, 1];

// ============================================
// FadeIn - Scroll-triggered fade with direction
// ============================================
interface IFadeInProps {
  children: ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  className?: string;
  once?: boolean;
}

const fadeInVariants: Variants = {
  hidden: (direction: string) => ({
    opacity: 0,
    y: direction === 'up' ? 40 : direction === 'down' ? -40 : 0,
    x: direction === 'left' ? 40 : direction === 'right' ? -40 : 0,
  }),
  visible: {
    opacity: 1,
    y: 0,
    x: 0,
  },
};

export function FadeIn({
  children,
  delay = 0,
  direction = 'up',
  duration = 0.6,
  className = '',
  once = true,
}: IFadeInProps): ReactElement {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={direction}
      variants={fadeInVariants}
      transition={{
        duration,
        delay,
        ease: smoothEasing,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// StaggerContainer - Container for staggered children
// ============================================
interface IStaggerContainerProps {
  children: ReactNode;
  staggerDelay?: number;
  className?: string;
  once?: boolean;
}

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: (staggerDelay: number) => ({
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: 0.1,
    },
  }),
};

export function StaggerContainer({
  children,
  staggerDelay = 0.1,
  className = '',
  once = true,
}: IStaggerContainerProps): ReactElement {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      custom={staggerDelay}
      variants={containerVariants}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// StaggerItem - Individual items within stagger container
// ============================================
interface IStaggerItemProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: smoothEasing,
    },
  },
};

export function StaggerItem({
  children,
  className = '',
  ...props
}: IStaggerItemProps): ReactElement {
  return (
    <motion.div variants={itemVariants} className={className} {...props}>
      {children}
    </motion.div>
  );
}

// ============================================
// ScaleOnHover - Interactive hover/tap scaling
// ============================================
interface IScaleOnHoverProps {
  children: ReactNode;
  scale?: number;
  className?: string;
}

export function ScaleOnHover({
  children,
  scale = 1.02,
  className = '',
}: IScaleOnHoverProps): ReactElement {
  return (
    <motion.div
      whileHover={{ scale, y: -4 }}
      whileTap={{ scale: scale * 0.98 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// SlideIn - Slide in from a direction on scroll
// ============================================
interface ISlideInProps {
  children: ReactNode;
  direction?: 'left' | 'right';
  delay?: number;
  duration?: number;
  className?: string;
}

export function SlideIn({
  children,
  direction = 'left',
  delay = 0,
  duration = 0.7,
  className = '',
}: ISlideInProps): ReactElement {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: direction === 'left' ? -60 : 60 }}
      animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: direction === 'left' ? -60 : 60 }}
      transition={{
        duration,
        delay,
        ease: smoothEasing,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// AnimatedCounter - Animated number counter
// ============================================
interface IAnimatedCounterProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function AnimatedCounter({
  value,
  suffix = '',
  className = '',
}: IAnimatedCounterProps): ReactElement {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0 }}
      animate={isInView ? { opacity: 1 } : { opacity: 0 }}
      className={className}
    >
      <motion.span
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.5 }}
      >
        {value.toLocaleString()}
        {suffix}
      </motion.span>
    </motion.span>
  );
}

// ============================================
// FloatingElement - Subtle floating animation
// ============================================
interface IFloatingElementProps {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  duration?: number;
}

export function FloatingElement({
  children,
  className = '',
  amplitude = 10,
  duration = 3,
}: IFloatingElementProps): ReactElement {
  return (
    <motion.div
      animate={{
        y: [0, -amplitude, 0],
      }}
      transition={{
        duration,
        repeat: Infinity,
        repeatType: 'loop',
        ease: 'easeInOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ============================================
// GlowPulse - Pulsing glow effect for CTAs
// ============================================
interface IGlowPulseProps {
  children: ReactNode;
  className?: string;
}

export function GlowPulse({ children, className = '' }: IGlowPulseProps): ReactElement {
  return (
    <motion.div
      animate={{
        boxShadow: [
          '0 0 20px rgb(var(--color-accent) / 0.3)',
          '0 0 40px rgb(var(--color-accent) / 0.5)',
          '0 0 20px rgb(var(--color-accent) / 0.3)',
        ],
      }}
      transition={{
        duration: 2,
        repeat: Infinity,
        repeatType: 'loop',
        ease: 'easeInOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
