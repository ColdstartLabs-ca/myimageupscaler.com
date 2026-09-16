import { serverEnv } from '@shared/config/env';

const AMPLITUDE_DASHBOARD_API_BASE = 'https://amplitude.com/api/2';

export type TAmplitudeDashboardMetric = 'totals' | 'uniques';

export interface IAmplitudeDashboardAuthOptions {
  apiKey?: string;
  secretKey?: string;
}

export interface IAmplitudeEventFilter {
  subprop_type: 'event' | 'user';
  subprop_key: string;
  subprop_op: string;
  subprop_value: string[];
}

export interface IAmplitudeEventTotalsParams {
  eventType: string;
  startDate: Date | string;
  endDate: Date | string;
  metric?: TAmplitudeDashboardMetric;
  filters?: IAmplitudeEventFilter[];
}

export interface IAmplitudeEventTotalsResult {
  eventType: string;
  metric: TAmplitudeDashboardMetric;
  start: string;
  end: string;
  xValues: string[];
  dailyTotals: number[];
  total: number;
}

interface IAmplitudeSegmentationResponse {
  data?: {
    series?: number[][];
    seriesCollapsed?: Array<Array<{ value?: number }>>;
    xValues?: string[];
  };
  error?: string;
}

/**
 * Typed Amplitude failure. `unknownEvent` marks the 400 "Invalid chart definition"
 * response, which the API returns for an event/chart it cannot resolve — it cannot be
 * distinguished from a fabricated event name, so callers must surface it as UNKNOWN
 * rather than asserting the event was never ingested. Every other status (401, 429,
 * 5xx, transport, schema) is a hard failure and must not be swallowed.
 */
export class AmplitudeDashboardApiError extends Error {
  readonly status: number;
  readonly unknownEvent: boolean;

  constructor(status: number, unknownEvent: boolean) {
    super(
      unknownEvent
        ? 'Amplitude has no chart for this event (HTTP 400 Invalid chart definition); ingestion is UNKNOWN, not proven zero.'
        : `Amplitude dashboard query failed (HTTP ${status}).`
    );
    this.name = 'AmplitudeDashboardApiError';
    this.status = status;
    this.unknownEvent = unknownEvent;
  }
}

function formatAmplitudeDate(input: Date | string): string {
  if (input instanceof Date) {
    const year = input.getUTCFullYear();
    const month = String(input.getUTCMonth() + 1).padStart(2, '0');
    const day = String(input.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  if (/^\d{8}$/.test(input)) {
    return input;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input.replaceAll('-', '');
  }

  throw new Error(
    `Invalid Amplitude date "${input}". Use YYYYMMDD, YYYY-MM-DD, or a Date instance.`
  );
}

function resolveDashboardCredentials(
  options: IAmplitudeDashboardAuthOptions = {}
): Required<IAmplitudeDashboardAuthOptions> {
  const apiKey = options.apiKey ?? serverEnv.AMPLITUDE_API_KEY;
  const secretKey = options.secretKey ?? serverEnv.AMPLITUDE_SECRET_KEY;

  if (!apiKey || !secretKey) {
    throw new Error(
      'Amplitude Dashboard REST API requires both AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY.'
    );
  }

  return { apiKey, secretKey };
}

export function buildAmplitudeDashboardAuthHeader(
  options: IAmplitudeDashboardAuthOptions = {}
): string {
  const { apiKey, secretKey } = resolveDashboardCredentials(options);
  return `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`;
}

export function buildAmplitudeEventSegmentationUrl(params: IAmplitudeEventTotalsParams): string {
  const url = new URL(`${AMPLITUDE_DASHBOARD_API_BASE}/events/segmentation`);
  url.searchParams.set('start', formatAmplitudeDate(params.startDate));
  url.searchParams.set('end', formatAmplitudeDate(params.endDate));
  url.searchParams.set('m', params.metric ?? 'totals');
  url.searchParams.set(
    'e',
    JSON.stringify({
      event_type: params.eventType,
      ...(params.filters?.length ? { filters: params.filters } : {}),
    })
  );
  return url.toString();
}

export async function getAmplitudeEventTotals(
  params: IAmplitudeEventTotalsParams,
  authOptions: IAmplitudeDashboardAuthOptions = {}
): Promise<IAmplitudeEventTotalsResult> {
  const metric = params.metric ?? 'totals';
  const url = buildAmplitudeEventSegmentationUrl({ ...params, metric });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: buildAmplitudeDashboardAuthHeader(authOptions),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new AmplitudeDashboardApiError(
      response.status,
      response.status === 400 && /invalid chart definition/i.test(body)
    );
  }

  const payload = (await response.json()) as IAmplitudeSegmentationResponse;
  if (payload.error) {
    throw new AmplitudeDashboardApiError(
      response.status,
      /invalid chart definition/i.test(payload.error)
    );
  }

  const xValues = payload.data?.xValues ?? [];
  const dailyTotals = (payload.data?.series?.[0] ?? []).map(value => Number(value) || 0);
  const collapsedValue = payload.data?.seriesCollapsed?.[0]?.[0]?.value;

  let total: number;
  if (typeof collapsedValue === 'number' && Number.isFinite(collapsedValue)) {
    total = collapsedValue;
  } else if (metric === 'uniques') {
    throw new Error(
      `Amplitude returned no whole-interval distinct count (seriesCollapsed) for "${params.eventType}"; refusing to sum overlapping daily uniques.`
    );
  } else {
    total = dailyTotals.reduce((sum, value) => sum + value, 0);
  }

  return {
    eventType: params.eventType,
    metric,
    start: formatAmplitudeDate(params.startDate),
    end: formatAmplitudeDate(params.endDate),
    xValues,
    dailyTotals,
    total,
  };
}
