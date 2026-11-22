'use client';

import { SectionSignupCTA } from '@client/components/landing/SectionSignupCTA';
import { FadeIn, StaggerContainer, StaggerItem } from '@client/components/ui/MotionWrappers';
import { CREATOR_CARDS, type ICreatorCard } from '@client/components/features/landing/creatorsData';
import { motion } from 'framer-motion';
import Image from 'next/image';
import React from 'react';

function CreatorCard({
  title,
  description,
  image,
  alt,
  icon: Icon,
  iconClass,
}: ICreatorCard): JSX.Element {
  return (
    <motion.article className="group glass-card-2025 animated-border-violet h-full overflow-hidden !p-0 hover:border-accent/40">
      <div className="relative aspect-[21/9] overflow-hidden bg-main">
        <Image
          src={image}
          alt={alt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 90vw, 100vw"
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
        />
      </div>

      <div className="flex gap-4 px-6 py-6">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20 transition-transform duration-300 group-hover:scale-110 ${iconClass}`}
        >
          <Icon className="h-6 w-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h3 className="text-xl font-bold tracking-tight text-white transition-colors group-hover:text-accent">
            {title}
          </h3>
          <p className="mt-2 text-sm font-light leading-relaxed text-text-secondary">
            {description}
          </p>
        </div>
      </div>
    </motion.article>
  );
}

export function CreatorsSection(): JSX.Element {
  return (
    <section className="relative pb-16 pt-4 sm:pb-20 sm:pt-6">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <FadeIn className="mb-10 text-center sm:mb-12">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Perfect for every <span className="gradient-text-primary">creator</span>
          </h2>
        </FadeIn>

        <StaggerContainer staggerDelay={0.1} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {CREATOR_CARDS.map(card => (
            <StaggerItem key={card.title}>
              <CreatorCard {...card} />
            </StaggerItem>
          ))}
        </StaggerContainer>
        <SectionSignupCTA location="homepage_creators" className="mt-12" />
      </div>
    </section>
  );
}

// eslint-disable-next-line import/no-default-export
export default CreatorsSection;
