'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CreditCard, Coins, TrendingUp } from 'lucide-react';
import { IAdminStats } from '@/shared/types/admin';

export default function AdminDashboard() {
  const [stats, setStats] = useState<IAdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/stats');
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
        }
      } catch (error) {
        console.error('Failed to fetch admin stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-slate-500">Loading stats...</div>
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
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatsCard
          title="Active Subscriptions"
          value={stats?.activeSubscriptions || 0}
          icon={CreditCard}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatsCard
          title="Credits Issued"
          value={stats?.totalCreditsIssued || 0}
          icon={Coins}
          iconBg="bg-yellow-100"
          iconColor="text-yellow-600"
        />
        <StatsCard
          title="Credits Used"
          value={stats?.totalCreditsUsed || 0}
          icon={TrendingUp}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
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
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold text-slate-900 mt-2">
            {value.toLocaleString()}
          </p>
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
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-medium text-slate-900 mb-4">Quick Actions</h2>
      <div className="space-y-2">
        <Link
          href="/dashboard/admin/users"
          className="block p-3 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <div className="font-medium text-slate-900">Manage Users</div>
          <div className="text-sm text-slate-500">View and edit user accounts</div>
        </Link>
        <div className="block p-3 rounded-lg bg-slate-50 opacity-50 cursor-not-allowed">
          <div className="font-medium text-slate-900">Manage Subscriptions</div>
          <div className="text-sm text-slate-500">View and modify subscriptions (Coming soon)</div>
        </div>
        <div className="block p-3 rounded-lg bg-slate-50 opacity-50 cursor-not-allowed">
          <div className="font-medium text-slate-900">Credit Operations</div>
          <div className="text-sm text-slate-500">Adjust user credits (Available in user detail)</div>
        </div>
      </div>
    </div>
  );
}

function RecentActivityCard() {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h2 className="text-lg font-medium text-slate-900 mb-4">Recent Activity</h2>
      <p className="text-sm text-slate-500">
        Activity feed will be implemented in a future iteration.
      </p>
    </div>
  );
}
