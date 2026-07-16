import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const auditQueueMock = vi.hoisted(() => vi.fn());

vi.mock('@server/services/email-recipient-value.service', () => ({
  getEmailRecipientValueService: () => ({ auditQueue: auditQueueMock }),
}));

import {
  buildAuditEmailRecipientValueOutput,
  parseAuditEmailRecipientValueArgs,
  runAuditEmailRecipientValue,
} from '../../../scripts/audit-email-recipient-value';

describe('audit-email-recipient-value CLI', () => {
  it('should default to a bounded dry-run page size', () => {
    expect(parseAuditEmailRecipientValueArgs([])).toEqual({ pageSize: 250 });
    expect(parseAuditEmailRecipientValueArgs(['--page-size', '25'])).toEqual({ pageSize: 25 });
  });

  it('should reject mutation and unknown arguments', () => {
    expect(() => parseAuditEmailRecipientValueArgs(['--write'])).toThrow(/Unknown argument/);
    expect(() => parseAuditEmailRecipientValueArgs(['--page-size'])).toThrow(/requires a value/);
    expect(() => parseAuditEmailRecipientValueArgs(['--page-size', '251'])).toThrow(
      /from 1 to 250/
    );
  });

  it('should emit count-only output without recipient email or queue/user identifiers', () => {
    const output = buildAuditEmailRecipientValueOutput({
      runId: 'run-1',
      summary: {
        candidateCount: 2,
        byDecision: { keep_high: 1, cancel: 1 },
        byReason: { prior_pack_buyer: 1, stale_over_60d: 1 },
        byCampaign: { 'winback-never-uploaded-14d': 2 },
        byCountry: { US: 1, UNKNOWN: 1 },
        byBand: { high: 1, cancel: 1 },
      },
    });

    const serialized = JSON.stringify(output);
    expect(serialized).not.toContain('user@example.com');
    expect(serialized).not.toContain('user-123');
    expect(serialized).not.toContain('queue-123');
    expect(output).toMatchObject({ run_id: 'run-1', candidate_count: 2, dry_run: true });
  });

  it('should persist a dry-run through the service without calling a queue status update', async () => {
    auditQueueMock.mockResolvedValueOnce({
      runId: 'run-1',
      summary: {
        candidateCount: 0,
        byDecision: {},
        byReason: {},
        byCampaign: {},
        byCountry: {},
        byBand: {},
      },
    });

    await runAuditEmailRecipientValue({ pageSize: 10 });
    expect(auditQueueMock).toHaveBeenCalledWith({
      pageSize: 10,
      onProgress: expect.any(Function),
    });
  });

  it('should use serverEnv-backed configuration rather than direct process environment access', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts/audit-email-recipient-value.ts'),
      'utf8'
    );
    expect(source).not.toContain('process.env');
  });
});
