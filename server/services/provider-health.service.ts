import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const PROCESSING_PROVIDER_KEY = 'image-processing';
const FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_SECONDS = 300;

export type ProviderFailureKind =
  | 'authentication'
  | 'billing'
  | 'internal'
  | 'provider_unavailable'
  | 'rate_limited'
  | 'timeout';

interface IDbCircuitAvailability {
  available: boolean;
  circuit_status: 'closed' | 'open' | 'half_open';
  retry_at: string | null;
}

export interface IProviderCircuitAvailability {
  available: boolean;
  status: 'closed' | 'open' | 'half_open';
  retryAt: Date | null;
}

export interface IProviderHealthAlertSnapshot {
  shouldAlert: boolean;
  attempts: number;
  failures: number;
  failureRatio: number;
  billingFailures: number;
  circuitStatus: 'closed' | 'open' | 'half_open';
  retryAt: Date | null;
}

interface IDbProviderHealthAlert {
  should_alert: boolean;
  attempts: number;
  failures: number;
  failure_ratio: number | string;
  billing_failures: number;
  circuit_status: 'closed' | 'open' | 'half_open';
  retry_at: string | null;
}

function firstRow<T>(data: T | T[] | null): T | null {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export const providerHealthService = {
  async getAvailability(): Promise<IProviderCircuitAvailability> {
    const { data, error } = await supabaseAdmin.rpc('get_provider_circuit_availability', {
      p_provider: PROCESSING_PROVIDER_KEY,
    });

    if (error) {
      console.error('[PROVIDER_HEALTH] Unable to read circuit state', error);
      return { available: true, status: 'closed', retryAt: null };
    }

    const result = firstRow(data as IDbCircuitAvailability | IDbCircuitAvailability[] | null);
    if (!result) {
      return { available: true, status: 'closed', retryAt: null };
    }

    return {
      available: result.available,
      status: result.circuit_status,
      retryAt: result.retry_at ? new Date(result.retry_at) : null,
    };
  },

  async acquireProcessingPermit(): Promise<boolean> {
    const { data, error } = await supabaseAdmin.rpc('acquire_provider_circuit_permit', {
      p_provider: PROCESSING_PROVIDER_KEY,
    });

    if (error) {
      console.error('[PROVIDER_HEALTH] Unable to acquire circuit permit', error);
      return true;
    }

    return data === true;
  },

  async recordSuccess(): Promise<boolean> {
    return this.recordOutcome(true);
  },

  async recordFailure(failureKind: ProviderFailureKind): Promise<boolean> {
    return this.recordOutcome(false, failureKind);
  },

  async recordOutcome(success: boolean, failureKind?: ProviderFailureKind): Promise<boolean> {
    const { error } = await supabaseAdmin.rpc('record_provider_health_outcome', {
      p_provider: PROCESSING_PROVIDER_KEY,
      p_success: success,
      p_failure_kind: failureKind ?? null,
      p_failure_threshold: FAILURE_THRESHOLD,
      p_cooldown_seconds: CIRCUIT_COOLDOWN_SECONDS,
    });

    if (error) {
      console.error('[PROVIDER_HEALTH] Unable to record provider outcome', error);
      return false;
    }

    return true;
  },

  async claimAlert(): Promise<IProviderHealthAlertSnapshot | null> {
    const { data, error } = await supabaseAdmin.rpc('claim_provider_health_alert', {
      p_provider: PROCESSING_PROVIDER_KEY,
      p_window_minutes: 10,
      p_min_attempts: 5,
      p_failure_ratio: 0.5,
      p_alert_cooldown_minutes: 30,
    });

    if (error) {
      console.error('[PROVIDER_HEALTH] Unable to evaluate alert threshold', error);
      return null;
    }

    const result = firstRow(data as IDbProviderHealthAlert | IDbProviderHealthAlert[] | null);
    if (!result) {
      return null;
    }

    return {
      shouldAlert: result.should_alert,
      attempts: Number(result.attempts),
      failures: Number(result.failures),
      failureRatio: Number(result.failure_ratio),
      billingFailures: Number(result.billing_failures),
      circuitStatus: result.circuit_status,
      retryAt: result.retry_at ? new Date(result.retry_at) : null,
    };
  },

  async releaseAlertClaim(): Promise<void> {
    const { error } = await supabaseAdmin.rpc('release_provider_health_alert_claim', {
      p_provider: PROCESSING_PROVIDER_KEY,
    });
    if (error) {
      console.error('[PROVIDER_HEALTH] Unable to release failed alert claim', error);
    }
  },
};
