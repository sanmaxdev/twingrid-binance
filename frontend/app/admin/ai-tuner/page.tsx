"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Brain, Play, Square, Loader2, ChevronDown, ChevronUp,
  Trophy, Trash2, Clock, Sparkles, TrendingUp, Target,
  AlertTriangle, CheckCircle2, Zap, Copy, Check, RotateCcw, ShieldAlert, Wrench,
  Bot, User, Search
} from "lucide-react";
import api from "@/lib/api";

interface Message {
  type: "thinking" | "function_call" | "function_result" | "error" | "session_start" | "complete" | "session_id" | "done";
  data: any;
  timestamp: number;
}

interface SessionSummary {
  id: string;
  symbol: string;
  goal: string;
  status: string;
  backtests_run: number;
  best_sharpe: number;
  best_pnl_pct: number;
  best_max_drawdown: number;
  created_at: string;
  completed_at: string | null;
}

const PRESET_GOALS = [
  { label: "Max Sharpe Ratio", value: "Find the strategy settings that maximize Sharpe ratio while keeping max drawdown under 15%. Test with $1000 capital." },
  { label: "Conservative", value: "Find the safest possible settings with minimal drawdown (under 8%) and consistent profits. Prioritize capital preservation over returns. Test with $1000 capital." },
  { label: "Aggressive", value: "Maximize total PnL % with aggressive settings. I accept up to 20% drawdown. Test with $500 capital." },
];

function ResultCard({ result, rank }: { result: any; rank?: number }) {
  const isLiquidated = result.liquidated;
  const pnl = result.total_pnl_pct || 0;
  const sharpe = result.sharpe_ratio || 0;

  return (
    <div className={`rounded-lg border p-3 text-xs ${
      isLiquidated
        ? "border-[#F6465D]/30 bg-[#F6465D]/5"
        : sharpe > 2 ? "border-[#0ECB81]/30 bg-[#0ECB81]/5" : "border-[#2B2F36] bg-[#1E2026]"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {rank && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F0B90B]/10 text-[#F0B90B]">#{rank}</span>}
          <span className="font-medium text-[#EAECEF]">{result.label || "Test"}</span>
        </div>
        {isLiquidated && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F6465D]/20 text-[#F6465D]">LIQUIDATED</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[#848E9C] mb-0.5">PnL %</div>
          <div className={`font-bold ${pnl >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"}`}>{pnl.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-[#848E9C] mb-0.5">Sharpe</div>
          <div className={`font-bold ${sharpe >= 2 ? "text-[#0ECB81]" : sharpe >= 1 ? "text-[#F0B90B]" : "text-[#F6465D]"}`}>{sharpe.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-[#848E9C] mb-0.5">Max DD</div>
          <div className="font-bold text-[#EAECEF]">{(result.max_drawdown_pct || 0).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[#848E9C] mb-0.5">Win Rate</div>
          <div className="font-bold text-[#EAECEF]">{(result.win_rate || 0).toFixed(1)}%</div>
        </div>
        <div>
          <div className="text-[#848E9C] mb-0.5">Trades</div>
          <div className="font-bold text-[#EAECEF]">{result.total_trades || 0}</div>
        </div>
        <div>
          <div className="text-[#848E9C] mb-0.5">PF</div>
          <div className="font-bold text-[#EAECEF]">{(result.profit_factor || 0).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

function FunctionCallCard({ data, expanded, onToggle }: { data: any; expanded: boolean; onToggle: () => void }) {
  const isBacktest = data.name === "run_backtest";
  return (
    <div className="rounded-xl border border-[#2B2F36] bg-[#181A20] overflow-hidden my-2">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#2B2F36]/30 transition-colors">
        <div className="flex items-center gap-3 text-sm">
          <div className="w-6 h-6 rounded bg-[#F0B90B]/10 flex items-center justify-center">
            <Zap size={14} className="text-[#F0B90B]" />
          </div>
          <span className="font-medium text-[#EAECEF]">{data.name}</span>
          {isBacktest && data.args?.label && (
            <span className="text-[#848E9C] hidden sm:inline">— {data.args.label}</span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} className="text-[#848E9C]" /> : <ChevronDown size={16} className="text-[#848E9C]" />}
      </button>
      {expanded && (
        <div className="px-4 pb-3 text-xs text-[#848E9C] font-mono whitespace-pre-wrap border-t border-[#2B2F36] pt-3 bg-[#0B0E11]/50">
          {JSON.stringify(data.args || {}, null, 2)}
        </div>
      )}
    </div>
  );
}

export default function AiTunerPage() {
  const [goal, setGoal] = useState("");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [backtestCount, setBacktestCount] = useState(0);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [bestConfig, setBestConfig] = useState<Record<string, any> | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [maintenance, setMaintenance] = useState(true);
  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [canRun, setCanRun] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [statusLoaded, setStatusLoaded] = useState(false);
  
  // History Detail View State
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/admin/ai-tuner/status");
        const data = await res.json();
        setMaintenance(data.maintenance);
        setMaintenanceMsg(data.maintenance_message || "");
        setCanRun(data.can_run);
        setIsSuperAdmin(data.is_super_admin ?? false);
      } catch {
        setMaintenance(true);
        setCanRun(false);
      } finally {
        setStatusLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isRunning]);

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get("/admin/ai-tuner/sessions?limit=50");
      const data = await res.json();
      setSessions(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const fetchSessionDetails = async (id: string) => {
    setIsLoadingHistory(true);
    setSelectedSessionId(id);
    setIsViewingHistory(true);
    
    try {
      const res = await api.get(`/admin/ai-tuner/sessions/${id}`);
      const data = await res.json();
      
      setGoal(data.goal || "");
      setSymbol(data.symbol || "BTCUSDT");
      setMessages(data.messages || []);
      setResults(data.results || []);
      setBacktestCount(data.backtests_run || 0);
      setBestConfig(data.best_config || null);
    } catch (err) {
      setMessages([{ type: "error", data: { message: "Failed to load session history" }, timestamp: Date.now() }]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const startNewOptimization = () => {
    setSelectedSessionId(null);
    setIsViewingHistory(false);
    setMessages([]);
    setResults([]);
    setBacktestCount(0);
    setBestConfig(null);
    setGoal("");
  };

  const restartSession = () => {
    // Keep goal and symbol, but clear history to run again
    setSelectedSessionId(null);
    setIsViewingHistory(false);
    setMessages([]);
    setResults([]);
    setBacktestCount(0);
    setBestConfig(null);
  };

  const startOptimization = async () => {
    if (!goal.trim() || isRunning || !canRun || isViewingHistory) return;

    setIsRunning(true);
    setMessages([]);
    setResults([]);
    setBacktestCount(0);
    setBestConfig(null);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const response = await fetch("/api/v1/admin/ai-tuner/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ goal: goal.trim(), symbol }),
        signal: abort.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Request failed" }));
        setMessages(prev => [...prev, { type: "error", data: { message: err.detail || "Failed to start" }, timestamp: Date.now() }]);
        setIsRunning(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setIsRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      // Push initial user message for chat UI
      setMessages([{ type: "session_start", data: { goal, symbol }, timestamp: Date.now() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              const msg: Message = { type: currentEvent as any, data, timestamp: Date.now() };
              
              if (currentEvent !== "session_start") {
                 setMessages(prev => [...prev, msg]);
              }

              if (currentEvent === "function_result" && data.name === "run_backtest" && data.result && !data.result.error) {
                setResults(prev => {
                  // Prevent duplicates if backend sends same result twice
                  if (prev.some(r => JSON.stringify(r) === JSON.stringify(data.result))) return prev;
                  return [...prev, data.result];
                });
                setBacktestCount(data.backtest_count || 0);
              }
              if (currentEvent === "complete" && data.best_config) {
                setBestConfig(data.best_config);
              }
            } catch { /* ignore parse errors */ }
            currentEvent = "";
          }
        }
      }
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev, { type: "error", data: { message: e.message || "Connection lost" }, timestamp: Date.now() }]);
      }
    } finally {
      setIsRunning(false);
      loadSessions();
    }
  };

  const stopOptimization = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const toggleCallExpansion = (id: string) => {
    setExpandedCalls(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyConfig = () => {
    if (bestConfig) {
      navigator.clipboard.writeText(JSON.stringify(bestConfig, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/admin/ai-tuner/sessions/${id}`);
      if (selectedSessionId === id) {
        startNewOptimization();
      }
      loadSessions();
    } catch { /* ignore */ }
  };

  return (
    <div className="flex h-[calc(100vh-80px)] w-full overflow-hidden bg-[#0B0E11]">
      
      {/* ─── Left Sidebar: History (280px) ─────────────────────────────────── */}
      <div className="w-[280px] border-r border-[#2B2F36] flex flex-col bg-[#1E2026] hidden md:flex flex-shrink-0">
        <div className="p-4 border-b border-[#2B2F36]">
          <button 
            onClick={startNewOptimization}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#2B2F36] hover:bg-[#363A45] text-[#EAECEF] font-medium text-sm transition-colors"
          >
            <Sparkles size={16} className="text-purple-400" />
            New Optimization
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <div className="px-2 py-2 text-xs font-semibold text-[#848E9C] flex items-center gap-2">
            <Clock size={14} /> Session History
          </div>
          
          {sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-[#5E6673]">
              No past sessions found.
            </div>
          )}
          
          {sessions.map(s => (
            <button 
              key={s.id} 
              onClick={() => fetchSessionDetails(s.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all group ${
                selectedSessionId === s.id 
                  ? "bg-[#2B2F36] border-[#F0B90B]/30" 
                  : "bg-transparent border-transparent hover:bg-[#2B2F36]/50"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-medium text-xs ${selectedSessionId === s.id ? "text-[#EAECEF]" : "text-[#B7BDC6]"}`}>
                  {s.symbol}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    s.status === "completed" ? "bg-[#0ECB81]" :
                    s.status === "running" ? "bg-[#F0B90B] animate-pulse" :
                    "bg-[#F6465D]"
                  }`} />
                  <div 
                    onClick={(e) => deleteSession(s.id, e)} 
                    className="opacity-0 group-hover:opacity-100 text-[#848E9C] hover:text-[#F6465D] transition-all p-1"
                  >
                    <Trash2 size={12} />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-[#848E9C] line-clamp-2 leading-relaxed">
                {s.goal}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[#5E6673]">
                <span>SR: {s.best_sharpe.toFixed(2)}</span>
                <span>•</span>
                <span>{s.backtests_run} runs</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Middle Column: Chat & Controls (flex-1) ─────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#0B0E11]">
        
        {/* Header */}
        <div className="h-16 border-b border-[#2B2F36] flex items-center justify-between px-6 flex-shrink-0 bg-[#1E2026]/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shadow-lg ${
              maintenance
                ? "bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30"
                : "bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-purple-500/30"
            }`}>
              {maintenance ? <Wrench size={18} className="text-amber-400" /> : <Brain size={18} className="text-purple-400" />}
            </div>
            <div>
              <h1 className="text-base font-bold text-[#EAECEF] flex items-center gap-2">
                AI Strategy Tuner
                {isViewingHistory && <span className="px-2 py-0.5 rounded-full bg-[#2B2F36] text-[#848E9C] text-[10px] font-medium border border-[#363A45]">Viewing History</span>}
              </h1>
              <p className="text-[11px] text-[#848E9C]">Autonomous backtest optimization via Gemini</p>
            </div>
          </div>
          
          {isViewingHistory && (
            <button 
              onClick={restartSession}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2B2F36] hover:bg-[#363A45] text-[#EAECEF] text-xs font-medium transition-colors border border-[#363A45]"
            >
              <RotateCcw size={14} /> Duplicate & Run
            </button>
          )}
        </div>

        {/* Maintenance Banner — only shown to non-super-admins */}
        {statusLoaded && maintenance && !isSuperAdmin && !isViewingHistory && (
          <div className="mx-6 mt-6 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/10 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <Wrench size={20} className="text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-400 mb-1">Under Maintenance</h3>
                <p className="text-xs text-[#B7BDC6] leading-relaxed">
                  {maintenanceMsg || "AI Strategy Tuner is temporarily unavailable. We are upgrading the optimization engine for better results."}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400/70">
                  <ShieldAlert size={12} />
                  <span>Only super administrators can access this feature when active</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar scroll-smooth">
          {messages.length === 0 && !isRunning && !isViewingHistory && (
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-purple-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                <Sparkles size={32} className="text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-[#EAECEF] mb-3">How can I optimize your strategy?</h2>
              <p className="text-sm text-[#848E9C] mb-8 leading-relaxed">
                Describe your goals, risk tolerance, and desired capital. I will autonomously run hundreds of backtests, analyze the results, and find the perfect configuration.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full text-left">
                {PRESET_GOALS.map((p, i) => (
                  <button 
                    key={i} 
                    onClick={() => setGoal(p.value)}
                    className="p-3 rounded-xl border border-[#2B2F36] hover:border-purple-500/50 hover:bg-purple-500/5 transition-all text-xs text-[#B7BDC6] flex items-center gap-3"
                  >
                    <Search size={16} className="text-purple-400" />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {isLoadingHistory && (
             <div className="flex flex-col items-center justify-center h-full">
               <Loader2 size={32} className="animate-spin text-purple-500 mb-4" />
               <p className="text-sm text-[#848E9C]">Loading session history...</p>
             </div>
          )}

          {!isLoadingHistory && messages.map((msg, i) => {
            // User Message
            if (msg.type === "session_start" || (msg.type === "thinking" && msg.data?.content && i === 0 && isViewingHistory)) {
              // If it's a history session, we might not have a session_start event, so we fake it if needed.
              // Actually we only render session_start if it exists
              if (msg.type === "session_start") {
                return (
                  <div key={i} className="flex justify-end mb-6">
                    <div className="max-w-[80%] flex gap-3">
                      <div className="bg-[#2B2F36] text-[#EAECEF] rounded-2xl rounded-tr-sm px-5 py-3.5 text-sm leading-relaxed border border-[#363A45] shadow-md">
                        <div className="font-medium text-[#F0B90B] mb-1 flex items-center gap-2 text-xs">
                          <Target size={14} /> Optimizing for {msg.data.symbol}
                        </div>
                        {msg.data.goal}
                      </div>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-lg border border-[#0B0E11]">
                        <User size={16} className="text-white" />
                      </div>
                    </div>
                  </div>
                );
              }
            }

            // AI Thinking Message
            if (msg.type === "thinking") {
              return (
                <div key={i} className="flex gap-4 max-w-[90%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-[#0B0E11] mt-1">
                    <Brain size={16} className="text-white" />
                  </div>
                  <div className="flex-1 bg-gradient-to-br from-[#1E2026] to-[#181A20] border border-[#2B2F36] rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-[#EAECEF] leading-relaxed shadow-lg">
                    {msg.data.content}
                  </div>
                </div>
              );
            }

            // Function Call
            if (msg.type === "function_call") {
              return (
                <div key={i} className="flex gap-4 max-w-[90%] ml-12">
                  <div className="flex-1">
                    <FunctionCallCard
                      data={msg.data}
                      expanded={expandedCalls.has(msg.data.id || String(i))}
                      onToggle={() => toggleCallExpansion(msg.data.id || String(i))}
                    />
                  </div>
                </div>
              );
            }

            // Error
            if (msg.type === "error") {
              return (
                <div key={i} className="flex gap-4 max-w-[90%]">
                  <div className="w-8 h-8 rounded-full bg-[#F6465D] flex items-center justify-center flex-shrink-0 shadow-lg border border-[#0B0E11] mt-1">
                    <AlertTriangle size={16} className="text-white" />
                  </div>
                  <div className="flex-1 bg-[#F6465D]/10 border border-[#F6465D]/20 rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-[#F6465D] leading-relaxed">
                    {msg.data.message}
                  </div>
                </div>
              );
            }

            // Complete
            if (msg.type === "complete") {
              return (
                <div key={i} className="flex justify-center my-8">
                  <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-[#0ECB81]/10 border border-[#0ECB81]/20 shadow-lg">
                    <CheckCircle2 size={18} className="text-[#0ECB81]" />
                    <span className="text-sm font-medium text-[#0ECB81]">
                      Optimization complete — {msg.data.backtests_run || backtestCount} backtests run
                    </span>
                  </div>
                </div>
              );
            }

            return null;
          })}

          {isRunning && (
            <div className="flex gap-4 max-w-[90%]">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-[#0B0E11] mt-1">
                <Brain size={16} className="text-white animate-pulse" />
              </div>
              <div className="flex items-center gap-3 bg-[#1E2026] border border-[#2B2F36] rounded-2xl rounded-tl-sm px-5 py-3 shadow-lg">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span className="text-sm text-[#848E9C]">
                  {backtestCount > 0 ? `Analyzing data (${backtestCount} backtests run)...` : "Thinking..."}
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} className="h-4" />
        </div>

        {/* Input Area (Bottom) */}
        <div className="p-4 bg-[#1E2026] border-t border-[#2B2F36]">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {/* Symbol & Configs Toolbar */}
            <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
              <div className="flex bg-[#0B0E11] p-1 rounded-lg border border-[#2B2F36]">
                {["BTCUSDT", "ETHUSDT", "SOLUSDT"].map(s => (
                  <button key={s} onClick={() => setSymbol(s)} disabled={isRunning || isViewingHistory}
                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      symbol === s
                        ? "bg-[#F0B90B] text-[#0B0E11] shadow-sm"
                        : "text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#2B2F36]/50"
                    } ${(isRunning || isViewingHistory) ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {s.replace("USDT", "")}
                  </button>
                ))}
              </div>
              
              {!isViewingHistory && (
                <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-[#2B2F36]">
                  <span className="text-[10px] uppercase font-bold text-[#5E6673] tracking-wider px-2">Presets</span>
                  {PRESET_GOALS.map((p, i) => (
                     <button key={i} onClick={() => setGoal(p.value)} disabled={isRunning}
                       className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#0B0E11] border border-[#2B2F36] text-[#848E9C] hover:text-[#EAECEF] hover:border-[#F0B90B]/50 transition-all">
                       {p.label}
                     </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input Box */}
            <div className="relative flex items-end gap-3 bg-[#0B0E11] border border-[#2B2F36] rounded-2xl p-2 shadow-inner focus-within:border-purple-500/50 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
              <textarea
                value={goal}
                onChange={e => setGoal(e.target.value)}
                placeholder={isViewingHistory ? "Start a new optimization to enter a goal..." : "Message AI Tuner (e.g. 'Maximize Sharpe ratio for BTC with $1000')..."}
                rows={1}
                disabled={isRunning || isViewingHistory}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    startOptimization();
                  }
                }}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-[#EAECEF] placeholder-[#5E6673] resize-none focus:outline-none min-h-[44px] max-h-[120px] custom-scrollbar disabled:opacity-50"
              />
              <button
                onClick={isRunning ? stopOptimization : startOptimization}
                disabled={(!isRunning && !goal.trim()) || (!isRunning && !canRun) || isViewingHistory}
                className={`h-11 px-6 rounded-xl font-bold text-sm flex items-center gap-2 transition-all flex-shrink-0 ${
                  isRunning
                    ? "bg-[#F6465D] hover:bg-[#F6465D]/90 text-white shadow-[0_0_15px_rgba(246,70,93,0.3)]"
                    : "bg-[#EAECEF] text-[#0B0E11] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
              >
                {isRunning ? <><Square size={16} fill="currentColor" /> Stop</> : <><Play size={16} fill="currentColor" /> Run</>}
              </button>
            </div>
            
            <div className="text-center text-[10px] text-[#5E6673]">
              AI Strategy Tuner can make mistakes. Always verify parameters in backtesting before live deployment.
            </div>
          </div>
        </div>
      </div>

      {/* ─── Right Column: Results & Config (380px) ────────────────────── */}
      <div className="w-[380px] border-l border-[#2B2F36] bg-[#1E2026] hidden xl:flex flex-col flex-shrink-0">
        <div className="h-16 border-b border-[#2B2F36] flex items-center px-6 flex-shrink-0 bg-[#1E2026]/50 backdrop-blur-md">
           <h2 className="text-sm font-bold text-[#EAECEF] flex items-center gap-2">
             <TrendingUp size={16} className="text-[#F0B90B]" /> Optimization Results
           </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          {/* Best Config */}
          {bestConfig ? (
            <div className="rounded-xl border border-[#0ECB81]/30 bg-[#0ECB81]/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#0ECB81]/20 flex items-center justify-between bg-[#0ECB81]/10">
                <div className="flex items-center gap-2">
                  <Trophy size={16} className="text-[#F0B90B]" />
                  <span className="text-sm font-bold text-[#EAECEF]">Best Config Found</span>
                </div>
                <button onClick={copyConfig} className="flex items-center gap-1.5 text-[10px] font-bold text-[#0ECB81] hover:text-white transition-colors bg-[#0ECB81]/20 px-2 py-1 rounded">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "COPIED" : "COPY"}
                </button>
              </div>
              <div className="p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
                {Object.entries(bestConfig).map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <span className="text-[#848E9C] font-medium uppercase tracking-wider text-[9px]">{key.replace(/_/g, " ")}</span>
                    <span className="text-[#EAECEF] font-mono bg-[#0B0E11] px-2 py-1 rounded border border-[#2B2F36] truncate">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[#2B2F36] border-dashed p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-[#2B2F36] flex items-center justify-center mx-auto mb-3">
                <Trophy size={20} className="text-[#5E6673]" />
              </div>
              <p className="text-sm text-[#848E9C] font-medium">No configuration yet</p>
              <p className="text-xs text-[#5E6673] mt-1">Start an optimization to discover the best settings.</p>
            </div>
          )}

          {/* Results Leaderboard */}
          {results.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-[#EAECEF] uppercase tracking-wider text-[#848E9C]">All Backtests ({results.length})</span>
              </div>
              <div className="space-y-3">
                {[...results]
                  .sort((a, b) => (b.sharpe_ratio || 0) - (a.sharpe_ratio || 0))
                  .map((r, i) => (
                    <ResultCard key={i} result={r} rank={i + 1} />
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
    </div>
  );
}
