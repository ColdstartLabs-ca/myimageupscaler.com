import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { getRevenueRecoveryService } from '@/server/services/revenue-recovery.service';

const importRequestSchema = z.object({
  cohortId: z.string().min(1),
  audienceKey: z.enum([
    'checkout_abandoner',
    'upgrade_click_no_purchase',
    'credit_wall_dismissed',
    'high_usage_free_user',
  ]),
  dryRun: z.boolean().default(true),
  limit: z.number().int().positive().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const parsed = importRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid recovery cohort import request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await getRevenueRecoveryService().importAmplitudeCohort(parsed.data);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to import recovery cohort';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
