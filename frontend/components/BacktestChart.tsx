"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts";
import { Play, Pause, RotateCcw, Maximize2, Minimize2 } from "lucide-react";

interface TradeEvent {
  time: string;
  type: "ENTRY" | "EXIT" | "SO_FILL";
  side?: string;
  price: number;
  trade_id: number;
  reason?: string;
  pnl?: number;
  so_index?: number;
}

interface Trade {
  entry_price?: number;
  exit_price?: number;
  tp_price?: number;
  avg_entry?: number;
  side?: string;
  entry_time?: string;
  exit_time?: string;
  pnl?: number;
  exit_reason?: string;
}

interface BacktestChartProps {
  priceData: { timestamp: string; open: number; high: number; low: number; close: number }[];
  equityCurve: { timestamp: string; equity: number; price: number }[];
  tradeEvents: TradeEvent[];
  trades?: Trade[];
  symbol: string;
}

function toUTC(iso: string): Time {
  const d = new Date(iso);
  return Math.floor(d.getTime() / 1000) as Time;
}

function toUnix(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

export default function BacktestChart({ priceData, equityCurve, tradeEvents, trades = [], symbol }: BacktestChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const equityRef = useRef<ISeriesApi<"Line"> | null>(null);
  const markersRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const activeTradeIdRef = useRef<number>(-1);

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(10);
  const [playIndex, setPlayIndex] = useState(0);
  const [playMode, setPlayMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const playingRef = useRef(false);
  const playIndexRef = useRef(0);
  const animFrameRef = useRef<number>(0);

  // Prepare data once
  const candleData: CandlestickData[] = priceData.map((p) => ({
    time: toUTC(p.timestamp),
    open: p.open,
    high: p.high,
    low: p.low,
    close: p.close,
  }));

  const equityData: LineData[] = equityCurve.map((e) => ({
    time: toUTC(e.timestamp),
    value: e.equity,
  }));

  // Build markers from trade events
  const buildMarkers = useCallback(
    (events: TradeEvent[]) =>
      events
        .map((ev) => {
          const t = toUTC(ev.time);
          if (ev.type === "ENTRY") {
            return {
              time: t,
              position: ev.side === "LONG" ? ("belowBar" as const) : ("aboveBar" as const),
              color: ev.side === "LONG" ? "#0ECB81" : "#F6465D",
              shape: ev.side === "LONG" ? ("arrowUp" as const) : ("arrowDown" as const),
              text: `${ev.side} #${ev.trade_id}`,
            };
          }
          if (ev.type === "SO_FILL") {
            return {
              time: t,
              position: "belowBar" as const,
              color: "#5DADE2",
              shape: "circle" as const,
              text: `SO${ev.so_index}`,
            };
          }
          if (ev.type === "EXIT") {
            const isWin = (ev.pnl || 0) >= 0;
            const reasonMap: Record<string, { color: string; text: string }> = {
              TP: { color: "#0ECB81", text: `TP ${isWin ? "+" : ""}$${(ev.pnl || 0).toFixed(2)}` },
              MAX_AGE: { color: "#FB923C", text: `AGE ${isWin ? "+" : ""}$${(ev.pnl || 0).toFixed(2)}` },
              RISK_STOP: { color: "#F0B90B", text: `🛡️ $${(ev.pnl || 0).toFixed(2)}` },
              LIQUIDATED: { color: "#F6465D", text: "LIQUIDATED" },
              END_OF_DATA: { color: "#848E9C", text: "END" },
            };
            const r = reasonMap[ev.reason || "TP"] || reasonMap.TP;
            return {
              time: t,
              position: "aboveBar" as const,
              color: r.color,
              shape: "square" as const,
              text: r.text,
            };
          }
          return null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.time as number) - (b.time as number)),
    []
  );

  // ── Dynamic trade position lines ──
  // Show entry/TP/avg lines ONLY for the trade that is currently active at time T
  const clearPriceLines = useCallback(() => {
    priceLinesRef.current.forEach((line) => {
      try { candleRef.current?.removePriceLine(line); } catch { /* ignore */ }
    });
    priceLinesRef.current = [];
    activeTradeIdRef.current = -1;
  }, []);

  const updateTradeLines = useCallback((currentTimeUnix: number) => {
    if (!candleRef.current || trades.length === 0) return;

    // Find the trade that is ACTIVE at this time
    // Active = entry_time <= currentTime AND (no exit_time OR exit_time > currentTime)
    let activeTrade: Trade | null = null;
    let activeIdx = -1;
    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];
      if (!t.entry_time) continue;
      const entryT = toUnix(t.entry_time);
      const exitT = t.exit_time ? toUnix(t.exit_time) : Infinity;
      if (entryT <= currentTimeUnix && currentTimeUnix < exitT) {
        activeTrade = t;
        activeIdx = i;
        break;
      }
    }

    // If same trade is already drawn, skip redraw
    if (activeIdx === activeTradeIdRef.current) return;

    // Clear old lines
    clearPriceLines();

    if (!activeTrade) return;

    activeTradeIdRef.current = activeIdx;
    const isLong = activeTrade.side === "LONG";

    // Entry price line (dashed)
    const entryLine = candleRef.current.createPriceLine({
      price: activeTrade.avg_entry || activeTrade.entry_price || 0,
      color: isLong ? "#0ECB81" : "#F6465D",
      lineWidth: 1,
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: `Entry ${isLong ? "▲" : "▼"} $${(activeTrade.avg_entry || activeTrade.entry_price || 0).toFixed(2)}`,
    });
    priceLinesRef.current.push(entryLine);

    // TP target line (dotted)
    if (activeTrade.tp_price) {
      const tpLine = candleRef.current.createPriceLine({
        price: activeTrade.tp_price,
        color: "#F0B90B",
        lineWidth: 1,
        lineStyle: 3, // dotted
        axisLabelVisible: true,
        title: `TP Target`,
      });
      priceLinesRef.current.push(tpLine);
    }
  }, [trades, clearPriceLines]);

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current || candleData.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#181A20" },
        textColor: "#848E9C",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1E2329" },
        horzLines: { color: "#1E2329" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#F0B90B", width: 1, style: 3, labelBackgroundColor: "#F0B90B" },
        horzLine: { color: "#F0B90B", width: 1, style: 3, labelBackgroundColor: "#F0B90B" },
      },
      rightPriceScale: {
        borderColor: "#2B2F36",
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "#2B2F36",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#0ECB81",
      downColor: "#F6465D",
      borderUpColor: "#0ECB81",
      borderDownColor: "#F6465D",
      wickUpColor: "#0ECB81",
      wickDownColor: "#F6465D",
    });

    const equitySeries = chart.addSeries(LineSeries, {
      color: "#F0B90B",
      lineWidth: 2,
      priceScaleId: "equity",
      lastValueVisible: true,
      priceLineVisible: false,
    });
    chart.priceScale("equity").applyOptions({
      scaleMargins: { top: 0.7, bottom: 0.02 },
      borderColor: "transparent",
    });

    candleSeries.setData(candleData);
    equitySeries.setData(equityData);

    const markers = buildMarkers(tradeEvents);
    if (markers.length > 0) {
      markersRef.current = createSeriesMarkers(candleSeries, markers as any);
    }

    chart.timeScale().fitContent();

    chartRef.current = chart;
    candleRef.current = candleSeries;
    equityRef.current = equitySeries;

    // In static mode, show lines for the LAST trade only if it's still open (END_OF_DATA)
    if (trades.length > 0) {
      const lastTrade = trades[trades.length - 1];
      if (lastTrade.exit_reason === "END_OF_DATA" || !lastTrade.exit_time) {
        // Show active position lines for the still-open trade
        const isLong = lastTrade.side === "LONG";
        const entryLine = candleSeries.createPriceLine({
          price: lastTrade.avg_entry || lastTrade.entry_price || 0,
          color: isLong ? "#0ECB81" : "#F6465D",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Active ${isLong ? "▲" : "▼"}`,
        });
        priceLinesRef.current.push(entryLine);
        if (lastTrade.tp_price) {
          const tpLine = candleSeries.createPriceLine({
            price: lastTrade.tp_price,
            color: "#F0B90B",
            lineWidth: 1,
            lineStyle: 3,
            axisLabelVisible: true,
            title: "TP Target",
          });
          priceLinesRef.current.push(tpLine);
        }
      }
    }

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData, equityCurve, tradeEvents]);

  // ── Fullscreen ──
  const toggleFullscreen = useCallback(() => {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      wrapperRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      setTimeout(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: isFull ? window.innerHeight - 90 : 420,
          });
          chartRef.current.timeScale().fitContent();
        }
      }, 100);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Playback engine ──
  const startPlayback = useCallback(() => {
    if (!candleRef.current || !equityRef.current || !chartRef.current) return;

    setPlayMode(true);
    setPlaying(true);
    playingRef.current = true;

    const startIdx = playIndexRef.current >= candleData.length - 1 ? 0 : playIndexRef.current;
    playIndexRef.current = startIdx;
    setPlayIndex(startIdx);

    const initialCount = Math.max(20, Math.floor(candleData.length * 0.02));
    const initial = startIdx < initialCount ? initialCount : startIdx;

    candleRef.current.setData(candleData.slice(0, initial));
    const eqSlice = equityData.filter(
      (e) => (e.time as number) <= (candleData[initial - 1]?.time as number)
    );
    equityRef.current.setData(eqSlice);

    if (markersRef.current) {
      markersRef.current.setMarkers([]);
    }

    // Clear any static trade lines
    clearPriceLines();

    let idx = initial;
    let lastFrameTime = 0;
    const msPerCandle = Math.max(2, 200 / playSpeed);

    const step = (timestamp: number) => {
      if (!playingRef.current) return;
      if (timestamp - lastFrameTime < msPerCandle) {
        animFrameRef.current = requestAnimationFrame(step);
        return;
      }
      lastFrameTime = timestamp;

      if (idx >= candleData.length) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }

      candleRef.current?.update(candleData[idx]);

      const candleTime = candleData[idx].time as number;

      // Update equity
      const eqPoint = equityData.filter((e) => (e.time as number) <= candleTime);
      if (eqPoint.length > 0) {
        equityRef.current?.setData(eqPoint);
      }

      // Update markers
      const visibleEvents = tradeEvents.filter((ev) => {
        const evTime = Math.floor(new Date(ev.time).getTime() / 1000);
        return evTime <= candleTime;
      });
      if (visibleEvents.length > 0) {
        const markers = buildMarkers(visibleEvents);
        if (markersRef.current) {
          markersRef.current.setMarkers(markers as any);
        } else if (candleRef.current) {
          markersRef.current = createSeriesMarkers(candleRef.current, markers as any);
        }
      }

      // ── Dynamic trade lines — show only the ACTIVE trade at this moment ──
      updateTradeLines(candleTime);

      chartRef.current?.timeScale().scrollToPosition(2, false);

      idx++;
      playIndexRef.current = idx;
      setPlayIndex(idx);

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [candleData, equityData, tradeEvents, playSpeed, buildMarkers, clearPriceLines, updateTradeLines]);

  const pausePlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }, []);

  const resetChart = useCallback(() => {
    pausePlayback();
    setPlayMode(false);
    setPlayIndex(0);
    playIndexRef.current = 0;
    clearPriceLines();

    if (candleRef.current && equityRef.current && chartRef.current) {
      candleRef.current.setData(candleData);
      equityRef.current.setData(equityData);
      const markers = buildMarkers(tradeEvents);
      if (markersRef.current) {
        markersRef.current.setMarkers(markers as any);
      } else if (candleRef.current) {
        markersRef.current = createSeriesMarkers(candleRef.current, markers as any);
      }
      chartRef.current.timeScale().fitContent();
    }
  }, [candleData, equityData, tradeEvents, pausePlayback, buildMarkers, clearPriceLines]);

  const progress = candleData.length > 0 ? Math.round((playIndex / candleData.length) * 100) : 0;

  return (
    <div
      ref={wrapperRef}
      className={`bg-[#181A20] border border-[#2B2F36] rounded-xl overflow-hidden ${isFullscreen ? "flex flex-col" : ""}`}
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#2B2F36] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold text-[#EAECEF]">
            {symbol} Price Chart
          </h3>
          <span className="text-[10px] text-[#848E9C] bg-[#0B0E14] px-2 py-0.5 rounded font-mono">
            {candleData.length} candles
          </span>
        </div>

        <div className="flex items-center gap-2">
          {playMode && (
            <div className="flex items-center gap-2 mr-2">
              <div className="w-24 h-1.5 bg-[#0B0E14] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#F0B90B] rounded-full transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[10px] text-[#848E9C] font-mono w-8">{progress}%</span>
            </div>
          )}

          <select
            value={playSpeed}
            onChange={(e) => setPlaySpeed(Number(e.target.value))}
            className="bg-[#0B0E14] border border-[#2B2F36] rounded px-2 py-1 text-[10px] text-[#EAECEF] font-mono"
          >
            <option value={1}>1x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
            <option value={25}>25x</option>
            <option value={50}>50x</option>
          </select>

          {!playing ? (
            <button
              onClick={startPlayback}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-[#F0B90B]/10 text-[#F0B90B] border border-[#F0B90B]/20 hover:bg-[#F0B90B]/20 transition-all"
            >
              <Play size={12} /> {playMode ? "Resume" : "Replay"}
            </button>
          ) : (
            <button
              onClick={pausePlayback}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all"
            >
              <Pause size={12} /> Pause
            </button>
          )}

          {playMode && (
            <button
              onClick={resetChart}
              className="p-1.5 rounded-lg text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#0B0E14] transition-all"
              title="Reset to full view"
            >
              <RotateCcw size={14} />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg text-[#848E9C] hover:text-[#EAECEF] hover:bg-[#0B0E14] transition-all"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={containerRef}
        className={`w-full ${isFullscreen ? "flex-1" : ""}`}
        style={{ height: isFullscreen ? undefined : 420 }}
      />

      {/* Legend */}
      <div className="px-5 py-2 border-t border-[#2B2F36] flex items-center gap-5 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#0ECB81]" />
          <span className="text-[10px] text-[#848E9C]">Bullish</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#F6465D]" />
          <span className="text-[10px] text-[#848E9C]">Bearish</span>
        </div>
        <div className="w-px h-3 bg-[#2B2F36]" />
        <div className="flex items-center gap-1.5">
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[6px] border-b-[#0ECB81]" />
          <span className="text-[10px] text-[#848E9C]">Long Entry</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-[#F6465D]" />
          <span className="text-[10px] text-[#848E9C]">Short Entry</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#5DADE2]" />
          <span className="text-[10px] text-[#848E9C]">SO Fill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-[#0ECB81]" />
          <span className="text-[10px] text-[#848E9C]">TP Exit</span>
        </div>
        <div className="w-px h-3 bg-[#2B2F36]" />
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#F0B90B] rounded" />
          <span className="text-[10px] text-[#848E9C]">Equity</span>
        </div>
      </div>
    </div>
  );
}
