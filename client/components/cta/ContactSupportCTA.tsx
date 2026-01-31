'use client';

import { MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ScaleIn } from '@client/components/ui/MotionWrappers';
import { SupportModal } from '@client/components/modal/support/SupportModal';

interface IContactSupportCTAProps {
  showPricingLink?: boolean;
  variant?: 'default' | 'compact';
  theme?: 'dark' | 'light';
  // External control for FAQ inline buttons
  isOpen?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  // When controlled externally, modal is rendered separately (default: true)
  renderModal?: boolean;
}

export function ContactSupportCTA({
  showPricingLink = true,
  variant = 'default',
  theme = 'dark',
  isOpen: externalIsOpen,
  onOpen,
  onClose,
  renderModal = true,
}: IContactSupportCTAProps): JSX.Element {
  const t = useTranslations('help');
  const [internalIsOpen, setInternalIsOpen] = useState(false);

  const isControlled = externalIsOpen !== undefined;
  const isOpen = isControlled ? externalIsOpen : internalIsOpen;

  const handleOpen = () => {
    if (onOpen) {
      onOpen();
    } else {
      setInternalIsOpen(true);
    }
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      setInternalIsOpen(false);
    }
  };

  // Theme-specific classes
  const isDark = theme === 'dark';
  const sectionBg = isDark ? '' : 'bg-base';
  const cardBg = isDark ? 'bg-surface-dark/90 backdrop-blur-xl' : 'bg-surface border border-border';
  const titleClass = isDark ? 'text-white' : 'text-foreground';
  const descClass = isDark ? 'text-text-secondary' : 'text-muted-foreground';
  const pricingLinkClass = isDark
    ? 'glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-300'
    : 'px-8 py-4 bg-surface border border-border text-foreground font-semibold rounded-xl hover:bg-accent/10 transition-all duration-300';
  const gradientBorder = isDark
    ? 'absolute inset-0 bg-gradient-to-r from-accent via-secondary to-accent opacity-20 group-hover:opacity-40 transition-opacity duration-500 animate-gradient-x'
    : 'absolute inset-0 bg-gradient-to-r from-accent/20 via-secondary/20 to-accent/20 opacity-40 group-hover:opacity-60 transition-opacity duration-500';

  if (variant === 'compact') {
    return (
      <>
        <div className="flex justify-center">
          <button
            onClick={handleOpen}
            className="inline-flex items-center gap-3 px-8 py-4 bg-accent hover:bg-accent-hover text-white font-bold rounded-2xl transition-all duration-300 shadow-xl shadow-accent/40 hover:shadow-accent/60 gradient-cta shine-effect"
          >
            <MessageCircle size={22} />
            <span className="text-lg">{t('cta.contactSupport')}</span>
          </button>
        </div>
        {renderModal && <SupportModal isOpen={isOpen} onClose={handleClose} />}
      </>
    );
  }

  return (
    <>
      <section className={`py-16 relative ${sectionBg}`}>
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <ScaleIn>
            <div className="relative p-1 md:p-px rounded-3xl overflow-hidden group">
              <div className={gradientBorder}></div>

              <div
                className={`relative ${cardBg} p-8 md:p-12 rounded-[22px] flex flex-col md:flex-row items-center gap-10`}
              >
                <div className="flex-1 text-center md:text-left">
                  <h2 className={`text-3xl font-black mb-4 tracking-tight ${titleClass}`}>
                    {t('cta.title')}
                  </h2>
                  <p className={`text-lg font-light ${descClass}`}>{t('cta.description')}</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 shrink-0">
                  <button
                    onClick={handleOpen}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-accent text-white font-bold rounded-xl transition-all duration-300 gradient-cta shine-effect shadow-lg shadow-accent/20"
                  >
                    <MessageCircle size={20} />
                    {t('cta.emailSupport')}
                  </button>
                  {showPricingLink && (
                    <Link href="/pricing" className={pricingLinkClass}>
                      {t('cta.viewPricing')}
                      <ArrowRight size={18} />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </ScaleIn>
        </div>
      </section>
      {renderModal && <SupportModal isOpen={isOpen} onClose={handleClose} />}
    </>
  );
}
