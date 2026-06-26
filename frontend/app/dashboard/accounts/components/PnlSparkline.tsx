"use client";
import { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";
import { historyService } from "@/lib/services/history";

interface PnlSparklineProps {
  accountId: string;
  height?: number;
}

export default function PnlSparkline({ accountId, height = 48 }: PnlSparklineProps) {
  const [data, setData] = useState<{ t: string; v: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    historyService.getEquityHistory(accountId, 24)
      .then(snapshots => {
        if (!mounted) return;
        setData(snapshots.map(s => ({
          t: new Date(s.recorded_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          v: Number(s.total_equity),
        })));
      })
      .catch(() => {})
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [accountId]);

  if (loading || data.length < 2) return null;

  const first = data[0]?.v || 0;
  const last = data[data.length - 1]?.v || 0;
  const isPositive = last >= first;
  const color = isPositive ? "#10b981" : "#f43f5e";

  const MiniTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-neutral-900/95 border border-neutral-700/50 rounded-lg px-2.5 py-1.5 shadow-xl">
        <span className="text-[10px] text-neutral-400">{payload[0].payload.t}</span>
        <span className="text-xs font-bold text-white font-mono ml-2">
          ${payload[0].value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>
    );
  };

  return (
    <div className="mt-3 rounded-lg bg-neutral-950/40 border border-neutral-800/50 p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">24h Equity</span>
        <span className={`text-[11px] font-bold font-mono ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
          {isPositive ? "+" : ""}{((last - first) / (first || 1) * 100).toFixed(2)}%
        </span>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${accountId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip content={<MiniTooltip />} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${accountId})`}
            dot={false}
            animationDuration={600}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
