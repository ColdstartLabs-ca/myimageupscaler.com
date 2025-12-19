'use client';

import { adminFetch } from '@/client/utils/admin-api-client';
import { IAdminUserDetail } from '@/shared/types/admin.types';
import dayjs from 'dayjs';
import { ArrowLeft, Coins } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useEffect, useState } from 'react';

export default function AdminUserDetailPage() {
  const params = useParams();
  const userId = params.userId as string;

  const [user, setUser] = useState<IAdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await adminFetch<{ success: boolean; data: IAdminUserDetail }>(
          `/api/admin/users/${userId}`
        );
        if (data.success) {
          setUser(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setError(err instanceof Error ? err.message : 'Failed to load user');
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  const handleRoleChange = async (newRole: string) => {
    setSaving(true);
    try {
      const data = await adminFetch<{ success: boolean; data: unknown }>(
        `/api/admin/users/${userId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (data.success) {
        setUser(prev =>
          prev
            ? {
              ...prev,
              profile: { ...prev.profile, role: newRole as 'user' | 'admin' },
            }
            : null
        );
      }
    } catch (err) {
      console.error('Failed to update role:', err);
      alert(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-500">Loading user details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Link
          href="/dashboard/admin/users"
          className="text-indigo-600 hover:text-indigo-900 inline-block"
        >
          Back to users
        </Link>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">User not found</p>
        <Link
          href="/dashboard/admin/users"
          className="text-indigo-600 hover:text-indigo-900 mt-4 inline-block"
        >
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Link
          href="/dashboard/admin/users"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-lg font-medium text-slate-900">User Details</h2>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="font-medium text-slate-900 mb-4">Profile</h3>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-slate-500">Email</dt>
              <dd className="text-sm text-slate-900 mt-1">{user.profile.email}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">User ID</dt>
              <dd className="text-sm font-mono text-slate-900 mt-1">{user.profile.id}</dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Stripe Customer ID</dt>
              <dd className="text-sm font-mono text-slate-900 mt-1">
                {user.profile.stripe_customer_id || 'Not connected'}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Role</dt>
              <dd className="mt-1">
                <select
                  value={user.profile.role}
                  onChange={e => handleRoleChange(e.target.value)}
                  disabled={saving}
                  className="block w-full rounded-lg border-slate-300 text-sm disabled:opacity-50"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </dd>
            </div>
            <div>
              <dt className="text-sm text-slate-500">Joined</dt>
              <dd className="text-sm text-slate-900 mt-1">
                {dayjs(user.profile.created_at).format('MMMM D, YYYY')}
              </dd>
            </div>
          </dl>
        </div>

        {/* Credits Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-slate-900">Credits</h3>
            <button
              onClick={() => setShowCreditModal(true)}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Coins className="h-4 w-4 mr-1.5" />
              Adjust Credits
            </button>
          </div>
          <div className="text-3xl font-bold text-slate-900 mb-4">
            {(user.profile.subscription_credits_balance ?? 0) +
              (user.profile.purchased_credits_balance ?? 0)}
          </div>
          <div>
            <h4 className="text-sm font-medium text-slate-700 mb-2">Recent Transactions</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {user.recentTransactions.length === 0 ? (
                <p className="text-sm text-slate-500">No transactions</p>
              ) : (
                user.recentTransactions.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <div>
                      <span className="text-slate-900 capitalize">{tx.type}</span>
                      <span className="text-slate-500 ml-2">
                        {dayjs(tx.created_at).format('MMM D')}
                      </span>
                    </div>
                    <span className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                      {tx.amount > 0 ? '+' : ''}
                      {tx.amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Subscription Card */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 lg:col-span-2">
          <h3 className="font-medium text-slate-900 mb-4">Subscription</h3>
          {user.subscription ? (
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <dt className="text-sm text-slate-500">Status</dt>
                <dd className="mt-1">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${user.subscription.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                      }`}
                  >
                    {user.subscription.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Tier</dt>
                <dd className="text-sm font-medium text-slate-900 mt-1">
                  {user.profile.subscription_tier || 'Unknown'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Period End</dt>
                <dd className="text-sm text-slate-900 mt-1">
                  {dayjs(user.subscription.current_period_end).format('MMM D, YYYY')}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-slate-500">Subscription ID</dt>
                <dd className="text-sm font-mono text-slate-900 mt-1 truncate">
                  {user.subscription.id}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No active subscription</p>
          )}
        </div>
      </div>

      {/* Credit Adjustment Modal */}
      {showCreditModal && (
        <CreditAdjustmentModal
          userId={userId}
          currentBalance={
            (user.profile.subscription_credits_balance ?? 0) +
            (user.profile.purchased_credits_balance ?? 0)
          }
          onClose={() => setShowCreditModal(false)}
          onSuccess={() => {
            setShowCreditModal(false);
            // Refresh to get updated balances and transactions
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

interface ICreditAdjustmentModalProps {
  userId: string;
  currentBalance: number;
  onClose: () => void;
  onSuccess: (newBalance: number) => void;
}

function CreditAdjustmentModal({
  userId,
  currentBalance,
  onClose,
  onSuccess,
}: ICreditAdjustmentModalProps) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const data = await adminFetch<{ success: boolean; data: { newBalance: number } }>(
        '/api/admin/credits/adjust',
        {
          method: 'POST',
          body: JSON.stringify({
            userId,
            amount: parseInt(amount),
            reason,
          }),
        }
      );
      if (data.success) {
        onSuccess(data.data.newBalance);
      } else {
        setError('Failed to adjust credits');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const previewBalance = amount ? currentBalance + parseInt(amount) : currentBalance;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-medium text-slate-900 mb-4">Adjust Credits</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Amount (positive to add, negative to remove)
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="mt-1 block w-full rounded-lg border-slate-300"
              placeholder="e.g., 50 or -20"
              required
            />
            <p className="mt-1 text-sm text-slate-500">
              Current: {currentBalance} → New: {previewBalance}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border-slate-300"
              placeholder="e.g., Customer support compensation"
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving...' : 'Adjust Credits'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
