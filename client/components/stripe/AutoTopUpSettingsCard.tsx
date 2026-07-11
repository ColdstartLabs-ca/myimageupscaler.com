'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@server/supabase/supabaseClient';

interface IAutoTopUpSettings {
  enabled: boolean;
  pending_enabled: boolean;
  threshold_credits: number;
  pack_key: string;
  last_refill_at: string | null;
  failure_reason: string | null;
}

export function getAutoTopUpFailureMessage(reason: string): string {
  if (reason === 'disabled_by_user') return 'Disabled by you.';
  if (reason === 'invalid_pack_configuration') {
    return 'This setting needs attention. Please contact support.';
  }
  if (reason.startsWith('payment_intent_') || reason.includes('payment_intent')) {
    return 'The last top-up could not be completed. We will try again when eligible.';
  }
  if (reason.includes('checkout_session')) {
    return 'The previous checkout did not finish. You can try enabling auto top-up again.';
  }
  return 'The last top-up could not be completed. Please check your payment method.';
}

export function AutoTopUpSettingsCard(): JSX.Element | null {
  const [settings, setSettings] = useState<IAutoTopUpSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [disabling, setDisabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (method: 'GET' | 'PUT' = 'GET') => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error('Authentication required');
    const response = await fetch('/api/auto-top-up/settings', {
      method,
      headers: {
        authorization: `Bearer ${data.session.access_token}`,
        ...(method === 'PUT' ? { 'content-type': 'application/json' } : {}),
      },
      ...(method === 'PUT' ? { body: JSON.stringify({ enabled: false }) } : {}),
    });
    if (!response.ok) throw new Error('Unable to update auto top-up');
    return (await response.json()).data as IAutoTopUpSettings | null;
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return request()
      .then(setSettings)
      .catch(() => setError('Unable to load auto top-up settings'))
      .finally(() => setLoading(false));
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const disable = async () => {
    setDisabling(true);
    setError(null);
    try {
      await request('PUT');
      setSettings(current =>
        current ? { ...current, enabled: false, pending_enabled: false } : current
      );
    } catch {
      setError('Unable to disable auto top-up');
    } finally {
      setDisabling(false);
    }
  };

  if (loading)
    return (
      <div
        className="h-24 animate-pulse rounded-2xl bg-surface-light/30"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading auto top-up settings</span>
      </div>
    );
  if (!settings)
    return error ? (
      <section className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-error" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:bg-surface-light"
        >
          Retry
        </button>
      </section>
    ) : null;

  const active = settings.enabled || settings.pending_enabled;
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5"
      aria-labelledby="auto-top-up-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="auto-top-up-title" className="font-semibold text-text-primary">
            Automatic credit top-up
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {settings.pending_enabled
              ? `Pending ${settings.pack_key} pack below ${settings.threshold_credits} credits`
              : active
                ? `Buys the ${settings.pack_key} pack below ${settings.threshold_credits} credits`
                : 'Disabled'}
          </p>
          {settings.last_refill_at && (
            <p className="mt-1 text-xs text-text-tertiary">
              Last refill: {new Date(settings.last_refill_at).toLocaleDateString()}
            </p>
          )}
          {settings.failure_reason && (
            <p className="mt-1 text-xs text-error">
              Status: {getAutoTopUpFailureMessage(settings.failure_reason)}
            </p>
          )}
        </div>
        {active && (
          <button
            type="button"
            onClick={disable}
            disabled={disabling}
            className="rounded-lg border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-surface-light hover:text-text-primary disabled:opacity-50"
          >
            {disabling ? 'Disabling…' : 'Disable auto top-up'}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
