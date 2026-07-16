import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import dayjs from 'dayjs';
import { serverEnv } from '@shared/config/env';
import { getEmailService } from '@server/services/email.service';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const CAMPAIGN_KEY = 'checkout-abandoned-24h';
const TEMPLATE_NAME = 'checkout-recovery';
const VERIFIER = 'controlled_delivery_self_verify';
const CTA_DESTINATION = '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned';

interface IControlledDeliveryArgs {
  send: boolean;
  keepRows: boolean;
  userId?: string;
  email?: string;
}

export interface IControlledDeliveryQueuePayload {
  campaign_key: string;
  user_id: string;
  recipient_email: string;
  scheduled_for: string;
  status: 'sent';
  sent_at: string;
  template_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function parseControlledDeliveryArgs(argv: string[]): IControlledDeliveryArgs {
  return {
    send: argv.includes('--send'),
    keepRows: argv.includes('--keep-rows'),
    userId: getArgValue(argv, '--user-id'),
    email: getArgValue(argv, '--email'),
  };
}

export function assertControlledDeliveryArgs(args: IControlledDeliveryArgs): void {
  if (!args.send) {
    throw new Error(
      'Refusing to send email. Re-run with --send --user-id <test-user-id> --email <test-recipient> for a controlled account.'
    );
  }
  if (!args.userId) {
    throw new Error('--user-id is required for controlled recovery delivery verification');
  }
  if (!args.email) {
    throw new Error('--email is required so the controlled recipient is explicit');
  }
}

export function assertControlledDeliveryProvider(provider: string | undefined): void {
  if (provider !== 'brevo') {
    throw new Error('Controlled marketing delivery did not use Brevo');
  }
}

interface IClickRouteResponse {
  status: number;
  headers: Pick<Headers, 'get'>;
}

type ControlledClickFetcher = (
  input: string,
  init: { redirect: 'manual' }
) => Promise<IClickRouteResponse>;

export function assertControlledClickResponse(response: IClickRouteResponse): string {
  const redirectUrl = response.headers.get('location');
  if (
    response.status !== 302 ||
    !redirectUrl ||
    !redirectUrl.includes('utm_source=email') ||
    !redirectUrl.includes(CAMPAIGN_KEY)
  ) {
    throw new Error('Controlled signed click route did not return the attributed redirect');
  }
  return redirectUrl;
}

export async function requestControlledClickRoute(
  clickUrl: string,
  fetcher: ControlledClickFetcher = fetch,
  baseUrl: string = serverEnv.BASE_URL
): Promise<string> {
  const response = await fetcher(new URL(clickUrl, baseUrl).toString(), {
    redirect: 'manual',
  });
  return assertControlledClickResponse(response);
}

export function assertVerifierCleanupResult(
  operation: string,
  error: { message?: string } | null,
  remainingCount?: number | null
): void {
  if (error) {
    throw new Error(
      `Controlled verifier cleanup failed during ${operation}: ${error.message ?? 'unknown error'}`
    );
  }
  if (remainingCount !== undefined && remainingCount !== null && remainingCount !== 0) {
    throw new Error(`Controlled verifier cleanup left a remaining row after ${operation}`);
  }
}

export function buildDeliveryClickUrl(params: {
  queueId: string;
  destination?: string;
  token: string;
}): string {
  const destination = params.destination ?? CTA_DESTINATION;
  return `/api/email/click?q=${encodeURIComponent(params.queueId)}&url=${encodeURIComponent(destination)}&token=${params.token}`;
}

export function buildControlledDeliveryQueuePayload(params: {
  runId: string;
  userId: string;
  email: string;
  clickUrl: string;
}): IControlledDeliveryQueuePayload {
  const now = dayjs().toISOString();
  return {
    campaign_key: CAMPAIGN_KEY,
    user_id: params.userId,
    recipient_email: params.email,
    scheduled_for: now,
    status: 'sent',
    sent_at: now,
    template_data: {
      ctaUrl: params.clickUrl,
      preferenceUrl: '/dashboard/settings',
      recoveryAudience: 'checkout_abandoner',
    },
    metadata: {
      verifier: VERIFIER,
      verifier_run_id: params.runId,
      audience_key: 'checkout_abandoner',
      cta_destination: CTA_DESTINATION,
    },
  };
}

function getArgValue(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = argv.find(arg => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = argv.indexOf(name);
  if (index >= 0) return argv[index + 1];

  return undefined;
}

async function requireCampaignSeed(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('email_lifecycle_campaigns')
    .select('key, enabled, template_name')
    .eq('key', CAMPAIGN_KEY)
    .maybeSingle();
  if (error) throw new Error(`Failed to check recovery campaign seed: ${error.message}`);
  if (!data) throw new Error(`Missing recovery campaign seed: ${CAMPAIGN_KEY}`);
  if (data.template_name !== TEMPLATE_NAME) {
    throw new Error(`Unexpected recovery campaign template: ${String(data.template_name)}`);
  }
}

async function insertSentQueueRow(payload: IControlledDeliveryQueuePayload): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('email_lifecycle_queue')
    .insert(payload)
    .select('id')
    .single();
  if (error || !data?.id) {
    throw new Error(`Failed to create controlled delivery queue row: ${error?.message}`);
  }
  return String(data.id);
}

async function recordSentEvent(params: {
  queueId: string;
  userId: string;
  messageId?: string;
  provider?: string;
  runId: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from('email_lifecycle_events').insert({
    queue_id: params.queueId,
    user_id: params.userId,
    campaign_key: CAMPAIGN_KEY,
    event_type: 'sent',
    metadata: {
      verifier: VERIFIER,
      verifier_run_id: params.runId,
      provider: params.provider,
      messageId: params.messageId,
    },
  });
  if (error) throw new Error(`Failed to record controlled sent event: ${error.message}`);
}

async function countVerifierEvents(queueId: string): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin
    .from('email_lifecycle_events')
    .select('event_type')
    .eq('queue_id', queueId);
  if (error) throw new Error(`Failed to inspect controlled lifecycle events: ${error.message}`);

  return (data || []).reduce<Record<string, number>>((counts, row) => {
    const eventType = String(row.event_type);
    counts[eventType] = (counts[eventType] || 0) + 1;
    return counts;
  }, {});
}

async function cleanupVerifierRows(queueId?: string): Promise<void> {
  if (!queueId) return;
  const eventDelete = await supabaseAdmin
    .from('email_lifecycle_events')
    .delete()
    .eq('queue_id', queueId);
  assertVerifierCleanupResult('event deletion', eventDelete.error);

  const queueDelete = await supabaseAdmin.from('email_lifecycle_queue').delete().eq('id', queueId);
  assertVerifierCleanupResult('queue deletion', queueDelete.error);

  const [eventCheck, queueCheck] = await Promise.all([
    supabaseAdmin
      .from('email_lifecycle_events')
      .select('id', { count: 'exact', head: true })
      .eq('queue_id', queueId),
    supabaseAdmin
      .from('email_lifecycle_queue')
      .select('id', { count: 'exact', head: true })
      .eq('id', queueId),
  ]);
  assertVerifierCleanupResult('event verification', eventCheck.error, eventCheck.count);
  assertVerifierCleanupResult('queue verification', queueCheck.error, queueCheck.count);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(`Usage: yarn recovery:delivery:check -- --send --user-id <test-user-id> --email <test-recipient>

Controlled provider delivery and click-attribution verification for recovery email.
This sends exactly one checkout recovery email to the explicit test recipient, creates one
tagged lifecycle queue row for click attribution, records a sent event, verifies the click
service records clicked/returned events, and removes verifier queue/event rows unless
--keep-rows is set. Provider email_logs are left as delivery evidence.

Options:
  --send          Required. Allows one controlled email send.
  --user-id <id>  Required controlled test user id.
  --email <to>    Required explicit test recipient.
  --keep-rows     Keep verifier queue/event rows for manual inspection.
  --help          Show this help text.
`);
    return;
  }

  const args = parseControlledDeliveryArgs(process.argv.slice(2));
  assertControlledDeliveryArgs(args);

  const userId = args.userId as string;
  const email = args.email as string;
  const runId = `recovery-delivery-${randomUUID()}`;
  const lifecycleService = getEmailLifecycleService();
  let queueId: string | undefined;

  try {
    await requireCampaignSeed();

    queueId = await insertSentQueueRow(
      buildControlledDeliveryQueuePayload({
        runId,
        userId,
        email,
        clickUrl: '/api/email/click?pending=controlled-delivery-verifier',
      })
    );
    const token = lifecycleService.createClickToken(queueId, CTA_DESTINATION);
    const clickUrl = buildDeliveryClickUrl({ queueId, token });
    await supabaseAdmin
      .from('email_lifecycle_queue')
      .update({
        template_data: {
          ctaUrl: clickUrl,
          preferenceUrl: '/dashboard/settings',
          recoveryAudience: 'checkout_abandoner',
        },
      })
      .eq('id', queueId);

    const sendResult = await getEmailService().send({
      to: email,
      template: TEMPLATE_NAME,
      type: 'marketing',
      userId,
      data: {
        ctaUrl: clickUrl,
        preferenceUrl: '/dashboard/settings',
        recoveryAudience: 'checkout_abandoner',
      },
    });

    if (sendResult.skipped) {
      throw new Error('Controlled recovery email was skipped by provider/preferences');
    }
    assertControlledDeliveryProvider(sendResult.provider);

    await recordSentEvent({
      queueId,
      userId,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      runId,
    });

    const redirectUrl = await requestControlledClickRoute(clickUrl);

    const eventCounts = await countVerifierEvents(queueId);
    for (const eventType of ['sent', 'clicked', 'returned']) {
      if (!eventCounts[eventType]) {
        throw new Error(`Missing controlled lifecycle ${eventType} event`);
      }
    }

    console.log(
      `OK controlled recovery delivery: runId=${runId} queue=${queueId} provider=${sendResult.provider} messageId=${sendResult.messageId} redirect=${redirectUrl}`
    );
  } finally {
    if (!args.keepRows) {
      await cleanupVerifierRows(queueId);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
