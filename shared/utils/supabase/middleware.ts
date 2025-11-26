import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';
import { clientEnv } from '@shared/config/env';

interface IUpdateSessionResult {
  user: User | null;
  supabaseResponse: NextResponse;
}

export async function updateSession(request: NextRequest): Promise<IUpdateSessionResult> {
  let supabaseResponse = NextResponse.next({
    request,
  });

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

  // IMPORTANT: Do not use getSession() here - it doesn't validate the JWT
  // Always use getUser() which makes a request to Supabase Auth server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { user, supabaseResponse };
}
