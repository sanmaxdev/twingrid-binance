"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { adminService } from "@/lib/services/admin";
import { toast } from "sonner";
import {
  RefreshCw, Cpu, HardDrive, Wifi, Clock, Terminal,
  Server, ChevronDown, Activity, Database, X, Maximize2, Trash2
} from "lucide-react";
import Sparkline, { LargeChart } from "@/components/Sparkline";

const MAX_HISTORY = 360; // 1 hour at 10s intervals

type HistoryPoint = { t: number; cpu: number; mem: number; disk: number; load: number; netSent: number; netRecv: number };

/* ─── Gauge Component ─── */
function UsageGauge({ percent, color, size = 120 }: { percent: number; color: string; size?: number }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="#181A20" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-700 ease-out" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold font-mono text-[#EAECEF]">{percent}%</span>
      </div>
    </div>
  );
}

/* ─── Stat Bar ─── */
function StatBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-[#848E9C]">{label}</span>
        <span className="text-[#EAECEF] font-mono">{value} / {max} {unit}</span>
      </div>
      <div className="h-2 bg-[#181A20] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

/* ─── Detail Modal ─── */
function ChartModal({ isOpen, onClose, history, metric }: {
  isOpen: boolean; onClose: () => void;
  history: HistoryPoint[];
  metric: "cpu" | "mem" | "disk";
}) {
  if (!isOpen) return null;
  const cfg = {
    cpu:  { label: "CPU Usage",    color: "#3B82F6", unit: "%", key: "cpu"  as const },
    mem:  { label: "Memory Usage", color: "#A855F7", unit: "%", key: "mem"  as const },
    disk: { label: "Disk Usage",   color: "#F0B90B", unit: "%", key: "disk" as const },
  }[metric];

  const data = history.map(h => ({ t: h.t, v: h[cfg.key] }));
  const loadData = history.map(h => ({ t: h.t, v: h.load }));

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[#181A20] border border-[#2B3139] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2B3139] shrink-0">
          <h2 className="text-base font-bold text-[#EAECEF] flex items-center gap-2">
            <Activity className="h-4.5 w-4.5 text-[#F0B90B]" />
            Resource History — {cfg.label}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#2B3139] text-[#5E6673] hover:text-[#EAECEF] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">
          {/* Status bar */}
          <div className="flex flex-wrap items-center gap-4 bg-[#2B2F36] rounded-xl p-3 text-[10px]">
            <span className="text-[#848E9C]">Data points: <span className="text-[#EAECEF] font-mono font-bold">{data.length}</span></span>
            <span className="text-[#848E9C]">Interval: <span className="text-[#EAECEF] font-mono">10s</span></span>
            <span className="text-[#848E9C]">Window: <span className="text-[#EAECEF] font-mono">{Math.round(data.length * 10 / 60)}m</span></span>
            {data.length > 0 && (
              <span className="text-[#848E9C] ml-auto">
                Since {new Date(data[0].t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
              </span>
            )}
          </div>

          {/* Main chart */}
          <div className="bg-[#2B2F36] rounded-xl p-4">
            <LargeChart data={data} color={cfg.color} label={cfg.label} unit={cfg.unit} height={220} />
          </div>

          {/* Load average chart (CPU modal only) */}
          {metric === "cpu" && (
            <div className="bg-[#2B2F36] rounded-xl p-4">
              <LargeChart data={loadData} color="#0ECB81" label="Load Average (1m)" unit="" height={160} />
            </div>
          )}

          {/* Stats summary */}
          <div className="grid grid-cols-4 gap-3">
            {(() => {
              const vals = data.map(d => d.v);
              if (vals.length === 0) return null;
              const cur = vals[vals.length - 1];
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              const mn = Math.min(...vals);
              const mx = Math.max(...vals);
              return [
                { l: "Current", v: cur.toFixed(1), c: cfg.color },
                { l: "Average", v: avg.toFixed(1), c: "#EAECEF" },
                { l: "Min", v: mn.toFixed(1), c: "#0ECB81" },
                { l: "Max", v: mx.toFixed(1), c: mx > 90 ? "#F6465D" : "#F0B90B" },
              ].map((s, i) => (
                <div key={i} className="bg-[#181A20] rounded-lg p-3 text-center">
                  <div className="text-[9px] text-[#5E6673] uppercase tracking-wider mb-1">{s.l}</div>
                  <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}{cfg.unit}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function SystemMonitorPage() {
  const [resources, setResources] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [logLevel, setLogLevel] = useState("all");
  const [logLines, setLogLines] = useState(100);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [modalMetric, setModalMetric] = useState<"cpu" | "mem" | "disk" | null>(null);
  const [pruning, setPruning] = useState(false);
  const historyRef = useRef<HistoryPoint[]>([]);

  const fetchResources = useCallback(async () => {
    try {
      const data = await adminService.getSystemResources();
      setResources(data);

      // Append to history buffer
      const pt: HistoryPoint = {
        t: Date.now(),
        cpu: data.cpu.usage_percent,
        mem: data.memory.usage_percent,
        disk: data.disk.usage_percent,
        load: data.cpu.load_avg_1m,
        netSent: data.network.bytes_sent_mb,
        netRecv: data.network.bytes_recv_mb,
      };
      const next = [...historyRef.current, pt].slice(-MAX_HISTORY);
      historyRef.current = next;
      setHistory(next);
    } catch (e: any) { toast.error(e.message || "Failed to fetch system resources"); }
    finally { setLoading(false); }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await adminService.getSystemLogs(logLines, logLevel);
      setLogs(data.logs || []);
    } catch (e: any) { toast.error(e.message || "Failed to fetch logs"); }
    finally { setLogsLoading(false); }
  }, [logLevel, logLines]);

  useEffect(() => { fetchResources(); fetchLogs(); }, []);
  useEffect(() => { fetchLogs(); }, [logLevel, logLines]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchResources, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchResources]);

  const handlePruneCache = async () => {
    setPruning(true);
    try {
      const res = await adminService.pruneDockerCache();
      if (res.success) {
        toast.success(`Docker build cache cleared — freed ${res.freed_label}`);
        // Refresh disk stats
        await fetchResources();
      } else {
        toast.error("Cache prune failed");
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to prune cache");
    } finally {
      setPruning(false);
    }
  };

  const r = resources;
  const getColor = (pct: number) => pct > 90 ? "#F6465D" : pct > 70 ? "#F0B90B" : "#0ECB81";

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 bg-[#F0B90B] rounded-full animate-pulse" />
        <span className="text-sm text-[#848E9C]">Loading system data...</span>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[#EAECEF] flex items-center gap-2">
            <Server className="h-6 w-6 text-[#F0B90B]" /> System Monitor
          </h1>
          <p className="text-sm text-[#848E9C] mt-1">
            Live EC2 resource usage &amp; application logs
            {r && <span className="ml-2 text-[10px] bg-[#2B2F36] px-2 py-0.5 rounded text-[#848E9C]">{r.system.hostname}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
              autoRefresh
                ? "bg-[#0ECB81]/10 text-[#0ECB81] border-[#0ECB81]/20"
                : "bg-[#2B2F36] text-[#848E9C] border-[#2B2F36]"
            }`}
          >
            <Activity className={`h-3 w-3 ${autoRefresh ? "animate-pulse" : ""}`} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <button onClick={() => { fetchResources(); fetchLogs(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#2B2F36] text-[#EAECEF] hover:bg-[#2B2F36]/80 border border-[#2B2F36] transition-all">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </div>

      {r && (
        <>
          {/* ─── Resource Gauges ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* CPU */}
            <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-blue-500/10"><Cpu className="h-4 w-4 text-blue-400" /></div>
                  <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">CPU</span>
                  <button onClick={() => setModalMetric("cpu")} className="ml-auto p-1 rounded hover:bg-[#181A20] text-[#5E6673] hover:text-blue-400 transition-all" title="Expand">
                    <Maximize2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <UsageGauge percent={r.cpu.usage_percent} color={getColor(r.cpu.usage_percent)} />
                  <div className="space-y-2 text-xs flex-1">
                    <div className="flex justify-between"><span className="text-[#848E9C]">Cores</span><span className="text-[#EAECEF] font-mono">{r.cpu.cores_physical || r.cpu.cores_logical}</span></div>
                    <div className="flex justify-between"><span className="text-[#848E9C]">Logical</span><span className="text-[#EAECEF] font-mono">{r.cpu.cores_logical}</span></div>
                    {r.cpu.frequency_mhz && <div className="flex justify-between"><span className="text-[#848E9C]">Freq</span><span className="text-[#EAECEF] font-mono">{r.cpu.frequency_mhz} MHz</span></div>}
                    <div className="flex justify-between"><span className="text-[#848E9C]">Load (1m)</span><span className="text-[#EAECEF] font-mono">{r.cpu.load_avg_1m}</span></div>
                  </div>
                </div>
              </div>
              {/* Sparkline */}
              <button onClick={() => setModalMetric("cpu")} className="w-full border-t border-[#181A20] px-3 py-2 bg-[#1E2329]/50 hover:bg-[#1E2329] transition-colors cursor-pointer group">
                <Sparkline data={history.map(h => h.cpu)} color="#3B82F6" height={36} width={400} className="w-full" />
              </button>
            </div>

            {/* Memory */}
            <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-purple-500/10"><Database className="h-4 w-4 text-purple-400" /></div>
                  <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Memory</span>
                  <button onClick={() => setModalMetric("mem")} className="ml-auto p-1 rounded hover:bg-[#181A20] text-[#5E6673] hover:text-purple-400 transition-all" title="Expand">
                    <Maximize2 size={12} />
                  </button>
                </div>
                <div className="flex items-center gap-5">
                  <UsageGauge percent={r.memory.usage_percent} color={getColor(r.memory.usage_percent)} />
                  <div className="space-y-3 flex-1">
                    <StatBar label="RAM" value={r.memory.used_gb} max={r.memory.total_gb} unit="GB" color={getColor(r.memory.usage_percent)} />
                    {r.memory.swap_total_gb > 0 && (
                      <StatBar label="Swap" value={r.memory.swap_used_gb} max={r.memory.swap_total_gb} unit="GB" color="#F0B90B" />
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setModalMetric("mem")} className="w-full border-t border-[#181A20] px-3 py-2 bg-[#1E2329]/50 hover:bg-[#1E2329] transition-colors cursor-pointer">
                <Sparkline data={history.map(h => h.mem)} color="#A855F7" height={36} width={400} className="w-full" />
              </button>
            </div>

            {/* Disk */}
            <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] hover:border-[#F0B90B]/20 transition-all overflow-hidden">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 rounded-lg bg-amber-500/10"><HardDrive className="h-4 w-4 text-amber-400" /></div>
                  <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Storage</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={handlePruneCache}
                      disabled={pruning}
                      title="Clean Docker Build Cache"
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                        pruning
                          ? "bg-amber-500/5 text-amber-400/50 border-amber-500/10 cursor-not-allowed"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20 hover:border-amber-500/40"
                      }`}
                    >
                      {pruning ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      {pruning ? "Cleaning..." : "Clean Cache"}
                    </button>
                    <button onClick={() => setModalMetric("disk")} className="p-1 rounded hover:bg-[#181A20] text-[#5E6673] hover:text-amber-400 transition-all" title="Expand">
                      <Maximize2 size={12} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <UsageGauge percent={r.disk.usage_percent} color={getColor(r.disk.usage_percent)} />
                  <div className="space-y-3 flex-1">
                    <StatBar label="Disk" value={r.disk.used_gb} max={r.disk.total_gb} unit="GB" color={getColor(r.disk.usage_percent)} />
                    <div className="text-xs text-[#848E9C]">{r.disk.free_gb} GB free</div>
                  </div>
                </div>
              </div>
              <button onClick={() => setModalMetric("disk")} className="w-full border-t border-[#181A20] px-3 py-2 bg-[#1E2329]/50 hover:bg-[#1E2329] transition-colors cursor-pointer">
                <Sparkline data={history.map(h => h.disk)} color="#F0B90B" height={36} width={400} className="w-full" />
              </button>
            </div>
          </div>

          {/* ─── System Info + Network ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {/* System Info */}
            <div className="bg-[#2B2F36] rounded-xl p-5 border border-[#2B2F36]">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-[#F0B90B]/10"><Clock className="h-4 w-4 text-[#F0B90B]" /></div>
                <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">System Info</span>
              </div>
              <div className="space-y-2.5 text-xs">
                {[
                  ["Hostname", r.system.hostname],
                  ["OS", r.system.os],
                  ["Architecture", r.system.architecture],
                  ["Python", r.system.python_version],
                  ["Uptime", `${r.system.uptime_hours} hours`],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <span className="text-[#848E9C]">{k}</span>
                    <span className="text-[#EAECEF] font-mono text-right truncate ml-3 max-w-[60%]">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Network */}
            <div className="bg-[#2B2F36] rounded-xl p-5 border border-[#2B2F36]">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 rounded-lg bg-cyan-500/10"><Wifi className="h-4 w-4 text-cyan-400" /></div>
                <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Network (since boot)</span>
              </div>
              <div className="space-y-2.5 text-xs">
                {[
                  ["Sent", `${r.network.bytes_sent_mb} MB`],
                  ["Received", `${r.network.bytes_recv_mb} MB`],
                  ["Packets Sent", r.network.packets_sent?.toLocaleString()],
                  ["Packets Recv", r.network.packets_recv?.toLocaleString()],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <span className="text-[#848E9C]">{k}</span>
                    <span className="text-[#EAECEF] font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Top Processes ─── */}
          {r.top_processes?.length > 0 && (
            <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] mb-8 overflow-hidden">
              <div className="px-5 py-3 border-b border-[#181A20] flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-[#F0B90B]" />
                <span className="text-xs font-semibold text-[#848E9C] uppercase tracking-wider">Top Processes by Memory</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[400px]">
                  <thead className="bg-[#0B0E11] text-[#848E9C] uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-semibold">PID</th>
                      <th className="px-5 py-2.5 text-left font-semibold">Process</th>
                      <th className="px-5 py-2.5 text-right font-semibold">Memory %</th>
                      <th className="px-5 py-2.5 text-right font-semibold">CPU %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181A20]">
                    {r.top_processes.map((p: any, i: number) => (
                      <tr key={i} className="hover:bg-[#181A20]/60 transition-colors">
                        <td className="px-5 py-2.5 text-[#848E9C] font-mono">{p.pid}</td>
                        <td className="px-5 py-2.5 text-[#EAECEF] font-medium">{p.name}</td>
                        <td className="px-5 py-2.5 text-right font-mono text-[#EAECEF]">{p.memory_percent}%</td>
                        <td className="px-5 py-2.5 text-right font-mono text-[#EAECEF]">{p.cpu_percent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Logs Section ─── */}
      <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#181A20] flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-[#0ECB81]" />
            <span className="text-sm font-semibold text-[#EAECEF]">Application Logs</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}
                className="appearance-none bg-[#181A20] border border-[#2B2F36] text-xs text-[#EAECEF] rounded-lg px-3 py-1.5 pr-7 focus:ring-1 focus:ring-[#F0B90B]/50 focus:outline-none cursor-pointer">
                <option value="all">All Levels</option>
                <option value="info">INFO</option>
                <option value="warning">WARNING</option>
                <option value="error">ERROR</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#848E9C] pointer-events-none" />
            </div>
            <div className="relative">
              <select value={logLines} onChange={(e) => setLogLines(Number(e.target.value))}
                className="appearance-none bg-[#181A20] border border-[#2B2F36] text-xs text-[#EAECEF] rounded-lg px-3 py-1.5 pr-7 focus:ring-1 focus:ring-[#F0B90B]/50 focus:outline-none cursor-pointer">
                <option value={50}>50 lines</option>
                <option value={100}>100 lines</option>
                <option value={200}>200 lines</option>
                <option value={500}>500 lines</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#848E9C] pointer-events-none" />
            </div>
            <button onClick={fetchLogs} disabled={logsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#181A20] text-[#EAECEF] border border-[#2B2F36] hover:border-[#F0B90B]/30 transition-all disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${logsLoading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto p-0.5">
          <pre className="text-[11px] font-mono text-[#848E9C] p-4 leading-5 whitespace-pre-wrap break-all">
            {logs.length > 0 ? logs.join("\n") : "No logs available."}
          </pre>
        </div>
      </div>

      {/* Chart Modal */}
      <ChartModal
        isOpen={modalMetric !== null}
        onClose={() => setModalMetric(null)}
        history={history}
        metric={modalMetric || "cpu"}
      />
    </div>
  );
}
