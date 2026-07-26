'use client';

import React from 'react';
import { AlertTriangle, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { clientEnv } from '@shared/config/env';
import { Modal } from '@client/components/ui/Modal';
import { Button } from '@client/components/ui/Button';

interface IProviderUnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProviderUnavailableModal: React.FC<IProviderUnavailableModalProps> = ({
  isOpen,
  onClose,
}) => {
  const t = useTranslations('workspace.providerUnavailable');
  const supportEmail = clientEnv.SUPPORT_EMAIL;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" title={t('title')}>
      <div className="space-y-5" data-testid="provider-unavailable-modal">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="space-y-2">
            <p className="text-sm text-text-primary">{t('message')}</p>
            <p className="text-sm font-medium text-text-primary">{t('creditsSafe')}</p>
          </div>
        </div>

        <p className="text-sm text-text-secondary">{t('contactSupport')}</p>

        <a
          href={`mailto:${supportEmail}`}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-light focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
          {supportEmail}
        </a>

        <Button variant="outline" className="w-full" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </Modal>
  );
};
