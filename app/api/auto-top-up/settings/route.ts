import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error ? null : data.user;
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from('auto_top_up_settings')
    .select('enabled, pending_enabled, threshold_credits, pack_key, last_refill_at, failure_reason')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to load settings' }, { status: 500 });
  return NextResponse.json({ data });
}

const disableSchema = z.object({ enabled: z.literal(false) }).strict();

export async function PUT(request: NextRequest) {
  const user = await authenticate(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = disableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid settings update' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('auto_top_up_settings')
    .update({
      enabled: false,
      pending_enabled: false,
      failure_reason: 'disabled_by_user',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select('enabled, pending_enabled')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to disable auto top-up' }, { status: 500 });
  return NextResponse.json({ data: data ?? { enabled: false, pending_enabled: false } });
}
