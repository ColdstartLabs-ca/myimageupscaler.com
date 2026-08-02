/**
 * Shared retention decision metrics. The retention SQL function and external
 * dashboards must use these names and cohort rules instead of ad-hoc queries.
 */
export const RETENTION_KPI_DEFINITIONS = [
  {
    key: 'eligible_subscribers',
    role: 'denominator',
    description: 'Subscribers assigned to treatment or holdout before a cancellation decision.',
    sourceEvents: [
      'subscription_retention_events.holdout_assigned',
      'subscription_retention_events.offer_shown',
    ],
    formula: 'count distinct subscription_id by variant',
  },
  {
    key: 'effective_churn_30d',
    role: 'primary_leading',
    description: 'Eligible subscribers canceled within 30 days without a subsequent renewal.',
    sourceEvents: [
      'subscription_retention_events.cancellation_completed',
      'subscription_retention_events.later_cancellation',
      'subscription_retention_events.invoice_paid',
    ],
    formula:
      'eligible subscribers with effective churn by day 30 / eligible subscribers mature for 30 days',
  },
  {
    key: 'effective_churn_60d',
    role: 'primary_decision',
    description: 'Eligible subscribers canceled within 60 days without a subsequent renewal.',
    sourceEvents: [
      'subscription_retention_events.cancellation_completed',
      'subscription_retention_events.later_cancellation',
      'subscription_retention_events.invoice_paid',
    ],
    formula:
      'eligible subscribers with effective churn by day 60 / eligible subscribers mature for 60 days',
  },
  {
    key: 'renewal_rate',
    role: 'leading',
    description: 'Eligible subscribers with a paid renewal in the measurement window.',
    sourceEvents: ['subscription_retention_events.invoice_paid'],
    formula: 'eligible subscribers with invoice_paid / eligible subscribers mature for the window',
  },
  {
    key: 'incremental_retained_net_revenue_60d',
    role: 'primary_decision',
    description:
      'Treatment retained revenue minus the holdout revenue expected for the treatment cohort size.',
    sourceEvents: [
      'subscription_retention_events.invoice_paid',
      'subscription_retention_events.refund',
      'subscription_retention_events.chargeback',
    ],
    formula:
      'treatment retained net revenue - treatment eligible count × holdout retained net revenue per eligible subscriber',
  },
  {
    key: 'later_cancellation_rate',
    role: 'guardrail',
    description: 'Cancellation after accepting a retention alternative.',
    sourceEvents: [
      'subscription_retention_events.offer_accepted',
      'subscription_retention_events.later_cancellation',
    ],
    formula: 'later_cancellation count / treatment eligible subscribers',
  },
  {
    key: 'refund_chargeback_rate',
    role: 'guardrail',
    description: 'Refund and chargeback harm after cohort assignment.',
    sourceEvents: [
      'subscription_retention_events.refund',
      'subscription_retention_events.chargeback',
    ],
    formula: '(refund cents + chargeback cents) / retained gross revenue cents',
  },
  {
    key: 'support_complaint_rate',
    role: 'guardrail',
    description: 'Support complaint signal for the retention cohort.',
    sourceEvents: ['email_lifecycle_events.failed'],
    formula: 'complaint events / eligible subscribers',
  },
  {
    key: 'successful_processing_days_before_renewal',
    role: 'product_return',
    description: 'Distinct UTC dates with a successful image result before the next renewal.',
    sourceEvents: ['image_upscaled', 'subscription_retention_events.invoice_paid'],
    formula: 'count distinct user-day(image_upscaled) before first post-assignment renewal',
  },
  {
    key: 'second_successful_job_rate',
    role: 'product_return',
    description: 'Eligible subscribers who complete a second successful processing job.',
    sourceEvents: ['image_upscaled'],
    formula: 'eligible subscribers with at least two image_upscaled events / eligible subscribers',
  },
  {
    key: 'd7_return_rate',
    role: 'product_return',
    description: 'Eligible subscribers with a successful processing event on or after day 7.',
    sourceEvents: ['image_upscaled'],
    formula:
      'eligible subscribers with image_upscaled at day 7 or later / eligible subscribers mature for 7 days',
  },
  {
    key: 'd30_return_rate',
    role: 'product_return',
    description: 'Eligible subscribers with a successful processing event on or after day 30.',
    sourceEvents: ['image_upscaled'],
    formula:
      'eligible subscribers with image_upscaled at day 30 or later / eligible subscribers mature for 30 days',
  },
  {
    key: 'credits_used_before_renewal',
    role: 'product_return',
    description:
      'Credits consumed between retention assignment and the first post-assignment renewal.',
    sourceEvents: ['credits_deducted', 'subscription_retention_events.invoice_paid'],
    formula: 'sum credits_deducted credits before first post-assignment invoice_paid',
  },
] as const;

export type TRetentionKpiKey = (typeof RETENTION_KPI_DEFINITIONS)[number]['key'];

export function getRetentionKpiDefinition(
  key: string
): (typeof RETENTION_KPI_DEFINITIONS)[number] | undefined {
  return RETENTION_KPI_DEFINITIONS.find(definition => definition.key === key);
}
