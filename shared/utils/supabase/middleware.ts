import { NextResponse, type NextRequest } from 'next/server';
import { User } from '@supabase/supabase-js';

interface IUpdateSessionResult {
  user: User | null;
  supabaseResponse: NextResponse;
}

export async function updateSession(request: NextRequest): Promise<IUpdateSessionResult> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Skip Supabase session handling for now to avoid edge runtime issues
  // This is a temporary fix to get the application working
  try {
    // For now, just return without user authentication
    // TODO: Fix this properly when edge runtime cookie handling is resolved
    return { user: null, supabaseResponse };
  } catch (error) {
    console.error('Error in updateSession:', error);
    return { user: null, supabaseResponse };
  }
}
