// Admin panel TypeScript types

import { UserRole, IUserProfile } from './stripe';

export interface IAdminUserProfile extends IUserProfile {
  email: string;
}

export interface IAdminUserListParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: UserRole;
  subscription_status?: string;
}

export interface IAdminUserListResponse {
  users: IAdminUserProfile[];
  total: number;
  page: number;
  limit: number;
}

export interface ICreditAdjustmentRequest {
  userId: string;
  amount: number;
  reason: string;
}

export interface ICreditAdjustmentResponse {
  success: boolean;
  newBalance: number;
}

export interface IAdminStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalCreditsIssued: number;
  totalCreditsUsed: number;
}

export interface ICreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'subscription' | 'usage' | 'refund' | 'bonus';
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface IAdminUserDetail {
  profile: IAdminUserProfile;
  subscription: {
    id: string;
    status: string;
    price_id: string;
    current_period_start: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
  } | null;
  recentTransactions: ICreditTransaction[];
}
