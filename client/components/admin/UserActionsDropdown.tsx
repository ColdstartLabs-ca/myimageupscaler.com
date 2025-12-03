'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  MoreVertical,
  Eye,
  Coins,
  CreditCard,
  Trash2,
  Shield,
  ShieldOff,
} from 'lucide-react';
import { IAdminUserProfile } from '@/shared/types/admin';
import { useClickOutside } from '@/client/hooks/useClickOutside';
import { adminFetch } from '@/client/utils/admin-api-client';

interface IUserActionsDropdownProps {
  user: IAdminUserProfile;
  onUpdate: () => void;
}

export function UserActionsDropdown({ user, onUpdate }: IUserActionsDropdownProps): React.ReactElement {
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
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          aria-label="User actions"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
            <DropdownItem
              icon={Eye}
              label="View Details"
              onClick={() => handleAction('view')}
            />
            <DropdownDivider />
            <DropdownItem
              icon={user.role === 'admin' ? ShieldOff : Shield}
              label={user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
              onClick={() => handleAction('role')}
            />
            <DropdownItem
              icon={Coins}
              label="Adjust Credits"
              onClick={() => handleAction('credits')}
            />
            <DropdownItem
              icon={CreditCard}
              label="Change Subscription"
              onClick={() => handleAction('subscription')}
            />
            <DropdownDivider />
            <DropdownItem
              icon={Trash2}
              label="Delete User"
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
        <SubscriptionModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={onUpdate}
        />
      )}
      {activeModal === 'delete' && (
        <DeleteUserModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={onUpdate}
        />
      )}
      {activeModal === 'role' && (
        <RoleChangeModal
          user={user}
          onClose={() => setActiveModal(null)}
          onSuccess={onUpdate}
        />
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
          ? 'text-red-600 hover:bg-red-50'
          : 'text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="h-4 w-4 mr-2.5" />
      {label}
    </button>
  );
}

function DropdownDivider() {
  return <div className="my-1 border-t border-slate-100" />;
}

// Modal Components
interface IModalProps {
  user: IAdminUserProfile;
  onClose: () => void;
  onSuccess: () => void;
}

function CreditAdjustmentModal({ user, onClose, onSuccess }: IModalProps) {
  const [newBalance, setNewBalance] = useState(user.credits_balance.toString());
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
      setError(err instanceof Error ? err.message : 'Failed to set credits');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Set Credits" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">User</label>
          <p className="mt-1 text-sm text-slate-900">{user.email}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Credits Balance
          </label>
          <input
            type="number"
            min="0"
            value={newBalance}
            onChange={e => setNewBalance(e.target.value)}
            className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            required
          />
          <p className="mt-1 text-sm text-slate-500">
            Current: {user.credits_balance}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions
          onClose={onClose}
          submitLabel="Save"
          submitting={submitting}
        />
      </form>
    </Modal>
  );
}

const PLANS = [
  { id: '', name: 'Free', price: '$0/mo' },
  { id: 'price_1SZmVyALMLhQocpf0H7n5ls8', name: 'Hobby', price: '$19/mo' },
  { id: 'price_1SZmVzALMLhQocpfPyRX2W8D', name: 'Professional', price: '$49/mo' },
  { id: 'price_1SZmVzALMLhQocpfqPk9spg4', name: 'Business', price: '$149/mo' },
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
        const current = PLANS.find(p =>
          p.name.toLowerCase() === user.subscription_tier?.toLowerCase()
        );
        setSelectedPlan(current?.id || '');
      } catch {
        setError('Failed to load subscription data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id, user.subscription_tier]);

  const hasActiveStripeSubscription = stripeData?.stripeSubscription &&
    stripeData.stripeSubscription.status === 'active';

  const currentPlanId = PLANS.find(p =>
    p.name.toLowerCase() === user.subscription_tier?.toLowerCase()
  )?.id || '';

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
      setError(err instanceof Error ? err.message : 'Failed to update subscription');
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
        return { type: 'warning', text: 'This will cancel the Stripe subscription immediately. User will lose access.' };
      }
      return { type: 'info', text: 'This will remove subscription access from the user profile.' };
    }

    if (hasActiveStripeSubscription) {
      return { type: 'info', text: `This will change the Stripe subscription to ${selectedPlanName}. Billing will be prorated.` };
    }

    return { type: 'warning', text: `This will grant ${selectedPlanName} access WITHOUT creating a Stripe subscription. Use for comps or testing only.` };
  };

  const actionDesc = getActionDescription();

  if (loading) {
    return (
      <Modal title="Manage Subscription" onClose={onClose}>
        <p className="text-sm text-slate-500">Loading...</p>
      </Modal>
    );
  }

  return (
    <Modal title="Manage Subscription" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">User</label>
          <p className="mt-1 text-sm text-slate-900">{user.email}</p>
        </div>

        {/* Current State */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Profile Tier:</span>
            <span className="font-medium">{user.subscription_tier || 'Free'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Stripe Status:</span>
            <span className={`font-medium ${hasActiveStripeSubscription ? 'text-green-600' : 'text-slate-500'}`}>
              {stripeData?.stripeSubscription?.status || 'No subscription'}
            </span>
          </div>
          {stripeData?.stripeSubscription?.current_period_end && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Renews:</span>
              <span className="font-medium">
                {new Date(stripeData.stripeSubscription.current_period_end * 1000).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Plan Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Change To</label>
          <div className="space-y-2">
            {PLANS.map((plan) => (
              <label
                key={plan.id}
                className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedPlan === plan.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center">
                  <input
                    type="radio"
                    name="plan"
                    value={plan.id}
                    checked={selectedPlan === plan.id}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="ml-3 font-medium text-slate-900">{plan.name}</span>
                </div>
                <span className="text-slate-600">{plan.price}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Action Description */}
        {actionDesc && (
          <div className={`p-3 rounded-lg text-sm ${
            actionDesc.type === 'warning'
              ? 'bg-amber-50 border border-amber-200 text-amber-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>
            {actionDesc.text}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasChanged}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RoleChangeModal({ user, onClose, onSuccess }: IModalProps) {
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
      title={newRole === 'admin' ? 'Grant Admin Access' : 'Remove Admin Access'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">User</label>
          <p className="mt-1 text-sm text-slate-900">{user.email}</p>
        </div>

        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-sm text-slate-700">
            {newRole === 'admin' ? (
              <>
                This will grant <strong>{user.email}</strong> full admin access to the admin
                panel, including the ability to manage users, credits, and subscriptions.
              </>
            ) : (
              <>
                This will remove admin access from <strong>{user.email}</strong>. They will no
                longer be able to access the admin panel.
              </>
            )}
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions
          onClose={onClose}
          submitLabel={newRole === 'admin' ? 'Grant Admin' : 'Remove Admin'}
          submitting={submitting}
          onSubmit={handleConfirm}
          variant={newRole === 'user' ? 'danger' : 'primary'}
        />
      </div>
    </Modal>
  );
}

function DeleteUserModal({ user, onClose, onSuccess }: IModalProps) {
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
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Delete User" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">
            <strong>Warning:</strong> This action is irreversible. All user data including
            credits, subscriptions, and transaction history will be permanently deleted.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Type <span className="font-mono text-red-600">{user.email}</span> to confirm
          </label>
          <input
            type="text"
            value={confirmEmail}
            onChange={e => setConfirmEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border-slate-300 shadow-sm focus:border-red-500 focus:ring-red-500"
            placeholder="user@example.com"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ModalActions
          onClose={onClose}
          submitLabel="Delete User"
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
      onClick={(e) => {
        // Close on backdrop click
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-medium text-slate-900 mb-4">{title}</h3>
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
  const buttonClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
      : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500';

  const content = (
    <div className="flex justify-end space-x-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
      >
        Cancel
      </button>
      {onSubmit ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || disabled}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
        >
          {submitting ? 'Processing...' : submitLabel}
        </button>
      ) : (
        <button
          type="submit"
          disabled={submitting || disabled}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonClass}`}
        >
          {submitting ? 'Processing...' : submitLabel}
        </button>
      )}
    </div>
  );

  return content;
}
