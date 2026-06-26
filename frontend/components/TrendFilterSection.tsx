/**
 * Reusable Trend Filter settings section for strategy configuration modals.
 * Used in: AccountSettingsModal, AdminSettingsModal, Backtest page.
 */

interface TrendFilterProps {
  enabled: boolean;
  timeframes: string[];
  mode: string;
  emaFast: number;
  emaSlow: number;
  onChange: (key: string, value: any) => void;
  /** Compact mode for backtest sidebar */
  compact?: boolean;
}

const TREND_TIMEFRAMES = [
  { value: "1d", label: "1D", description: "Daily" },
  { value: "4h", label: "4H", description: "4 Hour" },
  { value: "1h", label: "1H", description: "1 Hour" },
];

const COMBINE_MODES = [
  { value: "majority", label: "Majority", tip: "Most TFs agree" },
  { value: "all", label: "All", tip: "All TFs must agree" },
  { value: "any", label: "Any", tip: "Any single TF" },
];

export default function TrendFilterSection({
  enabled, timeframes, mode, emaFast, emaSlow, onChange, compact = false
}: TrendFilterProps) {
  const toggleTimeframe = (tf: string) => {
    const current = [...timeframes];
    const idx = current.indexOf(tf);
    if (idx >= 0) {
      // Don't allow removing all timeframes
      if (current.length <= 1) return;
      current.splice(idx, 1);
    } else {
      current.push(tf);
    }
    onChange("trend_timeframes", current);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className={`${compact ? "text-xs" : "text-xs"} font-semibold ${compact ? "text-[#848E9C]" : "text-neutral-400"} uppercase tracking-wider`}>
          Trend Filter
        </label>
        <button
          type="button"
          onClick={() => onChange("trend_filter_enabled", !enabled)}
          className={`relative ${compact ? "w-9 h-5" : "w-10 h-5"} rounded-full transition-colors duration-200 ${
            enabled ? "bg-[#0ECB81]" : compact ? "bg-[#2B2F36]" : "bg-neutral-700"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${
            enabled ? (compact ? "translate-x-4" : "translate-x-5") : "translate-x-0"
          }`} />
        </button>
      </div>

      {enabled && (
        <div className={`space-y-3 ${compact ? "mt-1" : "mt-2"} p-3 rounded-lg border ${compact ? "bg-[#181A20] border-[#2B2F36]" : "bg-neutral-900/30 border-neutral-700/50"}`}>
          {/* Timeframe Selection */}
          <div>
            <label className={`${compact ? "text-[10px]" : "text-xs"} font-medium ${compact ? "text-[#848E9C]" : "text-neutral-400"} mb-1.5 block`}>
              Timeframes
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {TREND_TIMEFRAMES.map(tf => {
                const isActive = timeframes.includes(tf.value);
                return (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => toggleTimeframe(tf.value)}
                    className={`py-1.5 rounded-lg text-xs font-bold transition-all duration-200 border ${
                      isActive
                        ? "border-[#F0B90B]/50 bg-[#F0B90B]/10 text-[#F0B90B]"
                        : compact
                          ? "border-[#2B2F36] bg-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/20"
                          : "border-neutral-700 bg-neutral-900/50 text-neutral-500 hover:border-neutral-500"
                    }`}
                  >
                    {tf.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Combine Mode */}
          <div>
            <label className={`${compact ? "text-[10px]" : "text-xs"} font-medium ${compact ? "text-[#848E9C]" : "text-neutral-400"} mb-1.5 block`}>
              Combine Mode
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {COMBINE_MODES.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => onChange("trend_mode", m.value)}
                  className={`py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200 border ${
                    mode === m.value
                      ? "border-[#F0B90B]/50 bg-[#F0B90B]/10 text-[#F0B90B]"
                      : compact
                        ? "border-[#2B2F36] bg-[#2B2F36] text-[#848E9C] hover:border-[#F0B90B]/20"
                        : "border-neutral-700 bg-neutral-900/50 text-neutral-500 hover:border-neutral-500"
                  }`}
                  title={m.tip}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* EMA Settings */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={`${compact ? "text-[10px]" : "text-xs"} font-medium ${compact ? "text-[#848E9C]" : "text-neutral-400"} mb-1 block`}>
                Fast EMA
              </label>
              <input
                type="number"
                value={emaFast}
                min={3}
                max={50}
                onChange={e => onChange("trend_ema_fast", parseInt(e.target.value) || 9)}
                className={`w-full rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#F0B90B] ${
                  compact
                    ? "bg-[#2B2F36] border border-[#3B3F46]"
                    : "bg-neutral-900 border border-neutral-700"
                }`}
              />
            </div>
            <div>
              <label className={`${compact ? "text-[10px]" : "text-xs"} font-medium ${compact ? "text-[#848E9C]" : "text-neutral-400"} mb-1 block`}>
                Slow EMA
              </label>
              <input
                type="number"
                value={emaSlow}
                min={10}
                max={200}
                onChange={e => onChange("trend_ema_slow", parseInt(e.target.value) || 21)}
                className={`w-full rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:ring-1 focus:ring-[#F0B90B] ${
                  compact
                    ? "bg-[#2B2F36] border border-[#3B3F46]"
                    : "bg-neutral-900 border border-neutral-700"
                }`}
              />
            </div>
          </div>

          {/* Info Banner */}
          <div className={`flex items-start gap-2 p-2 rounded-lg ${compact ? "bg-[#2B2F36]" : "bg-neutral-800/50"}`}>
            <span className="text-[#F0B90B] text-sm mt-0.5">📊</span>
            <p className={`${compact ? "text-[9px]" : "text-[10px]"} ${compact ? "text-[#848E9C]" : "text-neutral-500"} leading-relaxed`}>
              Trend UP → only LONG. Trend DOWN → only SHORT. Neutral → both allowed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
