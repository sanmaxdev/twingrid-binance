"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Multi-account WebSocket hook.
 *
 * Opens a single WS connection and subscribes to `account:{id}` for
 * every account ID in the supplied array.  Returns a map of
 * `{ [accountId]: { positions, balances, open_orders } }` that updates
 * in real-time.
 *
 * Used on the Dashboard Overview and Admin Accounts List pages where
 * aggregate data from many accounts needs to stay live simultaneously.
 */

export interface LiveAccountData {
  positions?: any[];
  balances?: any[];
  open_orders?: any[];
  totalWalletBalance?: string;
  totalUnrealizedProfit?: string;
  availableBalance?: string;
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useMultiAccountWebSocket(accountIds: string[]) {
  const [liveMap, setLiveMap] = useState<Record<string, LiveAccountData>>({});
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelay = useRef(1000);
  const mountedRef = useRef(true);
  const pingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep a ref to the latest account IDs so the connect callback doesn't
  // go stale when accounts load asynchronously.
  const accountIdsRef = useRef<string[]>(accountIds);
  accountIdsRef.current = accountIds;

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
    const ids = accountIdsRef.current;
    if (!ids.length || !mountedRef.current) return;

    cleanup();
    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        setStatus("connected");
        reconnectDelay.current = 1000;

        // Subscribe to every account channel
        for (const id of accountIdsRef.current) {
          ws.send(JSON.stringify({
            action: "subscribe",
            channel: `account:${id}`,
          }));
        }

        // Keepalive ping every 30s
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

          // Messages include the channel they came from, e.g. "account:abc-123"
          const channel: string = msg.channel || "";
          const accountId = channel.replace("account:", "");

          if (!accountId) return;

          if (msg.type === "account_update" && msg.data) {
            setLiveMap((prev) => ({
              ...prev,
              [accountId]: {
                ...prev[accountId],
                positions: msg.data.positions ?? prev[accountId]?.positions,
                balances: msg.data.balances ?? prev[accountId]?.balances,
                totalWalletBalance: msg.data.totalWalletBalance ?? prev[accountId]?.totalWalletBalance,
                totalUnrealizedProfit: msg.data.totalUnrealizedProfit ?? prev[accountId]?.totalUnrealizedProfit,
                availableBalance: msg.data.availableBalance ?? prev[accountId]?.availableBalance,
              },
            }));
          } else if (msg.type === "order_update" && msg.data) {
            setLiveMap((prev) => ({
              ...prev,
              [accountId]: {
                ...prev[accountId],
                open_orders: msg.data.open_orders ?? prev[accountId]?.open_orders,
              },
            }));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");

        const delay = Math.min(reconnectDelay.current, 30000);
        reconnectTimer.current = setTimeout(() => {
          reconnectDelay.current = delay * 2;
          connect();
        }, delay);
      };

      ws.onerror = () => {
        // onclose fires after onerror — reconnect handled there
      };
    } catch {
      setStatus("disconnected");
    }
  }, [cleanup]);

  // Connect when we have account IDs, reconnect when the set changes
  useEffect(() => {
    mountedRef.current = true;

    if (accountIds.length > 0) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
      setStatus("disconnected");
      setLiveMap({});
    };
  }, [
    // Reconnect when the stringified list changes (new accounts added/removed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    accountIds.join(","),
    connect,
    cleanup,
  ]);

  return { liveMap, status };
}
