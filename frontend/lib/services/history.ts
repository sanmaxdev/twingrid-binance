import api from '../api';

export interface HistoryBasket {
  id: string;
  symbol: string;
  side: string;
  status: string;
  bo_price: number | null;
  bo_margin: number | null;
  leverage: number;
  sos_filled: number;
  avg_entry: number | null;
  qty: number | null;
  tp_price: number | null;
  realized_pnl: number | null;
  fees_paid: number | null;
  exit_reason: string | null;
  opened_at: string | null;
  closed_at: string | null;
  duration: string | null;
}

export interface BasketForensics extends HistoryBasket {
  config_snapshot: Record<string, any>;
  grid_levels: any;
  notional_total: number | null;
  tp_target_usd: number | null;
  liquidation_price: number | null;
  funding_paid: number | null;
  orders: HistoryOrder[];
}

export interface HistoryOrder {
  id: string;
  basket_id?: string;
  role: string;
  side: string;
  type: string;
  qty: number | null;
  price: number | null;
  status: string;
  filled_qty: number | null;
  avg_fill_price: number | null;
  commission: number | null;
  placed_at: string | null;
  filled_at: string | null;
}

export interface EquitySnapshot {
  wallet_balance: number;
  total_equity: number;
  unrealized_pnl: number;
  margin_used: number;
  recorded_at: string;
}

export interface PnlSummary {
  total_realized_pnl: number;
  total_fees_paid: number;
  total_funding_paid: number;
  net_pnl: number;
  total_baskets: number;
  closed_baskets: number;
  error_baskets: number;
  winning_baskets: number;
  win_rate: number;
  manual_close_count: number;
  risk_stop_count: number;
  liquidation_count: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
}

export const historyService = {
  async listBaskets(accountId: string, params?: { page?: number; per_page?: number; status?: string; side?: string; symbol?: string; exit_reason?: string }): Promise<PaginatedResponse<HistoryBasket>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.per_page) query.set('per_page', String(params.per_page));
    if (params?.status) query.set('status', params.status);
    if (params?.side) query.set('side', params.side);
    if (params?.symbol) query.set('symbol', params.symbol);
    if (params?.exit_reason) query.set('exit_reason', params.exit_reason);
    const qs = query.toString();
    const response = await api.get(`/accounts/${accountId}/baskets${qs ? '?' + qs : ''}`);
    return response.json();
  },

  async getBasketForensics(accountId: string, basketId: string): Promise<BasketForensics> {
    const response = await api.get(`/accounts/${accountId}/baskets/${basketId}`);
    return response.json();
  },

  async listOrders(accountId: string, params?: { page?: number; per_page?: number }): Promise<PaginatedResponse<HistoryOrder>> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.per_page) query.set('per_page', String(params.per_page));
    const qs = query.toString();
    const response = await api.get(`/accounts/${accountId}/orders${qs ? '?' + qs : ''}`);
    return response.json();
  },

  async getEquityHistory(accountId: string, hours = 24): Promise<EquitySnapshot[]> {
    const response = await api.get(`/accounts/${accountId}/equity?hours=${hours}`);
    return response.json();
  },

  async getPnlSummary(accountId: string): Promise<PnlSummary> {
    const response = await api.get(`/accounts/${accountId}/pnl-summary`);
    return response.json();
  },

  async exportCsv(accountId: string): Promise<Blob> {
    const response = await api.get(`/accounts/${accountId}/export.csv`);
    return response.blob();
  },
};
