import { execFile as execFileCallback } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { serverEnv } from '@shared/config/env';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const execFile = promisify(execFileCallback);
const GCLOUD_PROJECT = 'myimageupscaler-auth';
const GCLOUD_API_SECRET = 'myimageupscaler-api-prod';
const GCLOUD_ACCOUNT = 'myimageupscaler@myimageupscaler-auth.iam.gserviceaccount.com';
const RECIPIENT_VALUE_DECISIONS = [
  'protected',
  'keep_high',
  'keep_medium',
  'hold_experiment',
  'cancel',
] as const;
const RECIPIENT_VALUE_BANDS = ['protected', 'high', 'medium', 'experiment', 'cancel'] as const;

interface IReadinessArgs {
  production: boolean;
}

export interface IReadinessSummary {
  source: 'production' | 'local';
  brevo: {
    authenticated: boolean;
    senderVerified: boolean;
    domainAuthenticated: boolean;
    planType: string;
    dailyLimit: number | null;
  };
  cloudflare: { sendingDomainEnabled: boolean };
  cron: {
    authenticated: boolean;
    duePending: number;
    eligiblePending: number;
    heldPending: number;
    unclassifiedPending: number;
    unclassifiedDueReturned: number;
  };
  queue: {
    pending: number;
    due: number;
    byDecision: Record<string, number>;
    byValueBand: Record<string, number>;
  };
  backupSecretVersions: number | null;
}

export function parseReadinessArgs(argv: string[]): IReadinessArgs {
  return { production: argv.includes('--prod') };
}

export function assertReadinessEnvironment(args: IReadinessArgs): void {
  if (args.production && (!existsSync('.env.api.prod') || !existsSync('.env.client.prod'))) {
    throw new Error('Production readiness requires fetched .env.api.prod and .env.client.prod');
  }
  const missing = [
    ['BREVO_API_KEY', serverEnv.BREVO_API_KEY],
    ['CLOUDFLARE_EMAIL_API_TOKEN', serverEnv.CLOUDFLARE_EMAIL_API_TOKEN],
    ['CLOUDFLARE_ZONE_ID', serverEnv.CLOUDFLARE_ZONE_ID],
    ['CRON_SECRET', serverEnv.CRON_SECRET],
    ['BASE_URL', serverEnv.BASE_URL],
  ].filter(([, value]) => !value);
  if (missing.length)
    throw new Error(`Missing readiness configuration: ${missing.map(([key]) => key).join(', ')}`);
  if (args.production) assertProductionBaseUrl(serverEnv.BASE_URL);
}

export function assertProductionBaseUrl(baseUrl: string): void {
  const url = new URL(baseUrl);
  if (
    url.protocol !== 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())
  ) {
    throw new Error('Production readiness requires a non-local HTTPS BASE_URL');
  }
}

export function summarizeBrevoAccount(body: unknown): {
  planType: string;
  dailyLimit: number | null;
} {
  const account = body as {
    plan?: Array<{ type?: string; credits?: number; creditsType?: string }>;
  };
  const sendPlan =
    account.plan?.find(plan => plan.creditsType === 'sendLimit') ?? account.plan?.[0];
  return {
    planType: String(sendPlan?.type ?? 'unknown'),
    dailyLimit: typeof sendPlan?.credits === 'number' ? sendPlan.credits : null,
  };
}

export function assertBrevoAuthentication(status: number): void {
  if (status !== 200) throw new Error(`Brevo authentication failed with HTTP ${status}`);
}

export function assertBrevoSenderReadiness(
  sendersBody: unknown,
  domainsBody: unknown,
  configuredSender: string
): { senderVerified: true; domainAuthenticated: true } {
  const senders = (sendersBody as { senders?: Array<{ email?: string; active?: boolean }> })
    .senders;
  const domains = (
    domainsBody as {
      domains?: Array<{ domain_name?: string; authenticated?: boolean; verified?: boolean }>;
    }
  ).domains;
  const normalizedSender = configuredSender.toLowerCase();
  const domainName = normalizedSender.split('@')[1];
  const senderVerified = senders?.some(
    sender => sender.email?.toLowerCase() === normalizedSender && sender.active === true
  );
  const domainAuthenticated = domains?.some(
    domain =>
      domain.domain_name?.toLowerCase() === domainName &&
      domain.authenticated === true &&
      domain.verified === true
  );
  if (!senderVerified || !domainAuthenticated) {
    throw new Error('Configured Brevo sender and domain must be verified before delivery');
  }
  return { senderVerified: true, domainAuthenticated: true };
}

export function assertCronReadinessResponse(body: unknown): {
  duePending: number;
  eligiblePending: number;
  heldPending: number;
  unclassifiedPending: number;
  unclassifiedDueReturned: number;
} {
  const result = body as {
    success?: boolean;
    dryRun?: boolean;
    drainOnly?: boolean;
    sendLimit?: number;
    duePending?: number;
    eligiblePending?: number;
    heldPending?: number;
    unclassifiedPending?: number;
    unclassifiedDueReturned?: number;
  };
  if (result.success !== true || result.dryRun !== true) {
    throw new Error('Lifecycle cron dry-run did not authenticate or succeed');
  }
  if (
    result.drainOnly !== true ||
    result.sendLimit !== 1 ||
    !Number.isInteger(result.unclassifiedDueReturned)
  ) {
    throw new Error('Lifecycle cron does not expose the current bounded drain contract');
  }
  if (
    !Number.isInteger(result.duePending) ||
    !Number.isInteger(result.eligiblePending) ||
    !Number.isInteger(result.heldPending) ||
    !Number.isInteger(result.unclassifiedPending)
  ) {
    throw new Error('Lifecycle cron dry-run omitted queue eligibility health');
  }
  const unclassifiedDueReturned = result.unclassifiedDueReturned as number;
  if (unclassifiedDueReturned !== 0) {
    throw new Error('Lifecycle due queue returned unclassified marketing rows');
  }
  if (result.unclassifiedPending !== 0) {
    throw new Error('Lifecycle queue contains unclassified pending marketing rows');
  }
  return {
    duePending: result.duePending as number,
    eligiblePending: result.eligiblePending as number,
    heldPending: result.heldPending as number,
    unclassifiedPending: result.unclassifiedPending as number,
    unclassifiedDueReturned,
  };
}

export function formatReadinessSummary(summary: IReadinessSummary): string {
  return JSON.stringify(summary);
}

export function assertQueueDistribution(
  pending: number,
  byDecision: Record<string, number>,
  byValueBand: Record<string, number>
): void {
  const decisionTotal = Object.values(byDecision).reduce((total, count) => total + count, 0);
  if (decisionTotal !== pending) {
    throw new Error('Queue decision distribution does not reconcile to pending count');
  }
  const valueBandTotal = Object.values(byValueBand).reduce((total, count) => total + count, 0);
  if (valueBandTotal !== pending) {
    throw new Error('Queue value-band distribution does not reconcile to pending count');
  }
}

async function countQueueRows(params: {
  due?: boolean;
  decision?: string | null;
  valueBand?: string | null;
}): Promise<number> {
  let query = supabaseAdmin
    .from('email_lifecycle_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (params.due) query = query.lte('scheduled_for', new Date().toISOString());
  query =
    params.decision === null
      ? query.is('recipient_value_decision', null)
      : params.decision
        ? query.eq('recipient_value_decision', params.decision)
        : query;
  query =
    params.valueBand === null
      ? query.is('recipient_value_band', null)
      : params.valueBand
        ? query.eq('recipient_value_band', params.valueBand)
        : query;
  const { count, error } = await query;
  if (error) throw new Error(`Queue readiness count failed: ${error.message}`);
  return count ?? 0;
}

async function checkQueue(): Promise<IReadinessSummary['queue']> {
  const [pending, due, unclassifiedDecision, unclassifiedValueBand, ...classifiedCounts] =
    await Promise.all([
      countQueueRows({}),
      countQueueRows({ due: true }),
      countQueueRows({ decision: null }),
      countQueueRows({ valueBand: null }),
      ...RECIPIENT_VALUE_DECISIONS.map(decision => countQueueRows({ decision })),
      ...RECIPIENT_VALUE_BANDS.map(valueBand => countQueueRows({ valueBand })),
    ]);
  const decisionCounts = classifiedCounts.slice(0, RECIPIENT_VALUE_DECISIONS.length);
  const valueBandCounts = classifiedCounts.slice(RECIPIENT_VALUE_DECISIONS.length);
  const byDecision = {
    unclassified: unclassifiedDecision,
    ...Object.fromEntries(
      RECIPIENT_VALUE_DECISIONS.map((decision, index) => [decision, decisionCounts[index]])
    ),
  };
  const byValueBand = {
    unclassified: unclassifiedValueBand,
    ...Object.fromEntries(
      RECIPIENT_VALUE_BANDS.map((valueBand, index) => [valueBand, valueBandCounts[index]])
    ),
  };
  assertQueueDistribution(pending, byDecision, byValueBand);
  return {
    pending,
    due,
    byDecision,
    byValueBand,
  };
}

async function checkBrevo(): Promise<IReadinessSummary['brevo']> {
  const headers = { 'api-key': serverEnv.BREVO_API_KEY, Accept: 'application/json' };
  const [accountResponse, sendersResponse, domainsResponse] = await Promise.all([
    fetch('https://api.brevo.com/v3/account', { headers }),
    fetch('https://api.brevo.com/v3/senders', { headers }),
    fetch('https://api.brevo.com/v3/senders/domains', { headers }),
  ]);
  assertBrevoAuthentication(accountResponse.status);
  if (!sendersResponse.ok || !domainsResponse.ok) {
    throw new Error('Brevo sender readiness lookup failed');
  }
  const [account, senders, domains] = await Promise.all([
    accountResponse.json(),
    sendersResponse.json(),
    domainsResponse.json(),
  ]);
  return {
    authenticated: true,
    ...assertBrevoSenderReadiness(senders, domains, serverEnv.EMAIL_FROM_ADDRESS),
    ...summarizeBrevoAccount(account),
  };
}

async function checkCloudflareDomain(): Promise<IReadinessSummary['cloudflare']> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${serverEnv.CLOUDFLARE_ZONE_ID}/email/sending/subdomains`,
    { headers: { Authorization: `Bearer ${serverEnv.CLOUDFLARE_EMAIL_API_TOKEN}` } }
  );
  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    result?: unknown[];
  } | null;
  if (
    !response.ok ||
    body?.success !== true ||
    !Array.isArray(body.result) ||
    body.result.length === 0
  ) {
    throw new Error(`Cloudflare Email Sending domain check failed with HTTP ${response.status}`);
  }
  return { sendingDomainEnabled: true };
}

async function checkCron(): Promise<IReadinessSummary['cron']> {
  const response = await fetch(
    `${serverEnv.BASE_URL}/api/cron/email-lifecycle?dryRun=true&drainOnly=true&scanLimit=25&sendLimit=1`,
    { method: 'POST', headers: { 'x-cron-secret': serverEnv.CRON_SECRET } }
  );
  if (response.status !== 200)
    throw new Error(`Lifecycle cron dry-run failed with HTTP ${response.status}`);
  return { authenticated: true, ...assertCronReadinessResponse(await response.json()) };
}

export function buildBackupVersionsArgs(): string[] {
  return [
    'secrets',
    'versions',
    'list',
    GCLOUD_API_SECRET,
    `--project=${GCLOUD_PROJECT}`,
    `--account=${GCLOUD_ACCOUNT}`,
    '--filter=state=ENABLED',
    '--format=value(name)',
  ];
}

async function countEnabledBackupVersions(): Promise<number> {
  const { stdout } = await execFile('gcloud', buildBackupVersionsArgs());
  const count = stdout.split('\n').filter(Boolean).length;
  if (count < 2) throw new Error('Production API secret must retain at least two enabled versions');
  return count;
}

async function main(): Promise<void> {
  const args = parseReadinessArgs(process.argv.slice(2));
  assertReadinessEnvironment(args);
  const [brevo, cloudflare, cron, queue, backupSecretVersions] = await Promise.all([
    checkBrevo(),
    checkCloudflareDomain(),
    checkCron(),
    checkQueue(),
    args.production ? countEnabledBackupVersions() : Promise.resolve(null),
  ]);
  console.log(
    formatReadinessSummary({
      source: args.production ? 'production' : 'local',
      brevo,
      cloudflare,
      cron,
      queue,
      backupSecretVersions,
    })
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
