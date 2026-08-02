/**
 * Offline validator for the PRD section 6 Amplitude contract.
 *
 * The canonical event names and KPI metadata come from
 * server/analytics/coreKpiDefinitions.ts. This module adds the property
 * types, examples, and alternate-required rules that Amplitude Data needs.
 * It reads an optional local JSON export and never calls Amplitude or another
 * production service.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  CORE_KPI_EVENT_DEFINITIONS,
  CORE_KPI_EVENT_NAMES,
  CORE_KPI_RELEASE_ANNOTATION,
  type TCoreKpiEventName,
} from '@server/analytics/coreKpiDefinitions';
import { assertReadOnlyMode, type TEnvironmentMode } from './reconcile-revenue-telemetry';

export const CORE_AMPLITUDE_SCHEMA_VERSION = '2026-08-01' as const;

export type TAmplitudePropertyType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'identifier'
  | 'timestamp';

export interface IAmplitudePropertyDefinition {
  type: TAmplitudePropertyType;
  description: string;
  required: boolean;
  nullable: boolean;
  example: unknown;
}

interface IAmplitudePropertySpec {
  type: TAmplitudePropertyType;
  description: string;
  nullable?: boolean;
  example: unknown;
}

interface ICorePropertySpecs {
  required: Record<string, IAmplitudePropertySpec>;
  optional: Record<string, IAmplitudePropertySpec>;
}

export interface ICoreAmplitudeEventSchema {
  eventName: TCoreKpiEventName;
  description: string;
  category: string;
  owner: string;
  source: string;
  status: 'active' | 'inactive';
  kpiRole: string;
  requiredProperties: readonly string[];
  optionalProperties: readonly string[];
  requiredAnyOf: readonly (readonly string[])[];
  properties: Readonly<Record<string, IAmplitudePropertyDefinition>>;
  example: Readonly<Record<string, unknown>>;
  official?: boolean;
}

export interface ICoreAmplitudeSchemaDocument {
  schemaVersion: string;
  source: string;
  releaseAnnotation: typeof CORE_KPI_RELEASE_ANNOTATION;
  mode?: TEnvironmentMode;
  reconciliationVerified?: boolean;
  observationWindowDays?: number;
  liveValidation: {
    status: 'not_run' | 'provided_unverified' | 'verified';
    note: string;
  };
  events: readonly ICoreAmplitudeEventSchema[];
}

export type TCoreAmplitudeSchemaInput =
  | ICoreAmplitudeSchemaDocument
  | readonly ICoreAmplitudeEventSchema[];

export interface IDashboardCanonicalDefinition {
  dashboardName: string;
  metricName: string;
  canonicalEvents: readonly string[];
  formula: string;
  filters: readonly string[];
  sourceOfTruth: string;
  releaseAnnotation: string;
  validationStatus: 'template_pending_external_validation';
}

export const DASHBOARD_CANONICAL_DEFINITIONS: readonly IDashboardCanonicalDefinition[] = [
  {
    dashboardName: 'KPI Dashboard',
    metricName: 'checkout_to_paid_conversion',
    canonicalEvents: ['purchase_confirmed', 'checkout_opened'],
    formula: 'unique purchase_confirmed users / unique ordered checkout_opened users',
    filters: ['exclude Stripe test mode', 'use ordered attribution window', 'deduplicate users'],
    sourceOfTruth: 'Server-side purchase_confirmed, not checkout_completed alone.',
    releaseAnnotation: 'Annotate 2026-08-01 release and the unreliable pre-release interval.',
    validationStatus: 'template_pending_external_validation',
  },
  {
    dashboardName: 'Revenue & Monetization',
    metricName: 'recognized_gross_revenue',
    canonicalEvents: ['revenue_received'],
    formula: 'sum($revenue) grouped by $revenueType/$productId and deduplicated sourceObjectId',
    filters: ['exclude test mode', 'exclude zero-dollar invoices', 'measure refunds separately'],
    sourceOfTruth: 'Amplitude special revenue properties on revenue_received.',
    releaseAnnotation: 'Annotate 2026-08-01 release and the unreliable pre-release interval.',
    validationStatus: 'template_pending_external_validation',
  },
  {
    dashboardName: 'Subscription Lifecycle',
    metricName: 'intent_reversal_effective_churn_and_renewal',
    canonicalEvents: [
      'subscription_cancel_scheduled',
      'subscription_cancel_reversed',
      'subscription_canceled',
      'subscription_renewed',
    ],
    formula: 'unique subscriptionId counts by lifecycle event and cohort window',
    filters: ['exclude test mode', 'keep scheduled intent distinct from effective cancellation'],
    sourceOfTruth: 'Stripe subscription and invoice webhooks.',
    releaseAnnotation: 'Annotate 2026-08-01 release and the unreliable pre-release interval.',
    validationStatus: 'template_pending_external_validation',
  },
  {
    dashboardName: 'Processing Health',
    metricName: 'processing_failure_rate',
    canonicalEvents: ['processing_failed', 'image_upscaled'],
    formula: 'processing_failed / (processing_failed + image_upscaled)',
    filters: [
      '15-minute rolling window',
      'minimum 20 terminal attempts',
      'bounded error/provider/model segments',
    ],
    sourceOfTruth: 'Exactly one terminal outcome per processing attempt.',
    releaseAnnotation: 'Annotate 2026-08-01 release and the unreliable pre-release interval.',
    validationStatus: 'template_pending_external_validation',
  },
] as const;

const property = (
  type: TAmplitudePropertyType,
  description: string,
  example: unknown,
  nullable = false
): IAmplitudePropertySpec => ({ type, description, example, nullable });

const CORE_EVENT_CATEGORIES = {
  account_created: 'acquisition',
  monetization_surface_shown: 'monetization',
  monetization_surface_clicked: 'monetization',
  plan_selected: 'checkout',
  checkout_opened: 'checkout',
  checkout_error: 'checkout',
  image_upscaled: 'activation',
  processing_failed: 'processing',
  checkout_completed: 'checkout',
  purchase_confirmed: 'billing',
  revenue_received: 'billing',
  subscription_created: 'billing',
  subscription_renewed: 'billing',
  subscription_cancel_scheduled: 'retention',
  subscription_cancel_reversed: 'retention',
  subscription_canceled: 'retention',
  payment_failed: 'billing',
  payment_recovery_started: 'recovery',
  payment_recovered: 'recovery',
} satisfies Record<TCoreKpiEventName, string>;

const CORE_EVENT_REQUIRED_ANY_OF: Partial<
  Record<TCoreKpiEventName, readonly (readonly string[])[]>
> = {
  // Section 6 requires one stable initial-payment correlation key. The
  // canonical KPI module keeps both fields optional because the source varies
  // by Stripe payment path; this rule preserves the PRD's either/or contract.
  purchase_confirmed: [['stripeCheckoutSessionId', 'invoiceId']],
};

const CORE_PROPERTY_DEFINITIONS = {
  account_created: {
    required: {
      method: property('string', 'Authentication or account-creation method.', 'email'),
      pricingRegion: property('string', 'Normalized pricing region.', 'standard'),
      utmSource: property('string', 'Normalized first-touch source or null.', null, true),
      utmMedium: property('string', 'Normalized first-touch medium or null.', null, true),
      utmCampaign: property('string', 'Normalized first-touch campaign or null.', null, true),
      attributionAvailable: property(
        'boolean',
        'Whether first-touch attribution was captured.',
        true
      ),
    },
    optional: {},
  },
  monetization_surface_shown: {
    required: {
      surface: property('string', 'Allowlisted rendered monetization surface.', 'credit_wall'),
      trigger: property(
        'string',
        'Action or state that caused the surface to render.',
        'out_of_credits'
      ),
      offerType: property('string', 'Offer family shown to the user.', 'credit_pack'),
      priceId: property(
        'identifier',
        'Stripe price identifier for the shown offer.',
        'price_example'
      ),
      priceCents: property('integer', 'Displayed price in integer cents.', 499),
      pricingRegion: property('string', 'Normalized pricing region.', 'standard'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered purchase attempt.',
        'funnel_example'
      ),
    },
    optional: {
      experimentAssignmentKey: property(
        'identifier',
        'Stable non-user experiment assignment key.',
        'arm_example'
      ),
    },
  },
  monetization_surface_clicked: {
    required: {
      surface: property('string', 'Allowlisted monetization surface.', 'credit_wall'),
      trigger: property(
        'string',
        'Action or state that caused the surface to render.',
        'out_of_credits'
      ),
      cta: property('string', 'Allowlisted CTA activated by the user.', 'buy_credits'),
      destination: property('string', 'Next checkout destination.', 'checkout_direct'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered purchase attempt.',
        'funnel_example'
      ),
    },
    optional: {
      experimentAssignmentKey: property(
        'identifier',
        'Stable non-user experiment assignment key.',
        'arm_example'
      ),
    },
  },
  plan_selected: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'credit_pack'),
      planOrPack: property('string', 'Allowlisted plan or credit-pack key.', 'starter_pack'),
      priceId: property('identifier', 'Stripe price identifier.', 'price_example'),
      priceCents: property('integer', 'Displayed price in integer cents.', 499),
      pricingRegion: property('string', 'Normalized pricing region.', 'standard'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered purchase attempt.',
        'funnel_example'
      ),
    },
    optional: {},
  },
  checkout_opened: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'credit_pack'),
      priceId: property('identifier', 'Stripe price identifier.', 'price_example'),
      entrySurface: property('string', 'Surface that opened checkout.', 'credit_wall'),
      trigger: property('string', 'Original purchase trigger.', 'out_of_credits'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered purchase attempt.',
        'funnel_example'
      ),
      uiMode: property('string', 'Checkout presentation mode.', 'hosted'),
    },
    optional: {},
  },
  checkout_error: {
    required: {
      errorType: property(
        'string',
        'Bounded client checkout error type.',
        'session_creation_failed'
      ),
      failurePoint: property(
        'string',
        'Bounded checkout step where the error occurred.',
        'session_request'
      ),
      priceId: property('identifier', 'Stripe price identifier.', 'price_example'),
      uiMode: property('string', 'Checkout presentation mode.', 'embedded'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered purchase attempt.',
        'funnel_example'
      ),
      retryable: property('boolean', 'Whether retrying the same path is expected to help.', true),
    },
    optional: {},
  },
  image_upscaled: {
    required: {
      qualityTier: property('string', 'Allowlisted quality or model tier.', 'high'),
      scaleFactor: property('number', 'Applied image scale factor.', 2),
      inputWidth: property('integer', 'Input width in pixels.', 1000),
      inputHeight: property('integer', 'Input height in pixels.', 800),
      outputWidth: property('integer', 'Output width in pixels.', 2000),
      outputHeight: property('integer', 'Output height in pixels.', 1600),
      fileType: property('string', 'Normalized MIME family or allowlisted extension.', 'jpeg'),
      fileSizeBucket: property('string', 'Allowlisted input-size bucket.', '1-5MB'),
      durationMs: property('integer', 'Terminal processing duration in milliseconds.', 4200),
    },
    optional: {},
  },
  processing_failed: {
    required: {
      errorType: property('string', 'Bounded processing error type.', 'provider_error'),
      reason: property('string', 'Bounded processing failure reason.', 'upstream_unavailable'),
      provider: property('string', 'Allowlisted image-processing provider.', 'replicate'),
      qualityTier: property('string', 'Allowlisted quality or model tier.', 'high'),
      retryable: property('boolean', 'Whether retrying is expected to help.', true),
      durationMs: property('integer', 'Terminal processing duration in milliseconds.', 12000),
      requestId: property(
        'identifier',
        'Stable request correlation identifier.',
        'request_example'
      ),
    },
    optional: {},
  },
  checkout_completed: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'subscription'),
      sessionId: property('identifier', 'Stripe Checkout session identifier.', 'cs_example'),
      amountCents: property('integer', 'Checkout amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      paymentStatus: property('string', 'Checkout payment status at completion.', 'paid'),
      pricingRegion: property('string', 'Normalized pricing region.', 'standard'),
    },
    optional: {},
  },
  purchase_confirmed: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'subscription'),
      amountCents: property('integer', 'Confirmed charge amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      priceId: property('identifier', 'Stripe price identifier.', 'price_example'),
    },
    optional: {
      stripeCheckoutSessionId: property(
        'identifier',
        'Stripe Checkout session correlation key.',
        'cs_example'
      ),
      invoiceId: property('identifier', 'Stripe invoice correlation key.', 'in_example'),
      sourceObjectId: property(
        'identifier',
        'Stable source object used for deduplication.',
        'pi_example'
      ),
    },
  },
  revenue_received: {
    required: {
      $revenue: property('number', 'Amplitude Revenue value in dollars.', 9.99),
      $productId: property('identifier', 'Amplitude product identifier.', 'price_example'),
      $quantity: property('integer', 'Revenue quantity.', 1),
      $revenueType: property(
        'string',
        'Initial, renewal, or other allowlisted revenue type.',
        'initial'
      ),
      amountCents: property('integer', 'Recognized amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      sourceObjectId: property(
        'identifier',
        'Stable source object used for deduplication.',
        'pi_example'
      ),
    },
    optional: {},
  },
  subscription_created: {
    required: {
      plan: property('string', 'Allowlisted subscription plan.', 'pro'),
      amountCents: property('integer', 'Subscription amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      billingInterval: property('string', 'Subscription billing interval.', 'month'),
      status: property('string', 'Accepted subscription state.', 'active'),
      subscriptionId: property('identifier', 'Stripe subscription correlation key.', 'sub_example'),
    },
    optional: {},
  },
  subscription_renewed: {
    required: {
      plan: property('string', 'Allowlisted subscription plan.', 'pro'),
      amountCents: property('integer', 'Renewal amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      subscriptionId: property('identifier', 'Stripe subscription correlation key.', 'sub_example'),
      invoiceId: property('identifier', 'Stripe invoice correlation key.', 'in_example'),
      creditsAdded: property('integer', 'Credits granted by the renewal.', 100),
    },
    optional: {},
  },
  subscription_cancel_scheduled: {
    required: {
      plan: property('string', 'Allowlisted subscription plan.', 'pro'),
      subscriptionId: property('identifier', 'Stripe subscription correlation key.', 'sub_example'),
      effectiveAt: property(
        'timestamp',
        'When access is scheduled to end.',
        '2026-09-01T00:00:00.000Z'
      ),
      reasonCategory: property(
        'string',
        'Allowlisted cancellation reason category.',
        'too_expensive'
      ),
      reasonSource: property('string', 'Allowlisted reason source.', 'in_app'),
    },
    optional: {},
  },
  subscription_cancel_reversed: {
    required: {
      plan: property('string', 'Allowlisted subscription plan.', 'pro'),
      subscriptionId: property('identifier', 'Stripe subscription correlation key.', 'sub_example'),
      reversedAt: property(
        'timestamp',
        'When scheduled cancellation was reversed.',
        '2026-08-15T12:00:00.000Z'
      ),
    },
    optional: {},
  },
  subscription_canceled: {
    required: {
      plan: property('string', 'Allowlisted subscription plan.', 'pro'),
      subscriptionId: property('identifier', 'Stripe subscription correlation key.', 'sub_example'),
      effectiveAt: property('timestamp', 'When access ended.', '2026-09-01T00:00:00.000Z'),
      reasonCategory: property('string', 'Allowlisted cancellation reason category.', 'not_using'),
      reasonSource: property('string', 'Allowlisted reason source.', 'stripe'),
    },
    optional: {},
  },
  payment_failed: {
    required: {
      errorType: property('string', 'Bounded payment failure type.', 'card_declined'),
      attemptCount: property('integer', 'Number of payment attempts observed.', 1),
      customerId: property('identifier', 'Stripe customer correlation key.', 'cus_example'),
      sourceObjectId: property('identifier', 'Stable failed-payment source object.', 'pi_example'),
    },
    optional: {},
  },
  payment_recovery_started: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'subscription'),
      failureType: property('string', 'Bounded original payment failure type.', 'card_declined'),
      recoveryChannel: property('string', 'Allowlisted recovery channel.', 'email'),
      funnelAttemptId: property(
        'identifier',
        'Stable ID joining one ordered recovery attempt.',
        'funnel_example'
      ),
    },
    optional: {},
  },
  payment_recovered: {
    required: {
      purchaseType: property('string', 'Purchase family.', 'subscription'),
      amountCents: property('integer', 'Recovered amount in integer cents.', 999),
      currency: property('string', 'Lowercase ISO currency.', 'usd'),
      sourceObjectId: property(
        'identifier',
        'Stable recovered-payment source object.',
        'pi_recovered'
      ),
      originalFailureObjectId: property(
        'identifier',
        'Stable original failed-payment object.',
        'pi_failed'
      ),
      recoveryChannel: property('string', 'Allowlisted recovery channel.', 'email'),
    },
    optional: {},
  },
} satisfies Record<TCoreKpiEventName, ICorePropertySpecs>;

function withRequiredFlag(
  specifications: Record<string, IAmplitudePropertySpec>,
  required: boolean
): Record<string, IAmplitudePropertyDefinition> {
  return Object.fromEntries(
    Object.entries(specifications).map(([name, specification]) => [
      name,
      {
        ...specification,
        required,
        nullable: specification.nullable ?? false,
      },
    ])
  );
}

function buildExample(specifications: ICorePropertySpecs): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({ ...specifications.required, ...specifications.optional }).map(
      ([name, specification]) => [name, specification.example]
    )
  );
}

export function buildCoreAmplitudeSchema(): ICoreAmplitudeEventSchema[] {
  return CORE_KPI_EVENT_DEFINITIONS.map(definition => {
    const specifications = CORE_PROPERTY_DEFINITIONS[definition.eventName];
    return {
      eventName: definition.eventName,
      description: definition.description,
      category: CORE_EVENT_CATEGORIES[definition.eventName],
      owner: definition.owner,
      source: definition.source,
      status: definition.status,
      kpiRole: definition.kpiRole,
      requiredProperties: [...definition.requiredProperties],
      optionalProperties: [...definition.optionalProperties],
      requiredAnyOf: [...(CORE_EVENT_REQUIRED_ANY_OF[definition.eventName] ?? [])],
      properties: {
        ...withRequiredFlag(specifications.required, true),
        ...withRequiredFlag(specifications.optional, false),
      },
      example: buildExample(specifications),
      official: false,
    };
  });
}

export const CORE_AMPLITUDE_SCHEMA = buildCoreAmplitudeSchema();

export const CORE_AMPLITUDE_SCHEMA_DOCUMENT: ICoreAmplitudeSchemaDocument = {
  schemaVersion: CORE_AMPLITUDE_SCHEMA_VERSION,
  source: 'server/analytics/coreKpiDefinitions.ts + PRD section 6',
  releaseAnnotation: CORE_KPI_RELEASE_ANNOTATION,
  mode: 'test',
  reconciliationVerified: false,
  observationWindowDays: 0,
  liveValidation: {
    status: 'not_run',
    note: 'No Amplitude Data export or live API call was supplied; this is repository-only validation.',
  },
  events: CORE_AMPLITUDE_SCHEMA,
};

export interface ICoreAmplitudeSchemaValidationIssue {
  path: string;
  message: string;
}

export interface ICoreAmplitudeSchemaValidationResult {
  valid: boolean;
  eventCount: number;
  propertyCount: number;
  issues: ICoreAmplitudeSchemaValidationIssue[];
  observationWindowDays: number;
  officialEventCount: number;
  dashboardDefinitions: readonly IDashboardCanonicalDefinition[];
}

export interface ICoreAmplitudeSchemaValidationOptions {
  requireSevenDayObservation?: boolean;
  requireOfficialEvents?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addDocumentValidationIssues(
  document: Record<string, unknown>,
  issues: ICoreAmplitudeSchemaValidationIssue[]
): void {
  if (document.schemaVersion !== CORE_AMPLITUDE_SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `must equal ${CORE_AMPLITUDE_SCHEMA_VERSION}.`,
    });
  }
  if (!isRecord(document.releaseAnnotation)) {
    issues.push({
      path: 'releaseAnnotation',
      message: 'must include the corrected-release annotation.',
    });
  } else if (
    document.releaseAnnotation.releaseDate !== CORE_KPI_RELEASE_ANNOTATION.releaseDate ||
    document.releaseAnnotation.preReleaseInterval !== CORE_KPI_RELEASE_ANNOTATION.preReleaseInterval
  ) {
    issues.push({
      path: 'releaseAnnotation',
      message: 'does not match the canonical corrected-release annotation.',
    });
  }
  if (typeof document.source !== 'string' || document.source.trim().length === 0) {
    issues.push({ path: 'source', message: 'must be a non-empty string.' });
  }
  if (
    document.reconciliationVerified !== undefined &&
    typeof document.reconciliationVerified !== 'boolean'
  ) {
    issues.push({
      path: 'reconciliationVerified',
      message: 'must be a boolean when supplied.',
    });
  }
  if (
    document.observationWindowDays !== undefined &&
    (typeof document.observationWindowDays !== 'number' ||
      !Number.isFinite(document.observationWindowDays) ||
      document.observationWindowDays < 0)
  ) {
    issues.push({
      path: 'observationWindowDays',
      message: 'must be a finite non-negative number when supplied.',
    });
  }
  if (!isRecord(document.liveValidation)) {
    issues.push({
      path: 'liveValidation',
      message: 'must include status and note metadata.',
    });
  } else {
    if (
      !['not_run', 'provided_unverified', 'verified'].includes(
        String(document.liveValidation.status)
      )
    ) {
      issues.push({
        path: 'liveValidation.status',
        message: 'must be not_run, provided_unverified, or verified.',
      });
    }
    if (typeof document.liveValidation.note !== 'string') {
      issues.push({ path: 'liveValidation.note', message: 'must be a string.' });
    }
  }
}

function getInputEvents(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (isRecord(input) && Array.isArray(input.events)) return input.events;
  return [];
}

function sameStringArray(actual: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function normalizeRequiredAnyOf(value: unknown): string[][] | null {
  if (!Array.isArray(value)) return null;
  if (
    !value.every(
      group => Array.isArray(group) && group.every(propertyName => typeof propertyName === 'string')
    )
  ) {
    return null;
  }
  return value.map(group => [...group] as string[]);
}

function matchesExampleType(
  value: unknown,
  type: TAmplitudePropertyType,
  nullable: boolean
): boolean {
  if (value === null) return nullable;
  if (type === 'string' || type === 'identifier' || type === 'timestamp') {
    return (
      typeof value === 'string' && (type !== 'timestamp' || Number.isFinite(Date.parse(value)))
    );
  }
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return typeof value === 'boolean';
}

function getExpectedAnyOf(eventName: TCoreKpiEventName): readonly (readonly string[])[] {
  return CORE_EVENT_REQUIRED_ANY_OF[eventName] ?? [];
}

function validateEvent(
  event: Record<string, unknown>,
  canonical: (typeof CORE_KPI_EVENT_DEFINITIONS)[number],
  issues: ICoreAmplitudeSchemaValidationIssue[]
): number {
  const eventName = canonical.eventName;
  const path = `events[${eventName}]`;
  const add = (message: string, field = '') => {
    issues.push({ path: field ? `${path}.${field}` : path, message });
  };

  for (const field of ['description', 'category', 'owner', 'source', 'status', 'kpiRole']) {
    if (typeof event[field] !== 'string') add('must be a string.', field);
  }
  if (event.description !== canonical.description)
    add('does not match the canonical description.', 'description');
  if (event.owner !== canonical.owner) add('does not match the canonical owner.', 'owner');
  if (event.source !== canonical.source) add('does not match the canonical source.', 'source');
  if (event.status !== canonical.status) add('does not match the canonical status.', 'status');
  if (event.kpiRole !== canonical.kpiRole) add('does not match the canonical KPI role.', 'kpiRole');
  if (event.category !== CORE_EVENT_CATEGORIES[eventName])
    add('does not match the event category.', 'category');

  if (!sameStringArray(event.requiredProperties, canonical.requiredProperties)) {
    add('must match the canonical required property list.', 'requiredProperties');
  }
  if (!sameStringArray(event.optionalProperties, canonical.optionalProperties)) {
    add('must match the canonical optional property list.', 'optionalProperties');
  }

  const expectedAnyOf = getExpectedAnyOf(eventName).map(group => [...group]);
  const actualAnyOf = normalizeRequiredAnyOf(event.requiredAnyOf);
  if (actualAnyOf === null || JSON.stringify(actualAnyOf) !== JSON.stringify(expectedAnyOf)) {
    add('must match the PRD alternate-required property rules.', 'requiredAnyOf');
  }

  const properties = isRecord(event.properties) ? event.properties : null;
  if (!properties) {
    add('must be an object containing property definitions.', 'properties');
    return 0;
  }

  const expectedPropertyNames = [
    ...canonical.requiredProperties,
    ...canonical.optionalProperties,
  ].sort();
  const actualPropertyNames = Object.keys(properties).sort();
  if (JSON.stringify(actualPropertyNames) !== JSON.stringify(expectedPropertyNames)) {
    add('must contain exactly the canonical required and optional properties.', 'properties');
  }

  const example = isRecord(event.example) ? event.example : null;
  if (!example) add('must be an object with representative property values.', 'example');

  let propertyCount = 0;
  for (const propertyName of expectedPropertyNames) {
    const propertyDefinition = properties[propertyName];
    if (!isRecord(propertyDefinition)) {
      add('must contain a property schema object.', `properties.${propertyName}`);
      continue;
    }
    propertyCount += 1;
    const isRequired = canonical.requiredProperties.includes(propertyName);
    if (propertyDefinition.required !== isRequired) {
      add(`must have required=${String(isRequired)}.`, `properties.${propertyName}.required`);
    }
    if (typeof propertyDefinition.type !== 'string') {
      add('must declare a property type.', `properties.${propertyName}.type`);
      continue;
    }
    const allowedTypes: readonly string[] = [
      'string',
      'number',
      'integer',
      'boolean',
      'identifier',
      'timestamp',
    ];
    if (!allowedTypes.includes(propertyDefinition.type)) {
      add('uses an unsupported property type.', `properties.${propertyName}.type`);
    }
    if (
      typeof propertyDefinition.description !== 'string' ||
      propertyDefinition.description.length === 0
    ) {
      add(
        'must include a non-empty property description.',
        `properties.${propertyName}.description`
      );
    }
    if (typeof propertyDefinition.nullable !== 'boolean') {
      add('must declare whether the property is nullable.', `properties.${propertyName}.nullable`);
    }
    if (!Object.prototype.hasOwnProperty.call(propertyDefinition, 'example')) {
      add('must include an example value.', `properties.${propertyName}.example`);
    } else if (
      typeof propertyDefinition.type === 'string' &&
      allowedTypes.includes(propertyDefinition.type) &&
      typeof propertyDefinition.nullable === 'boolean' &&
      !matchesExampleType(
        propertyDefinition.example,
        propertyDefinition.type as TAmplitudePropertyType,
        propertyDefinition.nullable
      )
    ) {
      add('example does not match its declared type.', `properties.${propertyName}.example`);
    }
    if (
      example &&
      canonical.requiredProperties.includes(propertyName) &&
      !Object.prototype.hasOwnProperty.call(example, propertyName)
    ) {
      add('event example must include this required property.', `example.${propertyName}`);
    }
  }

  for (const group of expectedAnyOf) {
    if (
      !example ||
      !group.some(propertyName => Object.prototype.hasOwnProperty.call(example, propertyName))
    ) {
      add(`event example must include one of: ${group.join(', ')}.`, 'example');
    }
  }

  return propertyCount;
}

export function validateCoreAmplitudeSchema(
  input: TCoreAmplitudeSchemaInput = CORE_AMPLITUDE_SCHEMA_DOCUMENT,
  options: ICoreAmplitudeSchemaValidationOptions = {}
): ICoreAmplitudeSchemaValidationResult {
  const issues: ICoreAmplitudeSchemaValidationIssue[] = [];
  const rawEvents = getInputEvents(input);
  const document = !Array.isArray(input) && isRecord(input) ? input : undefined;
  if (document) addDocumentValidationIssues(document, issues);
  const eventNames = rawEvents.map(event => (isRecord(event) ? event.eventName : undefined));
  rawEvents.forEach((event, index) => {
    if (!isRecord(event) || typeof event.eventName !== 'string' || event.eventName.length === 0) {
      issues.push({
        path: `events[${index}].eventName`,
        message: 'must be a non-empty event name.',
      });
    }
  });
  const duplicateNames = eventNames.filter(
    (eventName, index) => typeof eventName === 'string' && eventNames.indexOf(eventName) !== index
  );
  for (const duplicateName of [...new Set(duplicateNames)]) {
    issues.push({ path: 'events', message: `contains duplicate event ${duplicateName}.` });
  }

  const canonicalNames = [...CORE_KPI_EVENT_NAMES];
  const extraNames = eventNames.filter(
    (eventName): eventName is string =>
      typeof eventName === 'string' && !canonicalNames.includes(eventName as TCoreKpiEventName)
  );
  for (const extraName of [...new Set(extraNames)]) {
    issues.push({ path: `events[${extraName}]`, message: 'is not in PRD section 6.' });
  }
  for (const canonical of CORE_KPI_EVENT_DEFINITIONS) {
    const matchingEvent = rawEvents.find(
      event => isRecord(event) && event.eventName === canonical.eventName
    );
    if (!matchingEvent) {
      issues.push({
        path: 'events',
        message: `is missing canonical event ${canonical.eventName}.`,
      });
      continue;
    }
    validateEvent(matchingEvent, canonical, issues);
  }

  const propertyCount = rawEvents.reduce((count, event) => {
    if (!isRecord(event) || !isRecord(event.properties)) return count;
    return count + Object.keys(event.properties).length;
  }, 0);

  const observationWindowDays =
    typeof document?.observationWindowDays === 'number' && document.observationWindowDays >= 0
      ? document.observationWindowDays
      : 0;
  const officialEventCount = rawEvents.filter(
    event => isRecord(event) && event.official === true
  ).length;
  if (options.requireSevenDayObservation && observationWindowDays < 7) {
    issues.push({
      path: 'observationWindowDays',
      message: 'must be at least seven days for current-event validation.',
    });
  }
  if (options.requireOfficialEvents && officialEventCount < CORE_KPI_EVENT_NAMES.length) {
    issues.push({
      path: 'events',
      message:
        'every core event must be marked official after reconciliation and observation pass.',
    });
  }
  if (options.requireOfficialEvents) {
    if (document?.reconciliationVerified !== true) {
      issues.push({
        path: 'reconciliationVerified',
        message: 'must be true before core events can be marked official.',
      });
    }
    if (!isRecord(document?.liveValidation) || document.liveValidation.status !== 'verified') {
      issues.push({
        path: 'liveValidation.status',
        message: 'must be verified before core events can be marked official.',
      });
    }
  }

  return {
    valid: issues.length === 0,
    eventCount: rawEvents.length,
    propertyCount,
    issues,
    observationWindowDays,
    officialEventCount,
    dashboardDefinitions: DASHBOARD_CANONICAL_DEFINITIONS,
  };
}

export function assertValidCoreAmplitudeSchema(
  input: TCoreAmplitudeSchemaInput = CORE_AMPLITUDE_SCHEMA_DOCUMENT
): ICoreAmplitudeSchemaValidationResult {
  const result = validateCoreAmplitudeSchema(input);
  if (!result.valid) {
    throw new Error(
      `Core Amplitude schema is invalid:\n${result.issues
        .map(issue => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`
    );
  }
  return result;
}

export interface ICoreAmplitudeSchemaCliOptions {
  inputPath?: string;
  json: boolean;
  mode?: TEnvironmentMode;
  allowLiveRead: boolean;
  template: boolean;
  requireSevenDayObservation: boolean;
  requireOfficialEvents: boolean;
  help: boolean;
}

function printHelp(): void {
  console.log(`Usage: npx tsx scripts/validate-core-amplitude-schema.ts --mode test|live [options]

Validates the local PRD section 6 schema against the canonical KPI module.
It never calls Amplitude or any production API.
Options:
  --input <path>  Validate a local JSON schema document instead of the repository definition
  --json          Print machine-readable validation output
  --template       Print the local schema/dashboard template without external validation
  --allow-live-read  Required acknowledgment for a live-labeled local input
  --require-seven-day-observation  Require the PRD's seven-day observation gate
  --require-official-events  Require every core event to be marked official
  --help          Show this help`);
}

export function parseCliArgs(argv: string[]): ICoreAmplitudeSchemaCliOptions {
  let inputPath: string | undefined;
  let json = false;
  let mode: TEnvironmentMode | undefined;
  let allowLiveRead = false;
  let template = false;
  let requireSevenDayObservation = false;
  let requireOfficialEvents = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (argument === '--json') {
      json = true;
      continue;
    }
    if (argument === '--mode') {
      const value = argv[index + 1];
      if (value !== 'test' && value !== 'live') throw new Error('--mode must be test or live.');
      mode = value;
      index += 1;
      continue;
    }
    if (argument === '--input') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--input requires a local JSON path.');
      inputPath = value;
      index += 1;
      continue;
    }
    if (argument === '--template') {
      template = true;
      continue;
    }
    if (argument === '--allow-live-read') {
      allowLiveRead = true;
      continue;
    }
    if (argument === '--require-seven-day-observation') {
      requireSevenDayObservation = true;
      continue;
    }
    if (argument === '--require-official-events') {
      requireOfficialEvents = true;
      continue;
    }
    throw new Error(`Unknown argument ${argument}. Use --help for usage.`);
  }

  if (!help) {
    assertReadOnlyMode({ mode, allowLiveRead });
    if (template && inputPath) throw new Error('Choose either --template or --input, not both.');
  }

  return {
    inputPath,
    json,
    mode,
    allowLiveRead,
    template,
    requireSevenDayObservation,
    requireOfficialEvents,
    help,
  };
}

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.template) {
    console.log(
      JSON.stringify(
        {
          source: 'local_template',
          readOnly: true,
          mode: options.mode,
          schema: CORE_AMPLITUDE_SCHEMA_DOCUMENT,
          dashboardDefinitions: DASHBOARD_CANONICAL_DEFINITIONS,
        },
        null,
        2
      )
    );
    return;
  }

  const input = options.inputPath
    ? (JSON.parse(await readFile(options.inputPath, 'utf8')) as TCoreAmplitudeSchemaInput)
    : CORE_AMPLITUDE_SCHEMA_DOCUMENT;
  if (isRecord(input) && input.mode !== undefined && input.mode !== options.mode) {
    throw new Error('Input mode must exactly match the explicit CLI --mode value.');
  }
  const result = validateCoreAmplitudeSchema(input, {
    requireSevenDayObservation: options.requireSevenDayObservation,
    requireOfficialEvents: options.requireOfficialEvents,
  });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.valid) {
    console.log(
      `Core Amplitude schema valid: ${result.eventCount} events, ${result.propertyCount} properties.`
    );
  } else {
    console.error(result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'));
  }
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message =
      error instanceof Error ? error.message : 'Unable to validate core Amplitude schema.';
    console.error(message);
    process.exit(1);
  });
}
