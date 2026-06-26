import api from '../api';

export interface AdminStats {
  total_users: number;
  total_workspaces: number;
  total_connected_accounts: number;
  active_trading_bots: number;
  auto_trade_enabled_count: number;
  platform_trading_enabled: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_active: boolean;
  twin_grid_balance: number;
  created_at: string | null;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  owner_id: string;
  created_at: string | null;
}

export const adminService = {
  async getStats(): Promise<AdminStats> {
    const response = await api.get('/admin/super/management/stats');
    return response.json();
  },

  async getUsers(skip = 0, limit = 100): Promise<AdminUser[]> {
    const response = await api.get(`/admin/super/management/users?skip=${skip}&limit=${limit}`);
    return response.json();
  },

  async getWorkspaces(skip = 0, limit = 100): Promise<AdminWorkspace[]> {
    const response = await api.get(`/admin/super/management/workspaces?skip=${skip}&limit=${limit}`);
    return response.json();
  },

  async rotateEncryptionKey(): Promise<any> {
    const response = await api.post('/admin/super/rotate-encryption-key', {});
    return response.json();
  },

  async getSystemHealth(): Promise<{ database: string; redis: string }> {
    const response = await api.get('/system/health');
    return response.json();
  },

  async getAllAccounts(skip = 0, limit = 100): Promise<any[]> {
    const response = await api.get(`/admin/super/management/accounts?skip=${skip}&limit=${limit}`);
    return response.json();
  },

  async getAccountDashboard(accountId: string): Promise<any> {
    const response = await api.get(`/admin/super/management/accounts/${accountId}/dashboard`);
    return response.json();
  },

  async getAccountBalance(accountId: string): Promise<{
    success: boolean;
    total_wallet_balance: string | null;
    total_unrealized_pnl: string | null;
    available_balance: string | null;
  }> {
    const response = await api.get(`/admin/super/management/accounts/${accountId}/balance`);
    return response.json();
  },

  async getAccountBalances(): Promise<{
    balances: Record<string, {
      success: boolean;
      total_wallet_balance: string | null;
      total_unrealized_pnl: string | null;
      available_balance: string | null;
      source: string;
    }>;
  }> {
    const response = await api.get(`/admin/super/management/accounts/balances`);
    return response.json();
  },

  async getPlatformSettings(): Promise<Record<string, any>> {
    const response = await api.get('/admin/super/management/platform-settings');
    return response.json();
  },

  async togglePlatformTrading(): Promise<{ trading_enabled: boolean; message: string }> {
    const response = await api.post('/admin/super/management/platform-settings/trading', {});
    return response.json();
  },

  async haltAll(): Promise<{ status: string; message: string }> {
    const response = await api.post('/admin/super/management/halt-all', {});
    return response.json();
  },

  async runBacktest(params: Record<string, any>): Promise<any> {
    const response = await api.post('/admin/backtest/run', params);
    return response.json();
  },

  async getAccountSettings(accountId: string): Promise<any> {
    const response = await api.get(`/admin/super/management/accounts/${accountId}/settings`);
    return response.json();
  },

  async updateAccountSettings(accountId: string, config: Record<string, any>): Promise<any> {
    const response = await api.patch(`/admin/super/management/accounts/${accountId}/settings`, { config });
    return response.json();
  },

  async closeAccountPosition(accountId: string, symbol: string): Promise<any> {
    const response = await api.post(`/admin/super/management/accounts/${accountId}/positions/${symbol}/close`, {});
    return response.json();
  },

  // User management actions
  async promoteUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/promote`, {});
    return response.json();
  },

  async demoteUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/demote`, {});
    return response.json();
  },

  async suspendUser(userId: string, reason: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/suspend`, { reason });
    return response.json();
  },

  async unsuspendUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/super/users/${userId}/unsuspend`, {});
    return response.json();
  },

  async deleteUser(userId: string): Promise<any> {
    const response = await api.delete(`/admin/super/users/${userId}`);
    return response.json();
  },

  async updateUser(userId: string, data: { display_name?: string }): Promise<any> {
    const response = await api.patch(`/admin/super/users/${userId}`, data);
    return response.json();
  },

  async getSystemResources(): Promise<any> {
    const response = await api.get('/admin/super/management/system/resources');
    return response.json();
  },

  async getSystemLogs(lines: number = 100, level: string = 'all'): Promise<any> {
    const response = await api.get(`/admin/super/management/system/logs?lines=${lines}&level=${level}`);
    return response.json();
  },

  async getUserDetail(userId: string): Promise<any> {
    const response = await api.get(`/admin/super/users/${userId}/detail`);
    return response.json();
  },

  // Backtest history
  async getBacktestHistory(page: number = 1, perPage: number = 20, symbol?: string): Promise<any> {
    const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (symbol) params.set("symbol", symbol);
    const response = await api.get(`/admin/backtest/history?${params.toString()}`);
    return response.json();
  },

  async getBacktestDetail(id: string): Promise<any> {
    const response = await api.get(`/admin/backtest/history/${id}`);
    return response.json();
  },

  async deleteBacktest(id: string): Promise<any> {
    const response = await api.delete(`/admin/backtest/history/${id}`);
    return response.json();
  },

  // Market data cache
  async getMarketDataStatus(): Promise<any> {
    const response = await api.get('/admin/market-data/status');
    return response.json();
  },

  async downloadMarketData(params: {
    symbol: string;
    intervals: string[];
    start_year: number;
    start_month: number;
    end_year: number;
    end_month: number;
    include_funding: boolean;
  }): Promise<any> {
    const response = await api.post('/admin/market-data/download', params);
    return response.json();
  },

  async clearMarketData(symbol?: string, dataType?: string, interval?: string): Promise<any> {
    const params = new URLSearchParams();
    if (symbol) params.set("symbol", symbol);
    if (dataType) params.set("data_type", dataType);
    if (interval) params.set("interval", interval);
    const response = await api.delete(`/admin/market-data?${params.toString()}`);
    return response.json();
  },

  async getUpdateLogs(): Promise<any> {
    const response = await api.get('/admin/market-data/update-logs');
    return response.json();
  },

  async triggerUpdate(): Promise<any> {
    const response = await api.post('/admin/market-data/trigger-update', {});
    return response.json();
  },

  async fixGaps(symbol?: string): Promise<any> {
    const params = symbol ? `?symbol=${symbol}` : '';
    const response = await api.post(`/admin/market-data/fix-gaps${params}`, {});
    return response.json();
  },

  async pruneDockerCache(): Promise<{ success: boolean; freed_label: string; freed_bytes: number; steps: any[] }> {
    const response = await api.post('/admin/super/management/system/docker-prune', {});
    return response.json();
  },
};
