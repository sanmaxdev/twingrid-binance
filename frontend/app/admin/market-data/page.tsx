"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Database, Download, Trash2, Loader2, HardDrive, BarChart3, Clock, RefreshCw, Zap, CheckCircle, XCircle, AlertTriangle, Wrench } from "lucide-react";
import { adminService } from "@/lib/services/admin";
import { useConfirmDialog } from "@/components/ConfirmDialog";

const SYMBOLS = [
  { value: "BTCUSDT", label: "BTCUSDT", icon: "₿" },
  { value: "ETHUSDT", label: "ETHUSDT", icon: "Ξ" },
  { value: "SOLUSDT", label: "SOLUSDT", icon: "◎" },
  { value: "XRPUSDT", label: "XRPUSDT", icon: "✕" },
];

const INTERVALS = [
  { value: "1m", label: "1 Minute", size: "~35 MB/yr" },
  { value: "5m", label: "5 Minute", size: "~7 MB/yr" },
  { value: "15m", label: "15 Minute", size: "~2.5 MB/yr" },
  { value: "1h", label: "1 Hour", size: "~600 KB/yr" },
  { value: "4h", label: "4 Hour", size: "~150 KB/yr" },
  { value: "1d", label: "1 Day", size: "~25 KB/yr" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

export default function MarketDataPage() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Download form
  const [dlSymbol, setDlSymbol] = useState("BTCUSDT");
  const [dlIntervals, setDlIntervals] = useState<string[]>(["5m", "1h"]);
  const [dlStartYear, setDlStartYear] = useState(2024);
  const [dlStartMonth, setDlStartMonth] = useState(1);
  const [dlEndYear, setDlEndYear] = useState(new Date().getFullYear());
  const [dlEndMonth, setDlEndMonth] = useState(new Date().getMonth() + 1);
  const [dlFunding, setDlFunding] = useState(true);
  const [updateLogs, setUpdateLogs] = useState<any[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await adminService.getMarketDataStatus();
      setStatus(data);
    } catch (err: any) {
      toast.error("Failed to load market data status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await adminService.getUpdateLogs();
      setUpdateLogs(data?.logs || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh status every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchLogs]);

  const handleDownload = async () => {
    // ── Smart skip info: only show when klines for selected intervals already exist ──
    if (status?.items?.length) {
      const startYM = `${dlStartYear}-${String(dlStartMonth).padStart(2, "0")}`;
      const endYM = `${dlEndYear}-${String(dlEndMonth).padStart(2, "0")}`;

      const overlappingKlines = status.items.filter((item: any) => {
        if (item.symbol !== dlSymbol) return false;
        if (item.data_type !== "klines") return false;
        if (!dlIntervals.includes(item.interval)) return false;
        const cachedStart = item.earliest?.slice(0, 7) || "";
        const cachedEnd = item.latest?.slice(0, 7) || "";
        return cachedEnd >= startYM && cachedStart <= endYM;
      });

      if (overlappingKlines.length > 0) {
        // Also find overlapping funding for the message (informational only)
        const overlappingFunding = status.items.filter((item: any) => {
          if (item.symbol !== dlSymbol || item.data_type !== "funding_rate" || !dlFunding) return false;
          const cachedStart = item.earliest?.slice(0, 7) || "";
          const cachedEnd = item.latest?.slice(0, 7) || "";
          return cachedEnd >= startYM && cachedStart <= endYM;
        });

        const allOverlapping = [...overlappingKlines, ...overlappingFunding];
        const details = allOverlapping.map((item: any) => {
          const label = item.data_type === "klines" ? `${item.interval} klines` : "Funding rates";
          return `• ${label}: ${item.months_cached} months cached (${item.earliest?.slice(0, 7)} → ${item.latest?.slice(0, 7)})`;
        }).join("\n");

        const ok = await confirm({
          title: `Download ${dlSymbol} Data`,
          message: `Some data already exists and will be kept:\n\n${details}\n\nOnly missing months will be downloaded. The current month will be refreshed to include the latest data.`,
          confirmLabel: "Download Missing",
          variant: "info",
        });
        if (!ok) return;
      }
    }

    setDownloading(true);
    try {
      const result = await adminService.downloadMarketData({
        symbol: dlSymbol,
        intervals: dlIntervals,
        start_year: dlStartYear,
        start_month: dlStartMonth,
        end_year: dlEndYear,
        end_month: dlEndMonth,
        include_funding: dlFunding,
      });

      const totalCandles = result.results?.reduce((a: number, r: any) => a + (r.total_candles || 0), 0) || 0;
      const totalFunding = result.results?.reduce((a: number, r: any) => a + (r.total_funding_records || 0), 0) || 0;
      const totalSkipped = result.results?.reduce((a: number, r: any) => a + (r.months_skipped || 0), 0) || 0;
      const totalDownloaded = result.results?.reduce((a: number, r: any) => a + (r.months_downloaded || 0), 0) || 0;

      if (totalDownloaded === 0 && totalSkipped > 0) {
        toast.success(`All ${totalSkipped} months already cached — nothing to download`);
      } else {
        const parts = [];
        if (totalCandles > 0) parts.push(`${formatNumber(totalCandles)} candles`);
        if (totalFunding > 0) parts.push(`${formatNumber(totalFunding)} funding rates`);
        const skipMsg = totalSkipped > 0 ? ` (${totalSkipped} months skipped — already cached)` : "";
        toast.success(`Downloaded ${parts.join(" + ")}${skipMsg}`);
      }
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const handleClear = async (symbol?: string) => {
    const ok = await confirm({
      title: symbol ? `Clear ${symbol} Data` : "Clear All Market Data",
      message: symbol
        ? `This will permanently delete all cached klines and funding rate data for ${symbol}.\nYou will need to re-download it before running offline backtests.`
        : "This will permanently delete ALL cached market data for every symbol.\nYou will need to re-download everything before running offline backtests.",
      confirmLabel: symbol ? `Delete ${symbol}` : "Delete All",
      variant: "danger",
    });
    if (!ok) return;
    setClearing(true);
    try {
      const result = await adminService.clearMarketData(symbol);
      toast.success(`Deleted ${result.deleted_chunks} data chunks`);
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Clear failed");
    } finally {
      setClearing(false);
    }
  };

  const handleTriggerUpdate = async () => {
    setTriggering(true);
    try {
      const res = await adminService.triggerUpdate();
      toast.success(res.message || "Update triggered!");
      // Poll for completion after a short delay
      setTimeout(() => { fetchStatus(); fetchLogs(); }, 5000);
      setTimeout(() => { fetchStatus(); fetchLogs(); }, 15000);
      setTimeout(() => { fetchStatus(); fetchLogs(); }, 30000);
    } catch (err: any) {
      toast.error(err.message || "Trigger failed");
    } finally {
      setTriggering(false);
    }
  };

  const handleFixGaps = async (symbol?: string) => {
    setFixing(symbol || "all");
    try {
      const result = await adminService.fixGaps(symbol);
      if (result.gaps_found === 0) {
        toast.success("No gaps found — data is complete!");
      } else {
        const msg = `Fixed ${result.gaps_fixed}/${result.gaps_found} gaps`;
        if (result.gaps_failed > 0) {
          toast.warning(`${msg} (${result.gaps_failed} failed)`);
        } else {
          toast.success(msg);
        }
      }
      fetchStatus();
    } catch (err: any) {
      toast.error(err.message || "Fix gaps failed");
    } finally {
      setFixing(null);
    }
  };

  const toggleInterval = (iv: string) => {
    setDlIntervals(prev =>
      prev.includes(iv) ? prev.filter(i => i !== iv) : [...prev, iv]
    );
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2019 + 1 }, (_, i) => 2019 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  // Group status items by symbol
  const grouped: Record<string, any[]> = {};
  if (status?.items) {
    for (const item of status.items) {
      if (!grouped[item.symbol]) grouped[item.symbol] = [];
      grouped[item.symbol].push(item);
    }
  }

  const totalBytes = status?.items?.reduce((a: number, i: any) => a + (i.total_bytes || 0), 0) || 0;
  const totalRecords = status?.items?.reduce((a: number, i: any) => a + (i.total_records || 0), 0) || 0;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Market Data Cache</h1>
          <p className="text-[#848E9C] text-sm">Download and manage historical Binance data for offline backtesting</p>
        </div>
        <button onClick={() => { setLoading(true); fetchStatus(); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#2B2F36] hover:bg-[#363A45] border border-[#2B2F36] text-[#848E9C] hover:text-white rounded-xl text-sm font-bold transition-all">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* ── Overview Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-[#2B2F36] rounded-xl p-4 border border-[#2B2F36]">
          <div className="text-[11px] text-[#848E9C] uppercase tracking-wider mb-1">Symbols Cached</div>
          <div className="text-xl font-bold text-white">{Object.keys(grouped).length}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 border border-[#2B2F36]">
          <div className="text-[11px] text-[#848E9C] uppercase tracking-wider mb-1">Total Records</div>
          <div className="text-xl font-bold text-[#F0B90B]">{formatNumber(totalRecords)}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 border border-[#2B2F36]">
          <div className="text-[11px] text-[#848E9C] uppercase tracking-wider mb-1">Storage Used</div>
          <div className="text-xl font-bold text-white">{formatBytes(totalBytes)}</div>
        </div>
        <div className="bg-[#2B2F36] rounded-xl p-4 border border-[#2B2F36]">
          <div className="text-[11px] text-[#848E9C] uppercase tracking-wider mb-1">Data Sets</div>
          <div className="text-xl font-bold text-white">{status?.items?.length || 0}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
        {/* ── Download Panel ── */}
        <div className="bg-[#2B2F36] border border-[#2B2F36] rounded-xl p-5 space-y-5 h-fit">
          <div className="text-xs font-bold text-[#F0B90B] uppercase tracking-wider">Download Data</div>

          {/* Symbol */}
          <div>
            <label className="text-xs text-[#848E9C] mb-1.5 block">Symbol</label>
            <div className="flex gap-2">
              {SYMBOLS.map(s => (
                <button key={s.value} onClick={() => setDlSymbol(s.value)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${dlSymbol === s.value
                    ? "bg-[#F0B90B] text-black"
                    : "bg-[#181A20] text-[#848E9C] hover:text-white border border-[#2B2F36]"
                  }`}>
                  {s.icon} {s.label.replace("USDT", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Intervals */}
          <div>
            <label className="text-xs text-[#848E9C] mb-1.5 block">Intervals</label>
            <div className="grid grid-cols-3 gap-2">
              {INTERVALS.map(iv => (
                <button key={iv.value} onClick={() => toggleInterval(iv.value)}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${dlIntervals.includes(iv.value)
                    ? "bg-[#F0B90B]/20 text-[#F0B90B] border border-[#F0B90B]/40"
                    : "bg-[#181A20] text-[#848E9C] border border-[#2B2F36]"
                  }`}>
                  {iv.value}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label className="text-xs text-[#848E9C] mb-1.5 block">Date Range</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-[#5E6673] mb-1">From</div>
                <div className="flex gap-1">
                  <select value={dlStartYear} onChange={e => setDlStartYear(Number(e.target.value))}
                    className="flex-1 bg-[#181A20] border border-[#2B2F36] rounded-lg px-2 py-2 text-xs text-white">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={dlStartMonth} onChange={e => setDlStartMonth(Number(e.target.value))}
                    className="w-16 bg-[#181A20] border border-[#2B2F36] rounded-lg px-2 py-2 text-xs text-white">
                    {months.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#5E6673] mb-1">To</div>
                <div className="flex gap-1">
                  <select value={dlEndYear} onChange={e => setDlEndYear(Number(e.target.value))}
                    className="flex-1 bg-[#181A20] border border-[#2B2F36] rounded-lg px-2 py-2 text-xs text-white">
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={dlEndMonth} onChange={e => setDlEndMonth(Number(e.target.value))}
                    className="w-16 bg-[#181A20] border border-[#2B2F36] rounded-lg px-2 py-2 text-xs text-white">
                    {months.map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Funding Toggle */}
          <label className="flex items-center justify-between gap-3 cursor-pointer py-2">
            <span className="text-sm text-[#B7BDC6]">Include Funding Rates</span>
            <div className={`w-10 h-5 rounded-full transition-colors relative ${dlFunding ? "bg-[#F0B90B]" : "bg-[#363A45]"}`}
              onClick={() => setDlFunding(!dlFunding)}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${dlFunding ? "left-5" : "left-0.5"}`} />
            </div>
          </label>

          {/* Download Button */}
          <button onClick={handleDownload} disabled={downloading || dlIntervals.length === 0}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 bg-[#F0B90B] hover:bg-[#D4A20B] text-black disabled:opacity-50 disabled:cursor-not-allowed">
            {downloading ? (
              <><Loader2 size={16} className="animate-spin" /> Downloading...</>
            ) : (
              <><Download size={16} /> Download {dlSymbol}</>
            )}
          </button>
          {downloading && (
            <p className="text-[10px] text-[#848E9C] text-center">This may take several minutes for large date ranges</p>
          )}
        </div>

        {/* ── Data Status ── */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[#F0B90B]" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="bg-[#2B2F36] rounded-xl p-12 text-center border border-[#2B2F36]">
              <Database size={48} className="text-[#363A45] mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No Cached Data</h3>
              <p className="text-sm text-[#848E9C] max-w-md mx-auto">
                Download historical market data from Binance to enable faster, offline backtesting with real funding rates.
              </p>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([symbol, items]) => {
                const symBytes = items.reduce((a: number, i: any) => a + (i.total_bytes || 0), 0);
                const symRecords = items.reduce((a: number, i: any) => a + (i.total_records || 0), 0);
                return (
                  <div key={symbol} className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-[#363A45]">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-white">{symbol}</span>
                        <span className="text-xs text-[#848E9C]">
                          {formatNumber(symRecords)} records · {formatBytes(symBytes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {items.some((i: any) => i.has_gaps) && (
                          <button onClick={() => handleFixGaps(symbol)} disabled={!!fixing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-50">
                            {fixing === symbol ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                            Fix Gaps
                          </button>
                        )}
                        <button onClick={() => handleClear(symbol)} disabled={clearing}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#F6465D] hover:bg-[#F6465D]/10 transition-all">
                          <Trash2 size={12} /> Clear
                        </button>
                      </div>
                    </div>
                    <div className="divide-y divide-[#181A20]">
                      {items.map((item: any, idx: number) => (
                        <div key={idx} className="px-5 py-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${item.data_type === "klines"
                                ? "bg-[#F0B90B]/15 text-[#F0B90B]"
                                : "bg-[#0ECB81]/15 text-[#0ECB81]"
                              }`}>
                                {item.data_type === "klines" ? item.interval : "Funding"}
                              </span>
                              <span className="text-sm text-white">
                                {formatNumber(item.total_records)} records
                              </span>
                              {item.has_gaps && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20">
                                  ⚠ {item.missing_months?.length} gaps
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-[#848E9C]">
                              <span>{item.months_cached} months</span>
                              <span>{item.earliest?.slice(0, 7)} → {item.latest?.slice(0, 7)}</span>
                              <span>{formatBytes(item.total_bytes)}</span>
                            </div>
                          </div>
                          {item.has_gaps && item.missing_months?.length > 0 && (
                            <div className="mt-2 px-2 py-1.5 bg-orange-500/5 border border-orange-500/15 rounded-lg">
                              <span className="text-[10px] text-orange-400 font-medium">
                                Missing months: {item.missing_months.slice(0, 12).join(", ")}
                                {item.missing_months.length > 12 && ` +${item.missing_months.length - 12} more`}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Global Actions */}
              <div className="flex justify-end gap-3">
                {status?.items?.some((i: any) => i.has_gaps) && (
                  <button onClick={() => handleFixGaps()} disabled={!!fixing}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-amber-400 hover:bg-amber-500/10 border border-amber-500/20 transition-all disabled:opacity-50">
                    {fixing === "all" ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                    Fix All Gaps
                  </button>
                )}
                <button onClick={() => handleClear()} disabled={clearing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-[#F6465D] hover:bg-[#F6465D]/10 border border-[#F6465D]/20 transition-all">
                  <Trash2 size={14} /> Clear All Data
                </button>
              </div>

              {/* Auto-Update Section */}
              <div className="bg-[#2B2F36] rounded-xl border border-[#2B2F36] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#363A45]">
                  <div className="flex items-center gap-3">
                    <Zap size={16} className="text-[#F0B90B]" />
                    <div>
                      <span className="text-sm font-bold text-white">Auto-Update</span>
                      <span className="text-xs text-[#848E9C] ml-2">Daily at 00:30 UTC</span>
                    </div>
                  </div>
                  <button onClick={handleTriggerUpdate} disabled={triggering}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F0B90B]/10 hover:bg-[#F0B90B]/20 border border-[#F0B90B]/30 text-[#F0B90B] rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                    {triggering ? <><Loader2 size={12} className="animate-spin" /> Triggering...</> : <><RefreshCw size={12} /> Update Now</>}
                  </button>
                </div>

                {updateLogs.length > 0 ? (
                  <div className="divide-y divide-[#181A20] max-h-[300px] overflow-y-auto">
                    {updateLogs.slice(0, 20).map((log: any, idx: number) => {
                      const ts = log.timestamp ? new Date(log.timestamp) : null;
                      const fmtDate = ts ? ts.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
                      const fmtTime = ts ? ts.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "";
                      const isOk = log.status === "ok";
                      const isPartial = log.status === "partial";
                      const isFailed = log.status === "failed";
                      return (
                        <div key={idx} className="px-5 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isOk ? <CheckCircle size={14} className="text-emerald-400" /> :
                             isPartial ? <AlertTriangle size={14} className="text-amber-400" /> :
                             isFailed ? <XCircle size={14} className="text-[#F6465D]" /> :
                             <Clock size={14} className="text-[#848E9C]" />}
                            <div>
                              <div className="text-xs text-white font-medium">
                                {fmtDate} <span className="text-[#848E9C] font-mono">{fmtTime}</span>
                              </div>
                              <div className="text-[10px] text-[#848E9C]">
                                {log.datasets_updated || 0} datasets · {formatNumber(log.total_candles || 0)} candles
                                {(log.total_funding || 0) > 0 && ` · ${formatNumber(log.total_funding)} funding`}
                                {log.errors?.length > 0 && <span className="text-[#F6465D] ml-1">({log.errors.length} errors)</span>}
                              </div>
                            </div>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                            isOk ? "bg-emerald-500/15 text-emerald-400" :
                            isPartial ? "bg-amber-500/15 text-amber-400" :
                            isFailed ? "bg-[#F6465D]/15 text-[#F6465D]" :
                            "bg-[#363A45] text-[#848E9C]"
                          }`}>{log.status || "unknown"}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-5 py-6 text-center">
                    <p className="text-xs text-[#848E9C]">No update logs yet. Click "Update Now" or wait for the daily schedule.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {ConfirmDialog}
    </div>
  );
}
