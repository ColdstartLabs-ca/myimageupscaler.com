'use client';

import { DeferredSection } from '@client/components/landing/DeferredSection';
import { CREATOR_CARDS } from '@client/components/features/landing/creatorsData';
import Image from 'next/image';
import { Suspense, lazy } from 'react';

const CreatorsSection = lazy(() => import('@client/components/features/landing/CreatorsSection'));

function CreatorsFallback(): JSX.Element {
  return (
    <section className="relative pb-16 pt-4 sm:pb-20 sm:pt-6">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="mb-10 text-center text-3xl font-black tracking-tight text-white sm:mb-12 sm:text-4xl">
          Perfect for every <span className="gradient-text-primary">creator</span>
        </h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {CREATOR_CARDS.map(({ title, description, image, alt, icon: Icon, iconClass }) => (
            <article
              key={title}
              className="glass-card-2025 animated-border-violet h-full overflow-hidden !p-0"
            >
              <div className="relative aspect-[21/9] overflow-hidden bg-main">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 90vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="flex gap-4 px-6 py-6">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-secondary/20 ${iconClass}`}
                >
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </div>
                <div className="min-w-0 pt-0.5">
                  <h3 className="text-xl font-bold tracking-tight text-white">{title}</h3>
                  <p className="mt-2 text-sm font-light leading-relaxed text-text-secondary">
                    {description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mx-auto mt-12 flex flex-col items-center gap-3" aria-hidden="true">
          <div className="h-14 w-64 rounded-xl bg-white/5" />
          <div className="h-5 w-56 rounded bg-white/5" />
        </div>
      </div>
    </section>
  );
}

export function DeferredCreatorsSection(): JSX.Element {
  return (
    <DeferredSection fallback={<CreatorsFallback />}>
      <Suspense fallback={<CreatorsFallback />}>
        <CreatorsSection />
      </Suspense>
    </DeferredSection>
  );
}
