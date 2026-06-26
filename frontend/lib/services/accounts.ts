import api from "../api";

export interface AccountSettingsResponse {
    config: Record<string, any>;
    account_id: string;
    version: number;
    updated_at: string;
    updated_by: string | null;
}

export interface AccountResponse {
    id: string;
    workspace_id: string;
    user_id: string;
    name: string;
    is_testnet: boolean;
    exchange: string;
    status: "IDLE" | "RUNNING" | "PAUSED" | "HALTED" | "ERROR";
    auto_trade_enabled: boolean;
    created_at: string;
    updated_at: string;
    settings?: AccountSettingsResponse;
}

export interface AccountCreate {
    name: string;
    is_testnet: boolean;
    exchange: string;
    api_key: string;
    api_secret: string;
}

export interface ConnectionTestRequest {
    api_key: string;
    api_secret: string;
    is_testnet: boolean;
}

export interface PlatformTradingStatus {
    trading_enabled: boolean;
}

export const accountsService = {
    async listAccounts(): Promise<AccountResponse[]> {
        const response = await api.get("/accounts/");
        return response.json();
    },

    async getAccount(accountId: string): Promise<AccountResponse> {
        const response = await api.get(`/accounts/${accountId}`);
        return response.json();
    },

    async createAccount(data: AccountCreate): Promise<AccountResponse> {
        const response = await api.post("/accounts/", data);
        return response.json();
    },

    async updateAccount(accountId: string, data: Partial<AccountCreate>): Promise<AccountResponse> {
        const response = await api.patch(`/accounts/${accountId}`, data);
        return response.json();
    },

    async updateAccountSettings(accountId: string, config: Record<string, any>): Promise<AccountSettingsResponse> {
        const response = await api.patch(`/accounts/${accountId}/settings`, { config });
        return response.json();
    },

    async deleteAccount(accountId: string): Promise<void> {
        await api.delete(`/accounts/${accountId}`);
    },

    async testConnection(accountId: string): Promise<any> {
        const response = await api.post(`/accounts/${accountId}/test-connection`, {});
        return response.json();
    },

    async previewConnection(data: ConnectionTestRequest): Promise<any> {
        const response = await api.post("/accounts/test-connection/preview", data);
        return response.json();
    },

    async getAccountDashboard(accountId: string): Promise<any> {
        const response = await api.get(`/accounts/${accountId}/dashboard`);
        return response.json();
    },

    async toggleAutoTrade(accountId: string, enabled: boolean): Promise<AccountResponse> {
        const response = await api.post(`/accounts/${accountId}/toggle-auto-trade`, { enabled });
        return response.json();
    },

    async startTrading(accountId: string): Promise<AccountResponse> {
        const response = await api.post(`/accounts/${accountId}/start`, {});
        return response.json();
    },

    async stopTrading(accountId: string): Promise<AccountResponse> {
        const response = await api.post(`/accounts/${accountId}/stop`, {});
        return response.json();
    },

    async emergencyClose(accountId: string): Promise<any> {
        const response = await api.post(`/accounts/${accountId}/emergency-close`, {});
        return response.json();
    },

    async getPlatformTradingStatus(): Promise<PlatformTradingStatus> {
        const response = await api.get("/accounts/platform-trading-status");
        return response.json();
    }
};
