import Link from 'next/link';
import Image from 'next/image';
import { BadgeCheck } from 'lucide-react';
import { FaXTwitter } from 'react-icons/fa6';
import type { IBlogSpecialistProfile } from '@lib/blog/specialist-profile';
import {
  blogCategoryBadgeClass,
  blogHeroSecondaryButtonClass,
} from '@client/components/blog/blog-ui';

interface IBlogSpecialistSectionProps {
  specialist: IBlogSpecialistProfile;
}

export function BlogSpecialistSection({ specialist }: IBlogSpecialistSectionProps): JSX.Element {
  return (
    <section
      aria-labelledby="blog-specialist-heading"
      className="not-prose mt-12 border-t border-border/50 pt-10"
      data-testid="blog-specialist-section"
    >
      <div className="rounded-2xl border border-border bg-surface/70 p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Image
            src={specialist.image}
            alt={`${specialist.name}, ${specialist.role}`}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <p
                id="blog-specialist-heading"
                className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-primary"
              >
                <BadgeCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                <span>Reviewed by</span>
                <Link href={specialist.url} className="text-accent hover:underline">
                  {specialist.name}
                </Link>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">{specialist.role}</p>
            </div>

            <p className="text-sm leading-relaxed text-text-secondary">{specialist.bio}</p>

            <ul className="flex flex-wrap gap-2" aria-label="Areas of expertise">
              {specialist.expertise.map(topic => (
                <li key={topic} className={blogCategoryBadgeClass}>
                  {topic}
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-3">
              <Link href={specialist.url} className={blogHeroSecondaryButtonClass}>
                About Joao
              </Link>
              <a
                href={specialist.xUrl}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={`Follow ${specialist.name} on X (@${specialist.xHandle})`}
                className={blogHeroSecondaryButtonClass}
              >
                <FaXTwitter className="h-4 w-4" aria-hidden="true" />@{specialist.xHandle}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
