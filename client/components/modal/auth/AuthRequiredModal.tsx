'use client';

import React from 'react';
import { Modal } from '@client/components/modal/Modal';
import { useModalStore } from '@client/store/modalStore';
import { useTranslations } from 'next-intl';

const MODAL_ID = 'authRequiredModal';

/**
 * Modal shown when unauthenticated users attempt to purchase a plan.
 * Provides clear CTAs for both sign in and create account flows.
 */
export const AuthRequiredModal: React.FC = () => {
  const { close, isModalOpen, openAuthModal } = useModalStore();
  const t = useTranslations('auth.authRequiredModal');

  const isOpen = isModalOpen(MODAL_ID);

  const handleSignIn = () => {
    close();
    // Small delay to allow modal close animation
    setTimeout(() => {
      openAuthModal('login');
    }, 200);
  };

  const handleCreateAccount = () => {
    close();
    // Small delay to allow modal close animation
    setTimeout(() => {
      openAuthModal('register');
    }, 200);
  };

  return (
    <Modal
      title={t('title')}
      isOpen={isOpen}
      onClose={close}
      showCloseButton={true}
      modalId={MODAL_ID}
    >
      <div className="space-y-6">
        {/* Description */}
        <p className="text-center text-text-secondary">{t('description')}</p>

        {/* Benefits */}
        <div className="bg-surface-light rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium text-text-primary">{t('benefits.title')}</p>
          <ul className="text-sm text-text-secondary space-y-1.5">
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-success mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('benefits.trackCredits')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-success mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('benefits.manageSubscription')}</span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-success mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <span>{t('benefits.support')}</span>
            </li>
          </ul>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={handleCreateAccount}
            className="w-full px-6 py-3 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-200 active:scale-98 hover:shadow-lg"
          >
            {t('createAccount')}
          </button>
          <button
            onClick={handleSignIn}
            className="w-full px-6 py-3 bg-surface hover:bg-surface-light text-text-primary font-medium rounded-lg border border-border transition-all duration-200 active:scale-98 hover:shadow-sm"
          >
            {t('signIn')}
          </button>
        </div>

        {/* Help Text */}
        <p className="text-xs text-center text-text-muted">{t('securePayment')}</p>
      </div>
    </Modal>
  );
};
