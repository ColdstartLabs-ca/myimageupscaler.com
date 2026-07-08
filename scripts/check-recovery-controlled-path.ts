import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import dayjs from 'dayjs';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { RevenueRecoveryService } from '@server/services/revenue-recovery.service';

const CHECKOUT_CAMPAIGN_KEY = 'checkout-abandoned-24h';
const CONTROLLED_SOURCE = 'controlled_self_verify';

interface IControlledPathArgs {
  write: boolean;
  keepRows: boolean;
  allowExisting: boolean;
  userId?: string;
  email?: string;
}

export interface IControlledPathQueuePayload {
  campaign_key: string;
  user_id: string;
  recipient_email: string;
  scheduled_for: string;
  status: 'pending';
  template_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export function parseControlledPathArgs(argv: string[]): IControlledPathArgs {
  return {
    write: argv.includes('--write'),
    keepRows: argv.includes('--keep-rows'),
    allowExisting: argv.includes('--allow-existing'),
    userId: getArgValue(argv, '--user-id'),
    email: getArgValue(argv, '--email'),
  };
}

export function assertControlledPathArgs(args: IControlledPathArgs): void {
  if (!args.write) {
    throw new Error(
      'Refusing to mutate data. Re-run with --write --user-id <test-user-id> after confirming this is a controlled test account.'
    );
  }
  if (!args.userId) {
    throw new Error('--user-id is required for controlled recovery path verification');
  }
}

export function buildControlledQueuePayload(params: {
  runId: string;
  userId: string;
  email: string;
}): IControlledPathQueuePayload {
  return {
    campaign_key: CHECKOUT_CAMPAIGN_KEY,
    user_id: params.userId,
    recipient_email: params.email,
    scheduled_for: dayjs().subtract(1, 'minute').toISOString(),
    status: 'pending',
    template_data: {
      ctaUrl: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
      preferenceUrl: '/dashboard/settings',
      recoveryAudience: 'checkout_abandoner',
    },
    metadata: {
      verifier: CONTROLLED_SOURCE,
      verifier_run_id: params.runId,
      audience_key: 'checkout_abandoner',
      cta_destination: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
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
    .select('key, enabled')
    .eq('key', CHECKOUT_CAMPAIGN_KEY)
    .maybeSingle();
  if (error) throw new Error(`Failed to check recovery campaign seed: ${error.message}`);
  if (!data) throw new Error(`Missing recovery campaign seed: ${CHECKOUT_CAMPAIGN_KEY}`);
}

async function resolveVerifiedEmail(userId: string, email?: string): Promise<string> {
  if (email) return email;

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error) throw new Error(`Failed to load controlled auth user: ${error.message}`);

  const user = data.user;
  if (!user?.email || !(user.email_confirmed_at || user.confirmed_at)) {
    throw new Error('Controlled user must have a verified auth email, or pass --email explicitly');
  }
  return user.email;
}

async function assertNoExistingActiveRecovery(
  userId: string,
  allowExisting: boolean
): Promise<void> {
  if (allowExisting) return;

  const { data, error } = await supabaseAdmin
    .from('revenue_recovery_intents')
    .select('id, audience_key, status')
    .eq('user_id', userId)
    .in('status', ['active', 'queued'])
    .limit(5);
  if (error) throw new Error(`Failed to inspect existing recovery intents: ${error.message}`);
  if (data?.length) {
    throw new Error(
      `Controlled user already has ${data.length} active/queued recovery intent(s). Use a clean test account or pass --allow-existing.`
    );
  }
}

async function loadControlledIntent(userId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from('revenue_recovery_intents')
    .select('id, audience_key, source, status, converted_at')
    .eq('user_id', userId)
    .eq('audience_key', 'checkout_abandoner')
    .eq('source', CONTROLLED_SOURCE)
    .maybeSingle();
  if (error) throw new Error(`Failed to inspect controlled recovery intent: ${error.message}`);
  if (!data) throw new Error('Controlled recovery intent was not created');
  return data as Record<string, unknown>;
}

async function cleanupControlledRows(userId: string, queueId?: string): Promise<void> {
  if (queueId) {
    await supabaseAdmin.from('email_lifecycle_queue').delete().eq('id', queueId);
  }
  await supabaseAdmin
    .from('revenue_recovery_intents')
    .delete()
    .eq('user_id', userId)
    .eq('source', CONTROLLED_SOURCE);
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(`Usage: yarn recovery:controlled:check --write --user-id <test-user-id> [options]

Controlled first-party revenue recovery verification. This uses one supplied test account only.
It captures a checkout recovery intent, verifies dry-run eligibility, creates a synthetic pending
recovery queue row, runs purchase conversion/cancellation, verifies converted/cancelled state,
and cleans up verifier rows unless --keep-rows is set.

Options:
  --write           Required. Allows controlled test-account mutations.
  --user-id <id>    Required test profile/auth user id.
  --email <email>   Optional verified recipient email override.
  --allow-existing  Allow active/queued recovery intents on the test user.
  --keep-rows       Keep verifier rows for manual inspection.
  --help            Show this help text.
`);
    return;
  }

  const args = parseControlledPathArgs(process.argv.slice(2));
  assertControlledPathArgs(args);
  const userId = args.userId as string;
  const runId = `recovery-controlled-${randomUUID()}`;
  const service = new RevenueRecoveryService();
  let queueId: string | undefined;

  try {
    await requireCampaignSeed();
    await assertNoExistingActiveRecovery(userId, args.allowExisting);
    const email = await resolveVerifiedEmail(userId, args.email);

    await service.captureAnalyticsIntent({
      userId,
      eventName: 'checkout_opened',
      sessionId: runId,
      properties: {
        selectedType: 'pack',
        selectedKey: 'controlled',
        checkoutTrigger: 'controlled_self_verify',
      },
    });

    await supabaseAdmin
      .from('revenue_recovery_intents')
      .update({
        source: CONTROLLED_SOURCE,
        last_seen_at: dayjs().subtract(25, 'hours').toISOString(),
      })
      .eq('user_id', userId)
      .eq('audience_key', 'checkout_abandoner');

    const intent = await loadControlledIntent(userId);
    const eligibility = await service.queueEligibleRecoveryEmails({ dryRun: true, limit: 1000 });
    const checkoutCounts = eligibility.byAudience.checkout_abandoner;
    if (checkoutCounts.eligible < 1 || checkoutCounts.queued < 1) {
      throw new Error(
        `Controlled checkout intent was not eligible in dry-run: eligible=${checkoutCounts.eligible} queued=${checkoutCounts.queued}`
      );
    }

    const { data: queueRow, error: queueError } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .insert(buildControlledQueuePayload({ runId, userId, email }))
      .select('id')
      .single();
    if (queueError || !queueRow?.id) {
      throw new Error(`Failed to create controlled pending queue row: ${queueError?.message}`);
    }
    queueId = String(queueRow.id);

    const converted = await service.markUserConverted({
      userId,
      purchaseType: 'credit_pack',
      stripeCheckoutSessionId: `cs_${runId}`,
      amountCents: 0,
      packKey: 'controlled',
    });
    if (converted < 1) {
      throw new Error('Controlled recovery conversion did not update any intent rows');
    }

    const convertedIntent = await loadControlledIntent(userId);
    if (convertedIntent.status !== 'converted' || !convertedIntent.converted_at) {
      throw new Error('Controlled recovery intent was not marked converted');
    }

    const { data: cancelledQueue, error: cancelledError } = await supabaseAdmin
      .from('email_lifecycle_queue')
      .select('status, reason')
      .eq('id', queueId)
      .maybeSingle();
    if (cancelledError) {
      throw new Error(`Failed to inspect controlled queue cancellation: ${cancelledError.message}`);
    }
    if (cancelledQueue?.status !== 'cancelled') {
      throw new Error('Controlled pending recovery queue row was not cancelled');
    }

    console.log(
      `OK controlled recovery path: runId=${runId} intent=${String(intent.id)} queue=${queueId} eligible=${checkoutCounts.eligible} converted=${converted} queueStatus=${cancelledQueue.status}`
    );
  } finally {
    if (!args.keepRows) {
      await cleanupControlledRows(userId, queueId);
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
