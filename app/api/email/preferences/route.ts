import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';
import { getAuthenticatedUser } from '@server/middleware/getAuthenticatedUser';
import { updatePreferencesSchema } from '@shared/validation/email.schema';
import { getEmailLifecycleService } from '@server/services/email-lifecycle.service';
import { trackServerEvent } from '@server/analytics';
import { serverEnv } from '@shared/config/env';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('email_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Return defaults if no preferences exist
    return NextResponse.json({
      success: true,
      data: data || {
        marketing_emails: true,
        product_updates: true,
        low_credit_alerts: true,
      },
    });
  } catch (error) {
    console.error('Get preferences error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'FETCH_FAILED', message: 'Failed to get preferences' } },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      );
    }

    const body = await request.json();
    const validated = updatePreferencesSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: validated.error.flatten(),
          },
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('email_preferences')
      .upsert({
        user_id: user.id,
        ...validated.data,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    if (
      validated.data.marketing_emails === false ||
      validated.data.product_updates === false ||
      validated.data.low_credit_alerts === false
    ) {
      const lifecycleService = getEmailLifecycleService();
      await lifecycleService.recordLifecycleEvent({
        userId: user.id,
        eventType: 'unsubscribed',
        metadata: {
          marketing_emails: validated.data.marketing_emails,
          product_updates: validated.data.product_updates,
          low_credit_alerts: validated.data.low_credit_alerts,
        },
      });
      await lifecycleService.cancelPendingForUser(user.id, 'email_preference_opt_out');
      await trackServerEvent(
        'email_lifecycle_unsubscribed',
        {
          marketing_emails: validated.data.marketing_emails,
          product_updates: validated.data.product_updates,
          low_credit_alerts: validated.data.low_credit_alerts,
        },
        { apiKey: serverEnv.AMPLITUDE_API_KEY, userId: user.id }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Update preferences error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'UPDATE_FAILED', message: 'Failed to update preferences' } },
      { status: 500 }
    );
  }
}
