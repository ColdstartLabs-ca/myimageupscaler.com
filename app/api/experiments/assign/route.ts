import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assignExperimentArm } from '@lib/experiments';

const assignmentSchema = z.object({
  experimentKey: z.string().min(1).max(120),
  contextKey: z.string().min(1).max(120).optional(),
  assignmentKey: z.string().min(1).max(180),
  assignmentScope: z.enum(['session', 'user']),
  surface: z.string().min(1).max(120),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = assignmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid experiment assignment request', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const assignment = await assignExperimentArm(parsed.data);
  return NextResponse.json({ assignment });
}
