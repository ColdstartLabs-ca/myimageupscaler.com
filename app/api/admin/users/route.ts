import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/server/middleware/requireAdmin';
import { supabaseAdmin } from '@/server/supabase/supabaseAdmin';

export async function GET(req: NextRequest) {
  const { isAdmin, error } = await requireAdmin(req);
  if (!isAdmin) return error;

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const search = searchParams.get('search') || '';
  const offset = (page - 1) * limit;

  try {
    // Build query
    let query = supabaseAdmin
      .from('profiles')
      .select('*, email:id', { count: 'exact' });

    // We need to join with auth.users to get email
    // Since we can't directly join in Supabase client, we'll fetch profiles and then get emails
    const { data: profiles, count, error: profilesError } = await query
      .range(offset, offset + limit - 1)
      .order('created_at', { ascending: false });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      return NextResponse.json(
        { error: 'Failed to fetch users', details: profilesError.message },
        { status: 500 }
      );
    }

    // Get emails from auth.users for these profiles
    const userIds = profiles?.map((p) => p.id) || [];
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error('Error fetching auth users:', authError);
      return NextResponse.json(
        { error: 'Failed to fetch user emails' },
        { status: 500 }
      );
    }

    // Create email lookup map
    const emailMap = new Map(authUsers.users.map((u) => [u.id, u.email]));

    // Combine profile data with emails
    const usersWithEmails = (profiles || []).map((profile) => ({
      ...profile,
      email: emailMap.get(profile.id) || 'unknown@example.com',
    }));

    // Apply search filter if provided
    let filteredUsers = usersWithEmails;
    if (search) {
      filteredUsers = usersWithEmails.filter((u) =>
        u.email.toLowerCase().includes(search.toLowerCase())
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        users: filteredUsers,
        total: count || 0,
        page,
        limit,
      },
    });
  } catch (err) {
    console.error('Admin users list error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}
