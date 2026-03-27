'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ModalHeader } from '@client/components/stripe/ModalHeader';
import { useAuthStore } from '@client/store/auth';

interface IDeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

export function DeleteAccountModal({
  isOpen,
  onClose,
  userEmail,
}: IDeleteAccountModalProps): JSX.Element | null {
  const t = useTranslations('dashboard.deleteAccount');
  const router = useRouter();
  const signOut = useAuthStore(state => state.signOut);
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isConfirmed = emailInput === userEmail;

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('errorGeneric'));
        return;
      }
      await signOut();
      router.push('/');
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setEmailInput('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full">
        <ModalHeader
          title={t('title')}
          icon={Trash2}
          iconClassName="text-error"
          onClose={handleClose}
          disabled={loading}
        />

        <div className="p-6 space-y-5">
          <WarningList t={t} />

          <EmailConfirmInput
            label={t('confirmLabel', { email: userEmail })}
            value={emailInput}
            onChange={setEmailInput}
            disabled={loading}
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <ActionButtons
            onClose={handleClose}
            onDelete={handleDelete}
            loading={loading}
            disabled={!isConfirmed}
            t={t}
          />
        </div>
      </div>
    </div>
  );
}

function WarningList({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="bg-error/10 border border-error/20 rounded-lg p-4 space-y-2">
      <p className="text-sm font-semibold text-error">{t('warningTitle')}</p>
      <ul className="text-sm text-error/80 space-y-1 list-disc list-inside">
        <li>{t('warningCredits')}</li>
        <li>{t('warningHistory')}</li>
        <li>{t('warningSubscription')}</li>
        <li>{t('warningAccount')}</li>
      </ul>
    </div>
  );
}

function EmailConfirmInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-sm text-muted-foreground mb-2">{label}</label>
      <input
        type="email"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-4 py-2 bg-surface-light border border-border rounded-lg text-white focus:ring-2 focus:ring-error focus:border-transparent"
        autoComplete="off"
      />
    </div>
  );
}

function ActionButtons({
  onClose,
  onDelete,
  loading,
  disabled,
  t,
}: {
  onClose: () => void;
  onDelete: () => void;
  loading: boolean;
  disabled: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onClose}
        disabled={loading}
        className="flex-1 px-4 py-3 bg-surface-light text-muted-foreground font-medium rounded-lg transition-colors hover:bg-surface-light/80"
      >
        {t('cancel')}
      </button>
      <button
        onClick={onDelete}
        disabled={disabled || loading}
        className="flex-1 px-4 py-3 bg-error hover:bg-error/80 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? t('deleting') : t('confirm')}
      </button>
    </div>
  );
}
