import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const PROCESSING_PROVIDER_KEY = 'image-processing';
const FAILURE_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_SECONDS = 300;

export const PROCESSING_FAILURE_ALERT_POLICY = {
  windowMinutes: 15,
  minimumAttempts: 20,
  warningRatio: 0.05,
  criticalRatio: 0.1,
  criticalBaselineMultiplier: 3,
  alertCooldownMinutes: 30,
} as const;

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
  severity: 'warning' | 'critical' | null;
  attempts: number;
  failures: number;
  failureRatio: number;
  baselineRatio: number | null;
  billingFailures: number;
  circuitStatus: 'closed' | 'open' | 'half_open';
  retryAt: Date | null;
}

interface IDbProviderHealthAlert {
  should_alert: boolean;
  severity?: 'warning' | 'critical' | null;
  attempts: number;
  failures: number;
  failure_ratio: number | string;
  baseline_ratio?: number | string | null;
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
    const { data, error } = await supabaseAdmin.rpc('claim_provider_health_alert_v2', {
      p_provider: PROCESSING_PROVIDER_KEY,
      p_window_minutes: PROCESSING_FAILURE_ALERT_POLICY.windowMinutes,
      p_min_attempts: PROCESSING_FAILURE_ALERT_POLICY.minimumAttempts,
      p_warning_ratio: PROCESSING_FAILURE_ALERT_POLICY.warningRatio,
      p_critical_ratio: PROCESSING_FAILURE_ALERT_POLICY.criticalRatio,
      p_baseline_multiplier: PROCESSING_FAILURE_ALERT_POLICY.criticalBaselineMultiplier,
      p_alert_cooldown_minutes: PROCESSING_FAILURE_ALERT_POLICY.alertCooldownMinutes,
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
      severity: result.severity ?? null,
      attempts: Number(result.attempts),
      failures: Number(result.failures),
      failureRatio: Number(result.failure_ratio),
      baselineRatio:
        result.baseline_ratio === null || result.baseline_ratio === undefined
          ? null
          : Number(result.baseline_ratio),
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
