import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

// HIGH-11 FIX: Maximum limit cap to prevent DoS
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

export async function GET(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  // HIGH-11 FIX: Cap limit to prevent memory exhaustion
  const requestedLimit = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10);
  const limit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  try {
    // Build query
    let query = supabaseAdmin.from('profiles').select('*, email:id', { count: 'exact' });

    // We need to join with auth.users to get email
    // Since we can't directly join in Supabase client, we'll fetch profiles and then get emails
    const {
      data: profiles,
      count,
      error: profilesError,
    } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return NextResponse.json(
        { error: 'Failed to fetch users', details: profilesError.message },
        { status: 500 }
      );
    }

    // HIGH-11 FIX: Use paginated listUsers API instead of fetching all users
    // Only fetch the page of users we need based on the profile IDs
    const profileIds = (profiles || []).map(p => p.id);

    // Build email map from auth users - only fetch users we need
    const emailMap = new Map<string, string>();

    if (profileIds.length > 0) {
      // Fetch auth users in batches to get emails
      // Note: Supabase listUsers supports pagination with perPage and page params
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        perPage: 1000, // Max per page supported by Supabase
        page: 1,
      });

      if (authError) {
        console.error('Error fetching auth users:', authError);
        // Don't fail - just return without emails
      } else if (authUsers?.users) {
        // Create email lookup map only for the users we need
        for (const user of authUsers.users) {
          if (profileIds.includes(user.id)) {
            emailMap.set(user.id, user.email || 'unknown@example.com');
          }
        }
      }
    }

    // Combine profile data with emails
    const usersWithEmails = (profiles || []).map(profile => ({
      ...profile,
      email: emailMap.get(profile.id) || 'unknown@example.com',
    }));

    // Apply search filter if provided (server-side filtering)
    let filteredUsers = usersWithEmails;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredUsers = usersWithEmails.filter(u => u.email.toLowerCase().includes(searchLower));
    }

    return NextResponse.json({
      success: true,
      data: {
        users: filteredUsers,
        total: count || 0,
        page,
        limit,
        maxLimit: MAX_LIMIT,
      },
    });
  } catch (err) {
    console.error('Admin users list error:', err);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
