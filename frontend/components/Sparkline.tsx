"use client";

interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  fill?: boolean;
  showDots?: boolean;
  className?: string;
}

export default function Sparkline({ data, color, height = 32, width = 200, fill = true, showDots = false, className = "" }: SparklineProps) {
  if (data.length < 2) return <div style={{ height, width }} className={`flex items-center justify-center text-[9px] text-[#5E6673] ${className}`}>Collecting...</div>;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return { x, y, v };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const fillPath = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

  return (
    <svg width={width} height={height} className={className} style={{ display: "block" }}>
      {fill && <path d={fillPath} fill={`${color}15`} />}
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.length <= 60 && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.5} fill={i === points.length - 1 ? color : `${color}60`} />
      ))}
    </svg>
  );
}

export function LargeChart({ data, color, label, unit, height = 200 }: { data: { t: number; v: number }[]; color: string; label: string; unit: string; height?: number }) {
  if (data.length < 2) return <div className="flex items-center justify-center text-sm text-[#5E6673]" style={{ height }}>Collecting data...</div>;

  const w = 600;
  const pad = { top: 20, right: 12, bottom: 28, left: 40 };
  const cw = w - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const vals = data.map(d => d.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * cw,
    y: pad.top + ch - ((d.v - min) / range) * ch,
    v: d.v,
    t: d.t,
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const fill = `${line} L${pts[pts.length - 1].x},${pad.top + ch} L${pts[0].x},${pad.top + ch} Z`;

  // Y-axis labels
  const ySteps = 4;
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const v = min + (range * i) / ySteps;
    return { v: v.toFixed(1), y: pad.top + ch - (i / ySteps) * ch };
  });

  // X-axis labels (5 ticks)
  const xSteps = Math.min(5, data.length - 1);
  const xLabels = Array.from({ length: xSteps + 1 }, (_, i) => {
    const idx = Math.round((i / xSteps) * (data.length - 1));
    const d = new Date(data[idx].t);
    return { label: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), x: pts[idx].x };
  });

  const cur = vals[vals.length - 1];
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const peak = max;

  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-bold text-[#EAECEF]">{label}</span>
        </div>
        <div className="flex gap-4 text-[10px] ml-auto">
          <span className="text-[#848E9C]">Current: <span className="text-[#EAECEF] font-mono font-bold">{cur.toFixed(1)}{unit}</span></span>
          <span className="text-[#848E9C]">Avg: <span className="text-[#EAECEF] font-mono">{avg.toFixed(1)}{unit}</span></span>
          <span className="text-[#848E9C]">Peak: <span className="font-mono" style={{ color }}>{peak.toFixed(1)}{unit}</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
        {/* Grid lines */}
        {yLabels.map((yl, i) => (
          <g key={i}>
            <line x1={pad.left} y1={yl.y} x2={w - pad.right} y2={yl.y} stroke="#2B2F36" strokeWidth={0.5} />
            <text x={pad.left - 6} y={yl.y + 3} fill="#5E6673" fontSize={9} textAnchor="end" fontFamily="monospace">{yl.v}</text>
          </g>
        ))}
        {/* Fill + Line */}
        <path d={fill} fill={`${color}12`} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Last point dot */}
        <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
        {/* X labels */}
        {xLabels.map((xl, i) => (
          <text key={i} x={xl.x} y={height - 6} fill="#5E6673" fontSize={9} textAnchor="middle" fontFamily="monospace">{xl.label}</text>
        ))}
      </svg>
    </div>
  );
}
