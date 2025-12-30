'use client';

import { adminFetch } from '@/client/utils/admin-api-client';
import { IAdminStats } from '@/shared/types/admin.types';
import { Coins, CreditCard, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

export default function AdminDashboard() {
  const [stats, setStats] = useState<IAdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await adminFetch<{ success: boolean; data: IAdminStats }>('/api/admin/stats');
        if (data.success) {
          setStats(data.data);
        }
      } catch (err) {
        console.error('Failed to fetch admin stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stats');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-muted-foreground">Loading stats...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-error">
          <p className="font-medium">Error loading stats</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          icon={Users}
          iconBg="bg-accent/20"
          iconColor="text-accent"
        />
        <StatsCard
          title="Active Subscriptions"
          value={stats?.activeSubscriptions || 0}
          icon={CreditCard}
          iconBg="bg-success/20"
          iconColor="text-success"
        />
        <StatsCard
          title="Credits Issued"
          value={stats?.totalCreditsIssued || 0}
          icon={Coins}
          iconBg="bg-warning/20"
          iconColor="text-warning"
        />
        <StatsCard
          title="Credits Used"
          value={stats?.totalCreditsUsed || 0}
          icon={TrendingUp}
          iconBg="bg-secondary/20"
          iconColor="text-secondary"
        />
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <QuickActionsCard />
        <RecentActivityCard />
      </div>
    </div>
  );
}

interface IStatsCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function StatsCard({ title, value, icon: Icon, iconBg, iconColor }: IStatsCardProps) {
  return (
    <div className="bg-surface rounded-lg border border-white/10 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-primary mt-2">{value.toLocaleString()}</p>
        </div>
        <div className={`p-3 rounded-lg ${iconBg}`}>
          <Icon className={`h-6 w-6 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard() {
  return (
    <div className="bg-surface rounded-lg border border-white/10 p-6">
      <h2 className="text-lg font-medium text-primary mb-4">Quick Actions</h2>
      <div className="space-y-2">
        <Link
          href="/dashboard/admin/users"
          className="block p-3 rounded-lg hover:bg-surface transition-colors"
        >
          <div className="font-medium text-primary">Manage Users</div>
          <div className="text-sm text-muted-foreground">View and edit user accounts</div>
        </Link>
        <div className="block p-3 rounded-lg bg-surface opacity-50 cursor-not-allowed">
          <div className="font-medium text-primary">Manage Subscriptions</div>
          <div className="text-sm text-muted-foreground">
            View and modify subscriptions (Coming soon)
          </div>
        </div>
        <div className="block p-3 rounded-lg bg-surface opacity-50 cursor-not-allowed">
          <div className="font-medium text-primary">Credit Operations</div>
          <div className="text-sm text-muted-foreground">
            Adjust user credits (Available in user detail)
          </div>
        </div>
      </div>
    </div>
  );
}

function RecentActivityCard() {
  return (
    <div className="bg-surface rounded-lg border border-white/10 p-6">
      <h2 className="text-lg font-medium text-primary mb-4">Recent Activity</h2>
      <p className="text-sm text-muted-foreground">
        Activity feed will be implemented in a future iteration.
      </p>
    </div>
  );
}
