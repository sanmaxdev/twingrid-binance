import api from '../api';
import { API_BASE_URL } from '../api';

export interface AdminUserDetail {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  totp_enabled: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  last_login_at: string | null;
  last_login_ip: string | null;
  invite_code: string;
  account_count: number;
  active_session_count: number;
  basket_count: number;
}

export interface AdminUserListItem {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  is_email_verified: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string | null;
  last_login_at: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export interface PlatformMetrics {
  users: { total: number; active_24h: number; suspended: number; by_role: Record<string, number> };
  accounts: { total: number; running: number };
  baskets: { total: number; active: number; liquidations_30d: number };
  pnl: { total_realized: number };
  system: { critical_events_24h: number };
}

export interface AdminEvent {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  user_id: string | null;
  account_id: string | null;
  payload: any;
  occurred_at: string | null;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  target_user_id: string | null;
  target_email: string | null;
  target_name: string | null;
  target_account_id: string | null;
  ip_address: string | null;
  occurred_at: string | null;
  payload: any;
  impersonating: boolean;
}

export const adminUsersService = {
  async listUsers(params?: { page?: number; per_page?: number; search?: string; role?: string; status?: string }): Promise<PaginatedResponse<AdminUserListItem>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.per_page) query.set('per_page', String(params.per_page));
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    const qs = query.toString();
    const response = await api.get(`/admin/users${qs ? '?' + qs : ''}`);
    return response.json();
  },

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const response = await api.get(`/admin/users/${userId}`);
    return response.json();
  },

  async suspendUser(userId: string, reason?: string): Promise<any> {
    const response = await api.post(`/admin/users/${userId}/suspend${reason ? '?reason=' + encodeURIComponent(reason) : ''}`, {});
    return response.json();
  },

  async unsuspendUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/users/${userId}/unsuspend`, {});
    return response.json();
  },

  async forceLogout(userId: string): Promise<any> {
    const response = await api.post(`/admin/users/${userId}/force-logout`, {});
    return response.json();
  },

  async forcePasswordReset(userId: string): Promise<any> {
    const response = await api.post(`/admin/users/${userId}/force-password-reset`, {});
    return response.json();
  },

  async getUserAccounts(userId: string): Promise<any[]> {
    const response = await api.get(`/admin/users/${userId}/accounts`);
    return response.json();
  },

  async getUserBaskets(userId: string, page = 1): Promise<PaginatedResponse<any>> {
    const response = await api.get(`/admin/users/${userId}/baskets?page=${page}`);
    return response.json();
  },

  async getUserAuditLog(userId: string, page = 1): Promise<PaginatedResponse<AuditLogEntry>> {
    const response = await api.get(`/admin/users/${userId}/audit-log?page=${page}`);
    return response.json();
  },

  async impersonateUser(userId: string): Promise<{ access_token: string; impersonating_user: { id: string; email: string; display_name: string | null } }> {
    const response = await api.post(`/admin/users/${userId}/impersonate`, {});
    return response.json();
  },

  async getEvents(params?: { page?: number; severity?: string; event_type?: string; start_date?: string; end_date?: string }): Promise<PaginatedResponse<AdminEvent>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.severity) query.set('severity', params.severity);
    if (params?.event_type) query.set('event_type', params.event_type);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    const qs = query.toString();
    const response = await api.get(`/admin/events${qs ? '?' + qs : ''}`);
    return response.json();
  },

  async getAuditLog(params?: { page?: number; action?: string; user_id?: string; start_date?: string; end_date?: string }): Promise<PaginatedResponse<AuditLogEntry>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.action) query.set('action', params.action);
    if (params?.user_id) query.set('user_id', params.user_id);
    if (params?.start_date) query.set('start_date', params.start_date);
    if (params?.end_date) query.set('end_date', params.end_date);
    const qs = query.toString();
    const response = await api.get(`/admin/audit-log${qs ? '?' + qs : ''}`);
    return response.json();
  },

  async getMetrics(): Promise<PlatformMetrics> {
    const response = await api.get('/admin/metrics');
    return response.json();
  },

  async promoteUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/promote`, {});
    return response.json();
  },

  async demoteUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/demote`, {});
    return response.json();
  },

  async hardDeleteUser(userId: string): Promise<any> {
    const response = await api.delete(`/admin/super/users/${userId}`);
    return response.json();
  },
};
