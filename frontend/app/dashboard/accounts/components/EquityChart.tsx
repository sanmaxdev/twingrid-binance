"use client";
import { useEffect, useState, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";
import { historyService, type EquitySnapshot } from "@/lib/services/history";
import { RefreshCw, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fmt = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TIME_RANGES = [
  { label: "1H", hours: 1 },
  { label: "6H", hours: 6 },
  { label: "24H", hours: 24 },
  { label: "7D", hours: 168 },
  { label: "30D", hours: 720 },
];

interface EquityChartProps {
  accountId: string;
}

export default function EquityChart({ accountId }: EquityChartProps) {
  const [data, setData] = useState<EquitySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(24);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snapshots = await historyService.getEquityHistory(accountId, range);
      setData(snapshots);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, range]);

  useEffect(() => { load(); }, [load]);

  const chartData = data.map(s => ({
    time: new Date(s.recorded_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    fullTime: new Date(s.recorded_at).toLocaleString(),
    equity: Number(s.total_equity),
    balance: Number(s.wallet_balance),
    unrealizedPnl: Number(s.unrealized_pnl),
    marginUsed: Number(s.margin_used),
  }));

  const first = chartData[0]?.equity || 0;
  const last = chartData[chartData.length - 1]?.equity || 0;
  const change = last - first;
  const changePct = first > 0 ? ((change / first) * 100) : 0;
  const isPositive = change >= 0;
  const minEquity = Math.min(...chartData.map(d => d.equity), Infinity);
  const maxEquity = Math.max(...chartData.map(d => d.equity), -Infinity);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-neutral-900/95 backdrop-blur border border-neutral-700/50 rounded-xl px-4 py-3 shadow-2xl">
        <p className="text-[11px] text-neutral-500 mb-2">{d.fullTime}</p>
        <div className="space-y-1">
          <div className="flex justify-between gap-6">
            <span className="text-[11px] text-neutral-400">Equity</span>
            <span className="text-sm font-bold text-white font-mono">{fmt(d.equity)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-[11px] text-neutral-400">Balance</span>
            <span className="text-sm font-mono text-neutral-300">{fmt(d.balance)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-[11px] text-neutral-400">Unrealized PnL</span>
            <span className={`text-sm font-mono font-semibold ${d.unrealizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {d.unrealizedPnl >= 0 ? "+" : ""}{fmt(d.unrealizedPnl)}
            </span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-[11px] text-neutral-400">Margin Used</span>
            <span className="text-sm font-mono text-amber-400">{fmt(d.marginUsed)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-gradient-to-b from-neutral-900/80 to-neutral-900/40 border-neutral-800/60 shadow-xl overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isPositive ? "bg-emerald-500/10" : "bg-rose-500/10"}`}>
              {isPositive ? (
                <TrendingUp className="h-5 w-5 text-emerald-400" />
              ) : (
                <TrendingDown className="h-5 w-5 text-rose-400" />
              )}
            </div>
            <div>
              <CardTitle className="text-white text-lg">Equity Curve</CardTitle>
              {chartData.length > 1 && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-2xl font-bold text-white font-mono">{fmt(last)}</span>
                  <span className={`text-sm font-semibold font-mono px-2 py-0.5 rounded-md ${
                    isPositive ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                  }`}>
                    {isPositive ? "+" : ""}{fmt(change)} ({changePct.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-neutral-950/60 rounded-lg p-0.5 border border-neutral-800/50">
              {TIME_RANGES.map(r => (
                <button
                  key={r.hours}
                  onClick={() => setRange(r.hours)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    range === r.hours
                      ? "bg-blue-600 text-white shadow-lg"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-neutral-500 hover:text-white" onClick={load}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 pt-2 px-2">
        {loading ? (
          <div className="h-[280px] flex items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-neutral-600" />
          </div>
        ) : chartData.length < 2 ? (
          <div className="h-[280px] flex flex-col items-center justify-center gap-3">
            <Clock className="h-10 w-10 text-neutral-700" />
            <p className="text-neutral-500 text-sm">Waiting for equity snapshots…</p>
            <p className="text-neutral-600 text-xs">Snapshots are recorded every 60 seconds</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={isPositive ? "#10b981" : "#f43f5e"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "#737373" }}
                axisLine={{ stroke: "#404040" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[
                  (min: number) => Math.floor(min * 0.998),
                  (max: number) => Math.ceil(max * 1.002)
                ]}
                tick={{ fontSize: 10, fill: "#737373" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => "$" + v.toLocaleString()}
                width={80}
              />
              <Tooltip content={<CustomTooltip />} />
              {first > 0 && (
                <ReferenceLine
                  y={first}
                  stroke="#525252"
                  strokeDasharray="4 4"
                  label={{ value: "Start", position: "right", fill: "#737373", fontSize: 10 }}
                />
              )}
              <Area
                type="monotone"
                dataKey="equity"
                stroke={isPositive ? "#10b981" : "#f43f5e"}
                strokeWidth={2}
                fill="url(#equityGrad)"
                animationDuration={800}
                dot={false}
                activeDot={{ r: 4, fill: isPositive ? "#10b981" : "#f43f5e", stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
