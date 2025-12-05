import { NextResponse, type NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { clientEnv } from '@shared/config/env';

interface IUpdateSessionResult {
  user: User | null;
  supabaseResponse: NextResponse;
}

export async function updateSession(request: NextRequest): Promise<IUpdateSessionResult> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  try {
    const supabase = createServerClient(clientEnv.SUPABASE_URL, clientEnv.SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // Refresh the session and get the user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return { user, supabaseResponse };
  } catch (error) {
    console.error('Error in updateSession:', error);
    return { user: null, supabaseResponse };
  }
}
