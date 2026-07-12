import { pathToFileURL } from 'node:url';
import {
  getEmailRecipientValueService,
  RECIPIENT_VALUE_POLICY_VERSION,
  type RecipientValueRunAction,
} from '@server/services/email-recipient-value.service';

export interface IApplyEmailRecipientValueArgs {
  action: RecipientValueRunAction;
  write: boolean;
  runId: string;
  policyVersion: string;
  expectedCount: number;
}

function getArgValue(argv: string[], name: string): string | undefined {
  const inline = argv.find(arg => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export function parseApplyEmailRecipientValueArgs(argv: string[]): IApplyEmailRecipientValueArgs {
  const action = getArgValue(argv, '--action');
  const runId = getArgValue(argv, '--run-id');
  const policyVersion = getArgValue(argv, '--policy-version');
  const expectedCountRaw = getArgValue(argv, '--expected-count');

  for (const arg of argv) {
    if (
      arg === '--write' ||
      arg === '--action' ||
      arg.startsWith('--action=') ||
      arg === '--run-id' ||
      arg.startsWith('--run-id=') ||
      arg === '--policy-version' ||
      arg.startsWith('--policy-version=') ||
      arg === '--expected-count' ||
      arg.startsWith('--expected-count=')
    ) {
      continue;
    }
    if (arg === action || arg === runId || arg === policyVersion || arg === expectedCountRaw) {
      continue;
    }
    throw new Error(`Unknown argument "${arg}". Use --help for usage.`);
  }

  if (action !== 'apply' && action !== 'rollback') {
    throw new Error('--action must be either apply or rollback');
  }
  if (!argv.includes('--write')) {
    throw new Error(
      'Refusing to mutate data. Re-run with --write --action <apply|rollback> after reviewing the dry-run.'
    );
  }
  if (!runId) throw new Error('--run-id is required');
  if (policyVersion !== RECIPIENT_VALUE_POLICY_VERSION) {
    throw new Error(`--policy-version must be ${RECIPIENT_VALUE_POLICY_VERSION}`);
  }
  const expectedCount = Number(expectedCountRaw);
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error('--expected-count must be a non-negative integer');
  }

  return { action, write: true, runId, policyVersion, expectedCount };
}

export function buildApplyEmailRecipientValueOutput(
  result: Record<string, unknown>
): Record<string, unknown> {
  return {
    run_id: result.runId ?? result.run_id,
    action: result.action,
    mode: result.mode,
    changed_count: result.changedCount ?? result.changed_count ?? 0,
    cancelled_count: result.cancelledCount ?? result.cancelled_count ?? 0,
    held_count: result.heldCount ?? result.held_count ?? 0,
    kept_count: result.keptCount ?? result.kept_count ?? 0,
  };
}

export async function runApplyEmailRecipientValue(
  args: IApplyEmailRecipientValueArgs
): Promise<Record<string, unknown>> {
  const result = await getEmailRecipientValueService().applyRun({
    action: args.action,
    runId: args.runId,
    policyVersion: args.policyVersion,
    expectedCount: args.expectedCount,
  });
  return buildApplyEmailRecipientValueOutput(result as Record<string, unknown>);
}

async function main(): Promise<void> {
  const args = parseApplyEmailRecipientValueArgs(process.argv.slice(2));
  console.log(JSON.stringify(await runApplyEmailRecipientValue(args)));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
