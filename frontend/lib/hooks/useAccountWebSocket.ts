"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Provides a live WebSocket connection to the backend for real-time
 * account updates (positions, balances, open orders).
 *
 * Connects to /api/v1/ws using the httpOnly access_token cookie.
 * Subscribes to `account:{accountId}` channel.
 * Auto-reconnects on disconnect with exponential backoff.
 */

export interface LiveAccountData {
  positions?: any[];
  balances?: any[];
  open_orders?: any[];
  account_summary?: {
    total_wallet_balance: string;
    total_unrealized_pnl: string;
    total_margin_balance: string;
    available_balance: string;
  };
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useAccountWebSocket(accountId: string | null) {
  const [liveData, setLiveData] = useState<LiveAccountData>({});
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pingInterval.current) {
      clearInterval(pingInterval.current);
      pingInterval.current = null;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent reconnect on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!accountId || !mountedRef.current) return;

    cleanup();
    setStatus("connecting");

    // Build WebSocket URL — use cookies for auth (no token query param needed)
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        reconnectDelay.current = 1000; // Reset backoff on success

        // Subscribe to account channel
        ws.send(JSON.stringify({
          action: "subscribe",
          channel: `account:${accountId}`,
        }));

        // Start ping keepalive every 30s
        pingInterval.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "ping" }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;

        try {
          const msg = JSON.parse(event.data);

          if (msg.type === "account_update" && msg.data) {
            setLiveData((prev) => ({
              ...prev,
              positions: msg.data.positions ?? prev.positions,
              balances: msg.data.balances ?? prev.balances,
              // Update balance summary if present in the message
              ...(msg.data.totalWalletBalance !== undefined ? {
                account_summary: {
                  total_wallet_balance: msg.data.totalWalletBalance || "0",
                  total_unrealized_pnl: msg.data.totalUnrealizedProfit || "0",
                  total_margin_balance: String(
                    parseFloat(msg.data.totalWalletBalance || "0") +
                    parseFloat(msg.data.totalUnrealizedProfit || "0")
                  ),
                  available_balance: msg.data.availableBalance || "0",
                },
              } : {}),
            }));
          } else if (msg.type === "order_update" && msg.data) {
            setLiveData((prev) => ({
              ...prev,
              open_orders: msg.data.open_orders ?? prev.open_orders,
            }));
          }
          // Ignore pong, subscribed, error messages (they're control messages)
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");

        // Exponential backoff reconnect: 1s, 2s, 4s, 8s ... max 30s
        const delay = Math.min(reconnectDelay.current, 30000);
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = delay * 2;
          connect();
        }, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect
      };
    } catch {
      setStatus("disconnected");
    }
  }, [accountId, cleanup]);

  // Connect on mount, disconnect on unmount or accountId change
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
      setStatus("disconnected");
      setLiveData({});
    };
  }, [connect, cleanup]);

  return { liveData, status };
}
