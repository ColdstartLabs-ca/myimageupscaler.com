'use client';

import { clientEnv } from '@shared/config/env';
import { useClickOutside } from '@/client/hooks/useClickOutside';
import { adminFetch } from '@/client/utils/admin-api-client';
import { IAdminUserProfile } from '@/shared/types/admin.types';
import { Coins, CreditCard, Eye, MoreVertical, Shield, ShieldOff, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface IUserActionsDropdownProps {
  user: IAdminUserProfile;
  onUpdate: () => void;
}

export function UserActionsDropdown({
  user,
  onUpdate,
}: IUserActionsDropdownProps): React.ReactElement {
  const t = useTranslations();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<
    'credits' | 'subscription' | 'delete' | 'role' | null
  >(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);
  useClickOutside(dropdownRef, closeDropdown);

  const handleAction = (action: 'credits' | 'subscription' | 'delete' | 'role' | 'view') => {
    setIsOpen(false);
    if (action === 'view') {
      router.push(`/dashboard/admin/users/${user.id}`);
    } else {
      setActiveModal(action);
    }
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-lg hover:bg-surface-light transition-colors text-muted-foreground hover:text-muted-foreground"
          aria-label={t('admin.aria.userActions')}
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-56 bg-surface rounded-lg shadow-lg border border-border py-1 z-20">
            <DropdownItem
              icon={Eye}
              label={t('admin.users.viewDetails')}
              onClick={() => handleAction('view')}
            />
            <DropdownDivider />
            <DropdownItem
              icon={user.role === 'admin' ? ShieldOff : Shield}
              label={
                user.role === 'admin' ? t('admin.users.removeAdmin') : t('admin.users.makeAdmin')
              }
              onClick={() => handleAction('role')}
            />
            <DropdownItem
              icon={Coins}
              label={t('admin.users.adjustCredits')}
              onClick={() => handleAction('credits')}
            />
            <DropdownItem
              icon={CreditCard}
              label={t('admin.users.changeSubscription')}
              onClick={() => handleAction('subscription')}
            />
            <DropdownDivider />
            <DropdownItem
              icon={Trash2}
              label={t('admin.users.deleteUser')}
              onClick={() => handleAction('delete')}
              variant="danger"
            />
          </div>
        )}
      </div>

      {/* Modals */}
      {activeModal === 'credits' && (
        <CreditAdjustmentModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={onUpdate}
        />
      )}
      {activeModal === 'subscription' && (
        <SubscriptionModal user={user} onClose={() => setActiveModal(null)} onSuccess={onUpdate} />
      )}
      {activeModal === 'delete' && (
        <DeleteUserModal user={user} onClose={() => setActiveModal(null)} onSuccess={onUpdate} />
      )}
      {activeModal === 'role' && (
        <RoleChangeModal user={user} onClose={() => setActiveModal(null)} onSuccess={onUpdate} />
      )}
    </>
  );
}

// Dropdown Components
interface IDropdownItemProps {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

function DropdownItem({ icon: Icon, label, onClick, variant = 'default' }: IDropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-3 py-2 text-sm transition-colors ${
        variant === 'danger'
          ? 'text-error hover:bg-error/10'
          : 'text-muted-foreground hover:bg-surface'
      }`}
    >
      <Icon className="h-4 w-4 mr-2.5" />
      {label}
    </button>
  );
}

function DropdownDivider() {
  return <div className="my-1 border-t border-border" />;
}

// Modal Components
interface IModalProps {
  user: IAdminUserProfile;
  onClose: () => void;
  onSuccess: () => void;
}

function CreditAdjustmentModal({ user, onClose, onSuccess }: IModalProps) {
  const t = useTranslations('admin');
  const totalBalance =
    (user.subscription_credits_balance ?? 0) + (user.purchased_credits_balance ?? 0);
  const [newBalance, setNewBalance] = useState(totalBalance.toString());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await adminFetch('/api/admin/credits/adjust', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          newBalance: parseInt(newBalance),
        }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSetCredits'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t('setCredits')} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">
            {t('fields.user')}
          </label>
          <p className="mt-1 text-sm text-primary">{user.email}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground">
            {t('creditsBalance')}
          </label>
          <input
            type="number"
            min="0"
            value={newBalance}
            onChange={e => setNewBalance(e.target.value)}
            className="mt-1 block w-full rounded-lg border-border shadow-sm focus:border-accent focus:ring-accent"
            required
          />
          <p className="mt-1 text-sm text-muted-foreground">
            {t('current')}{' '}
            {(user.subscription_credits_balance ?? 0) + (user.purchased_credits_balance ?? 0)}
          </p>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <ModalActions onClose={onClose} submitLabel={t('save')} submitting={submitting} />
      </form>
    </Modal>
  );
}

const PLANS = [
  { id: '', name: 'Free', price: '$0/mo' },
  {
    id: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_HOBBY,
    name: 'Hobby',
    price: '$19/mo',
  },
  {
    id: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_PRO,
    name: 'Professional',
    price: '$49/mo',
  },
  {
    id: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_BUSINESS,
    name: 'Business',
    price: '$149/mo',
  },
];

interface IStripeSubData {
  subscription: { id: string; status: string; price_id: string } | null;
  stripeSubscription: {
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: number | null;
  } | null;
}

function SubscriptionModal({ user, onClose, onSuccess }: IModalProps) {
  const t = useTranslations('admin');
  const [loading, setLoading] = useState(true);
  const [stripeData, setStripeData] = useState<IStripeSubData | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Fetch actual subscription state from Stripe
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await adminFetch<{ success: boolean; data: IStripeSubData }>(
          `/api/admin/subscription?userId=${user.id}`
        );
        setStripeData(data.data);
        // Set initial selection based on current tier
        const current = PLANS.find(
          p => p.name.toLowerCase() === user.subscription_tier?.toLowerCase()
        );
        setSelectedPlan(current?.id || '');
      } catch {
        setError(t('failedToLoad'));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id, user.subscription_tier, t]);

  const hasActiveStripeSubscription =
    stripeData?.stripeSubscription && stripeData.stripeSubscription.status === 'active';

  const currentPlanId =
    PLANS.find(p => p.name.toLowerCase() === user.subscription_tier?.toLowerCase())?.id || '';

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    try {
      if (selectedPlan === '') {
        await adminFetch('/api/admin/subscription', {
          method: 'POST',
          body: JSON.stringify({ userId: user.id, action: 'cancel' }),
        });
      } else {
        await adminFetch('/api/admin/subscription', {
          method: 'POST',
          body: JSON.stringify({
            userId: user.id,
            action: 'change',
            targetPriceId: selectedPlan,
          }),
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToUpdate'));
    } finally {
      setSubmitting(false);
    }
  };

  const hasChanged = selectedPlan !== currentPlanId;
  const selectedPlanName = PLANS.find(p => p.id === selectedPlan)?.name || 'Free';

  // Determine what action will happen
  const getActionDescription = () => {
    if (!hasChanged) return null;

    if (selectedPlan === '') {
      if (hasActiveStripeSubscription) {
        return {
          type: 'warning',
          text: t('immediatelyCancel'),
        };
      }
      return { type: 'info', text: t('removeAccess') };
    }

    if (hasActiveStripeSubscription) {
      return {
        type: 'info',
        text: t('changeToPlan', { planName: selectedPlanName }),
      };
    }

    return {
      type: 'warning',
      text: t('grantAccessWithoutStripe', { planName: selectedPlanName }),
    };
  };

  const actionDesc = getActionDescription();

  if (loading) {
    return (
      <Modal title={t('manageSubscription')} onClose={onClose}>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </Modal>
    );
  }

  return (
    <Modal title={t('manageSubscription')} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">
            {t('fields.user')}
          </label>
          <p className="mt-1 text-sm text-primary">{user.email}</p>
        </div>

        {/* Current State */}
        <div className="p-3 bg-surface border border-border rounded-lg space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('profileTier')}</span>
            <span className="font-medium">{user.subscription_tier || t('free')}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t('stripeStatus')}</span>
            <span
              className={`font-medium ${hasActiveStripeSubscription ? 'text-success' : 'text-muted-foreground'}`}
            >
              {stripeData?.stripeSubscription?.status || t('noSubscription')}
            </span>
          </div>
          {stripeData?.stripeSubscription?.current_period_end && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('renews')}</span>
              <span className="font-medium">
                {new Date(
                  stripeData.stripeSubscription.current_period_end * 1000
                ).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            {t('changeTo')}
          </label>
          <div className="space-y-2">
            {PLANS.map(plan => (
              <label
                key={plan.id}
                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedPlan === plan.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border hover:border-border'
                }`}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="plan"
                    value={plan.id}
                    checked={selectedPlan === plan.id}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="h-4 w-4 text-accent focus:ring-accent"
                  />
                  <span className="ml-3 font-medium text-primary">{plan.name}</span>
                </div>
                <span className="text-muted-foreground">{plan.price}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Description */}
        {actionDesc && (
          <div
            className={`p-3 rounded-lg text-sm ${
              actionDesc.type === 'warning'
                ? 'bg-warning/10 border border-warning/20 text-warning'
                : 'bg-accent/10 border border-accent/20 text-accent'
            }`}
          >
            {actionDesc.text}
          </div>
        )}

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-light rounded-lg transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasChanged}
            className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RoleChangeModal({ user, onClose, onSuccess }: IModalProps) {
  const t = useTranslations();
  const newRole = user.role === 'admin' ? 'user' : 'admin';
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = async () => {
    setSubmitting(true);
    setError('');

    try {
      await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        newRole === 'admin' ? t('admin.users.grantAdminTitle') : t('admin.users.removeAdminTitle')
      }
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">User</label>
          <p className="mt-1 text-sm text-primary">{user.email}</p>
        </div>

        <div className="p-3 bg-surface border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            {newRole === 'admin' ? (
              <>
                This will grant <strong>{user.email}</strong> full admin access to the admin panel,
                including the ability to manage users, credits, and subscriptions.
              </>
            ) : (
              <>
                This will remove admin access from <strong>{user.email}</strong>. They will no
                longer be able to access the admin panel.
              </>
            )}
          </p>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <ModalActions
          onClose={onClose}
          submitLabel={
            newRole === 'admin'
              ? t('admin.users.grantAdminButton')
              : t('admin.users.removeAdminButton')
          }
          submitting={submitting}
          onSubmit={handleConfirm}
          variant={newRole === 'user' ? 'danger' : 'primary'}
        />
      </div>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onSuccess }: IModalProps) {
  const t = useTranslations('admin');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canDelete = confirmEmail === user.email;

  const handleDelete = async () => {
    if (!canDelete) return;
    setSubmitting(true);
    setError('');

    try {
      await adminFetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToDelete'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title={t('deleteUserTitle')} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-error/10 border border-error/20 rounded-lg">
          <p className="text-sm text-error">
            <strong>{t('warning')}</strong> {t('irreversible')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground">
            {t('typeEmailToConfirm', { email: user.email })}
          </label>
          <input
            type="text"
            value={confirmEmail}
            onChange={e => setConfirmEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border-border shadow-sm focus:border-error focus:ring-error"
            placeholder="user@example.com"
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <ModalActions
          onClose={onClose}
          submitLabel={t('deleteUserButton')}
          submitting={submitting}
          onSubmit={handleDelete}
          variant="danger"
          disabled={!canDelete}
        />
      </div>
    </Modal>
  );
}

// Shared Modal Components
interface IModalWrapperProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ title, onClose, children }: IModalWrapperProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={e => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-surface rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-primary mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

interface IModalActionsProps {
  onClose: () => void;
  submitLabel: string;
  submitting: boolean;
  onSubmit?: () => void;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
}

function ModalActions({
  onClose,
  submitLabel,
  submitting,
  onSubmit,
  variant = 'primary',
  disabled,
}: IModalActionsProps) {
  const t = useTranslations('admin');
  const buttonClass =
    variant === 'danger'
      ? 'bg-error hover:bg-error/90 focus:ring-error'
      : 'bg-accent hover:bg-accent-hover focus:ring-accent';

  const content = (
    <div className="flex justify-end space-x-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-surface-light rounded-lg transition-colors"
      >
        {t('cancel')}
      </button>
      {onSubmit ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || disabled}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
        >
          {submitting ? t('processing') : submitLabel}
        </button>
      ) : (
        <button
          type="submit"
          disabled={submitting || disabled}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
        >
          {submitting ? t('processing') : submitLabel}
        </button>
      )}
    </div>
  );

  return content;
}
