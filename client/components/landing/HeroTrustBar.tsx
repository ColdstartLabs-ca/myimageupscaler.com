import type { ReactNode } from 'react';
import { Lock, Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

function TrustDivider(): JSX.Element {
  return <div aria-hidden="true" className="hidden h-10 w-px shrink-0 bg-white/10 sm:block" />;
}

function TrustStat({ value, label }: { value: ReactNode; label: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center text-center sm:min-w-[7rem]">
      <div className="text-base font-bold text-white sm:text-xl">{value}</div>
      <div className="mt-0.5 text-[11px] text-text-muted sm:mt-1 sm:text-sm">{label}</div>
    </div>
  );
}

function StarBlock({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center text-center sm:min-w-[7rem]">
      <div className="flex items-center justify-center gap-0.5" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} size={14} className="fill-warning text-warning sm:h-4 sm:w-4" />
        ))}
      </div>
      <div className="mt-0.5 text-[11px] text-text-muted sm:mt-1 sm:text-sm">{label}</div>
    </div>
  );
}

function SecurityBlock({ line1, line2 }: { line1: string; line2: string }): JSX.Element {
  return (
    <div className="flex min-w-0 items-center justify-center gap-2 sm:min-w-[8.5rem] sm:justify-start sm:gap-3">
      <Lock
        size={16}
        className="shrink-0 text-white/90 sm:h-[18px] sm:w-[18px]"
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <div className="text-center text-[11px] leading-snug text-text-muted sm:text-left sm:text-sm">
        <span className="block">{line1}</span>
        <span className="block">{line2}</span>
      </div>
    </div>
  );
}

export async function HeroTrustBar(): Promise<JSX.Element> {
  const t = await getTranslations('homepage.trustBar');

  return (
    <div className="mt-6 lg:mt-12" aria-label={t('ariaLabel')}>
      <p className="mb-4 text-center text-xs text-text-muted sm:mb-6 sm:text-sm">{t('heading')}</p>

      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-10 sm:gap-y-6 lg:gap-x-12">
        <div className="grid w-full grid-cols-4 gap-2 sm:contents">
          <StarBlock label={t('qualityLabel')} />
          <TrustDivider />
          <TrustStat value={t('usersValue')} label={t('usersLabel')} />
          <TrustDivider />
          <TrustStat value={t('imagesValue')} label={t('imagesLabel')} />
          <TrustDivider />
          <TrustStat value={t('uptimeValue')} label={t('uptimeLabel')} />
        </div>

        <TrustDivider />
        <SecurityBlock line1={t('securityLine1')} line2={t('securityLine2')} />
      </div>
    </div>
  );
}
