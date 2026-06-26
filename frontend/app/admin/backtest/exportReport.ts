const fmt = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return "—"; }
};

export function exportPDF(result: any, config: any) {
  const s = result.summary;
  const now = new Date();
  const rid = `TG-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  const sizing = config.sizing_mode === "fixed_usd" ? `$${config.base_order_usd} Fixed` : `${config.base_order_pct}% Capital`;
  const age = config.max_basket_age_hours === 0 ? "Off" : `${config.max_basket_age_hours}h`;
  const tp = config.tp_mode === "fixed" ? `$${config.tp_fixed_amount}` : `${config.take_profit_pct}%`;
  const compound = config.compounding_enabled ? `${config.compounding_pct}%` : "Off";
  const dirs = `${config.allow_long !== false ? '✓ Long' : '✗ Long'} / ${config.allow_short !== false ? '✓ Short' : '✗ Short'}`;
  const trend = config.trend_filter_enabled ? `ON (${(config.trend_timeframes || []).join(', ')})` : 'Off';
  const trendMode = config.trend_filter_enabled ? (config.trend_mode || 'majority') : '—';
  const trendEma = config.trend_filter_enabled ? `${config.trend_ema_fast || 9}/${config.trend_ema_slow || 21}` : '—';
  const fees = `${((config.maker_fee || 0.0002) * 100).toFixed(2)}% / ${((config.taker_fee || 0.0004) * 100).toFixed(2)}%`;
  // Risk controller
  const rcOn = config.risk_controller_enabled === true;
  const rcLossMode = config.rc_loss_mode === 'fixed_usd' ? `$${config.rc_max_basket_loss_usd || 50}` : `${config.rc_max_basket_loss_pct || 10}% wallet`;
  const rcDirection = config.rc_loss_direction === 'recovers_to' ? '↩️ Recovers To' : '⛔ Exceeds';
  const rcMargin = `${config.rc_margin_usage_pct || 80}%`;
  const rcSoTrig = config.rc_max_so_trigger || 5;
  const riskStops = s.risk_stop_events || 0;
  const peakMargin = s.peak_margin_used_pct || 0;

  // Derive actual date range from price data or trades
  let dateRange = `${config.period_days}D`;
  try {
    const priceArr = result.price_data || [];
    const tradesArr = result.trades || [];
    let firstTs = "", lastTs = "";
    if (priceArr.length > 0) {
      firstTs = priceArr[0].timestamp;
      lastTs = priceArr[priceArr.length - 1].timestamp;
    } else if (tradesArr.length > 0) {
      firstTs = tradesArr[0].entry_time;
      lastTs = tradesArr[tradesArr.length - 1].exit_time || tradesArr[tradesArr.length - 1].entry_time;
    }
    if (firstTs && lastTs) {
      const d1 = new Date(firstTs);
      const d2 = new Date(lastTs);
      const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const yr = d2.getFullYear();
      dateRange = `${f(d1)} – ${f(d2)}, ${yr} (${config.period_days}D)`;
    }
  } catch {}
  const retPct = ((s.final_capital - s.initial_capital) / s.initial_capital * 100).toFixed(2);
  const retC = s.final_capital >= s.initial_capital ? "#0ECB81" : "#F6465D";
  const prog = Math.min(100, Math.max(5, (s.final_capital / (s.initial_capital * 2)) * 100));
  const dateStr = now.toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const timeStr = now.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});

  const rows = result.trades.map((t: any) => {
    const isO = t.exit_reason === "END_OF_DATA";
    const isA = t.exit_reason === "MAX_AGE";
    const pc = isO ? "#5E6673" : t.pnl >= 0 ? "#0ECB81" : "#F6465D";
    const rs = isO ? 'background:#1a1510;opacity:0.6;' : '';
    const isR = t.exit_reason === "RISK_STOP";
    const isL = t.exit_reason === "LIQUIDATED";
    const badge = isO
      ? '<span style="background:#332B00;color:#F0B90B;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;border:1px solid #5C4D00">OPEN</span>'
      : isA
      ? '<span style="background:#331A00;color:#FB923C;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700">MAX_AGE</span>'
      : isR
      ? '<span style="background:#1a1500;color:#F0B90B;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;border:1px solid #5C4D00">🛡️ RISK</span>'
      : isL
      ? '<span style="background:#2e0a0a;color:#F6465D;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;border:1px solid #5C2020">LIQUIDATED</span>'
      : '<span style="background:#0a2e1c;color:#0ECB81;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700">TP</span>';
    const sc = t.side === "LONG" ? "background:#0a2e1c;color:#0ECB81" : "background:#2e0a0a;color:#F6465D";
    return `<tr style="${rs}">
      <td style="color:#5E6673">${t.id}</td>
      <td><span style="${sc};padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700">${t.side}</span></td>
      <td style="white-space:nowrap">${fmt(t.entry_time)}</td>
      <td style="white-space:nowrap">${fmt(t.exit_time)}</td>
      <td style="text-align:center;color:#5E6673">${t.duration||"—"}</td>
      <td style="color:#EAECEF">$${t.entry_price}</td>
      <td style="color:#848E9C">$${t.avg_entry}</td>
      <td style="color:#EAECEF">$${t.exit_price}</td>
      <td style="color:#5DADE2">$${(t.margin||0).toFixed(2)}</td>
      <td style="color:${pc};font-weight:700">${t.pnl>=0?"+":""}${t.pnl.toFixed(4)}</td>
      <td style="color:${pc}">${(t.pnl_pct||0)>=0?"+":""}${(t.pnl_pct||0).toFixed(2)}%</td>
      <td style="color:#F0B90B">-$${(t.trading_fees||t.fees||0).toFixed(4)}</td>
      <td style="color:${(t.funding_net||0)<=0?'#0ECB81':'#FB923C'}">${(t.funding_net||0)===0?'—':`${(t.funding_net||0)>0?'-':'+'}$${Math.abs(t.funding_net||0).toFixed(4)}`}</td>
      <td style="text-align:center">${t.sos_filled}/${t.max_sos||"—"}</td>
      <td style="text-align:center">${badge}</td></tr>`;
  }).join("");

  const openW = s.has_open_trade
    ? `<div style="background:#1a1510;border:1px solid #5C4D00;border-radius:8px;padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;font-size:11px">
        <div style="color:#F0B90B">⚠️ An active basket was open at data end — PnL is <strong style="color:#EAECEF">unrealized</strong> and excluded from statistics.</div>
        <div style="font-weight:700;font-family:monospace;font-size:12px;color:${(s.open_trade_pnl||0)>=0?'#0ECB81':'#F6465D'}">${(s.open_trade_pnl||0)>=0?'+':''}${(s.open_trade_pnl||0).toFixed(4)} (unrealized)</div>
       </div>` : '';

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Twin Grid Report — ${rid}</title>
<style>
@page{margin:0;size:landscape}
@media print{html,body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;background:#0B0E14;color:#EAECEF;font-size:12px;line-height:1.5}
.hdr{background:linear-gradient(135deg,#181A20,#1E2329);padding:22px 28px;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #F0B90B}
.br{display:flex;align-items:center;gap:12px}
.logo{width:42px;height:42px;background:linear-gradient(135deg,#F0B90B,#E8A700);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:17px;color:#0B0E14;box-shadow:0 2px 12px rgba(240,185,11,0.3)}
.br h1{font-size:21px;font-weight:800;letter-spacing:-0.3px;color:#EAECEF}
.br h1 b{color:#F0B90B}
.br .sub{color:#5E6673;font-size:11px;margin-top:1px}
.rm{text-align:right}
.rm .id{color:#F0B90B;font-family:monospace;font-size:10px;font-weight:700}
.rm .dt{color:#5E6673;font-size:10px;margin-top:2px}
.rm .pr{display:inline-block;margin-top:5px;background:rgba(240,185,11,0.12);color:#F0B90B;padding:3px 14px;border-radius:6px;font-weight:700;font-size:12px;letter-spacing:0.5px}
.cnt{padding:20px 28px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
.sec{border:1px solid #2B3139;border-radius:10px;overflow:hidden;background:#12151B}
.sh{background:#181A20;padding:8px 14px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#F0B90B;border-bottom:1px solid #2B3139}
.sb{padding:14px}
.mg{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.mc{text-align:center;padding:12px 6px;background:#181A20;border-radius:8px;border:1px solid #2B3139}
.ml{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#5E6673;margin-bottom:4px}
.mv{font-size:19px;font-weight:800;font-family:monospace}
.ms{font-size:9px;color:#5E6673;margin-top:2px}
.cg{color:#0ECB81}.cr{color:#F6465D}.cb{color:#5DADE2}.ca{color:#F0B90B}
.rp{border:1px solid #2B3139;border-radius:10px;overflow:hidden;background:#12151B;margin-bottom:14px}
.rp-h{background:#181A20;padding:8px 14px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #2B3139;display:flex;align-items:center;justify-content:space-between}
.rp-b{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:0}
.rp-c{text-align:center;padding:10px 8px;border-right:1px solid #1E2329}
.rp-c:last-child{border-right:none}
.rp-l{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#5E6673;margin-bottom:3px}
.rp-v{font-size:14px;font-weight:800;font-family:monospace}
.cfg{display:grid;grid-template-columns:1fr 1fr}
.cfg-c:first-child{border-right:1px solid #2B3139}
.cfr{display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #1E2329}
.cfr:last-child{border-bottom:none}
.ck{font-size:10px;color:#5E6673}
.cv{font-size:10px;font-weight:700;font-family:monospace;color:#EAECEF}
.capb{border:1px solid #2B3139;border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:#12151B}
.capf{display:flex;align-items:center;gap:14px}
.cl{font-size:8px;text-transform:uppercase;letter-spacing:0.8px;color:#5E6673;font-weight:600}
.cvl{font-size:17px;font-weight:800;font-family:monospace}
.ca2{font-size:18px;color:#2B3139}
.bw{flex:1;max-width:180px}
.bt{height:7px;background:#1E2329;border-radius:4px;overflow:hidden}
.bf{height:100%;border-radius:4px}
.bl{font-size:8px;color:#5E6673;text-align:center;margin-top:2px}
.fb{text-align:right;font-size:10px;color:#5E6673}
.fb .fv{font-weight:700;color:#F0B90B;font-family:monospace}
.th{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.th h2{font-size:14px;font-weight:700;color:#EAECEF;margin:0}
.th .ct{font-size:9px;color:#5E6673;background:#1E2329;padding:2px 10px;border-radius:10px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
thead th{background:#181A20;color:#5E6673;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;padding:7px 5px;text-align:right;border-bottom:2px solid #2B3139;font-family:-apple-system,sans-serif}
thead th:nth-child(1),thead th:nth-child(2),thead th:nth-child(3),thead th:nth-child(4){text-align:left}
thead th:nth-child(5),thead th:nth-child(13),thead th:nth-child(14){text-align:center}
td{padding:5px 5px;border-bottom:1px solid #1E2329;color:#B7BDC6;text-align:right}
td:nth-child(1),td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left}
tbody tr:nth-child(even){background:rgba(255,255,255,0.015)}
.sfn{display:flex;gap:20px;padding:8px 14px;background:#181A20;border:1px solid #2B3139;border-radius:8px;margin-top:10px;font-size:9px;color:#5E6673}
.sfn strong{color:#EAECEF}
.disc{margin-top:20px;border:1px solid #2B3139;border-radius:10px;overflow:hidden;background:#12151B}
.disc-h{background:#181A20;padding:10px 16px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#F6465D;border-bottom:1px solid #2B3139}
.disc-b{padding:14px 16px;font-size:10px;color:#848E9C;line-height:1.7}
.disc-b p{margin-bottom:8px}
.disc-b strong{color:#EAECEF}
.disc-b .warn{color:#F0B90B;font-weight:600}
.ft{border-top:1px solid #2B3139;padding:10px 28px;display:flex;justify-content:space-between;font-size:8px;color:#5E6673;margin-top:16px}
.ftd{display:inline-block;width:4px;height:4px;background:#F0B90B;border-radius:50%;margin-right:4px;vertical-align:middle}
</style></head><body>

<div class="hdr">
  <div class="br">
    <div class="logo">TG</div>
    <div><h1>Twin <b>Grid</b> Strategy Report</h1><div class="sub">Automated Grid Trading • Backtest Analysis</div></div>
  </div>
  <div class="rm">
    <div class="id">${rid}</div>
    <div class="dt">${dateStr} • ${timeStr}</div>
    <div class="pr">${config.symbol}</div>
  </div>
</div>

<div class="cnt">
  <div class="g2">
    <div class="sec">
      <div class="sh">📊 Performance Metrics</div>
      <div class="sb"><div class="mg">
        <div class="mc"><div class="ml">Total Trades</div><div class="mv cb">${s.total_trades}</div><div class="ms">${s.winning_trades}W / ${s.losing_trades}L</div></div>
        <div class="mc"><div class="ml">Win Rate</div><div class="mv ${s.win_rate>=50?'cg':'cr'}">${s.win_rate}%</div></div>
        <div class="mc"><div class="ml">Total PnL</div><div class="mv ${s.total_pnl>=0?'cg':'cr'}">${s.total_pnl>=0?'+':''}$${s.total_pnl.toFixed(2)}</div><div class="ms">${s.total_pnl_pct>=0?'+':''}${s.total_pnl_pct}%</div></div>
        <div class="mc"><div class="ml">Max Drawdown</div><div class="mv ${s.max_drawdown_pct<=10?'cg':'cr'}">${s.max_drawdown_pct}%</div></div>
        <div class="mc"><div class="ml">Sharpe Ratio</div><div class="mv ${s.sharpe_ratio>=1?'cg':s.sharpe_ratio>=0?'ca':'cr'}">${s.sharpe_ratio}</div></div>
        <div class="mc"><div class="ml">Profit Factor</div><div class="mv ${s.profit_factor>=1.5?'cg':s.profit_factor>=1?'ca':'cr'}">${s.profit_factor>=999?'∞':s.profit_factor}</div></div>
      </div></div>
    </div>
    <div class="sec">
      <div class="sh">⚙️ Strategy Configuration</div>
      <div class="sb" style="padding:0"><div class="cfg" style="grid-template-columns:1fr 1fr 1fr">
        <div class="cfg-c">
          <div class="cfr"><span class="ck">Period</span><span class="cv" style="font-size:9px">${dateRange}</span></div>
          <div class="cfr"><span class="ck">Leverage</span><span class="cv">${config.leverage}x</span></div>
          <div class="cfr"><span class="ck">Sizing</span><span class="cv">${sizing}</span></div>
          <div class="cfr"><span class="ck">Max SOs</span><span class="cv">${config.max_safety_orders}</span></div>
          <div class="cfr"><span class="ck">Take Profit</span><span class="cv">${tp}</span></div>
          <div class="cfr"><span class="ck">Compounding</span><span class="cv">${compound}</span></div>
        </div><div class="cfg-c" style="border-right:1px solid #2B3139">
          <div class="cfr"><span class="ck">Vol Scale</span><span class="cv">${config.volume_scale}x</span></div>
          <div class="cfr"><span class="ck">Step Scale</span><span class="cv">${config.step_scale}x</span></div>
          <div class="cfr"><span class="ck">ATR Multi</span><span class="cv">${config.atr_multiplier}</span></div>
          <div class="cfr"><span class="ck">Step Range</span><span class="cv">${config.step_min_pct}–${config.step_max_pct}%</span></div>
          <div class="cfr"><span class="ck">Signal</span><span class="cv">${config.signal_threshold}</span></div>
          <div class="cfr"><span class="ck">RSI L/S</span><span class="cv">&lt;${config.rsi_long_threshold} / &gt;${config.rsi_short_threshold}</span></div>
        </div><div class="cfg-c">
          <div class="cfr"><span class="ck">Directions</span><span class="cv">${dirs}</span></div>
          <div class="cfr"><span class="ck">Max Basket Age</span><span class="cv">${age}</span></div>
          <div class="cfr"><span class="ck">Fees (M/T)</span><span class="cv">${fees}</span></div>
          <div class="cfr"><span class="ck">Trend Filter</span><span class="cv">${trend}</span></div>
          <div class="cfr"><span class="ck">Trend Mode</span><span class="cv">${trendMode}</span></div>
          <div class="cfr"><span class="ck">Trend EMA</span><span class="cv">${trendEma}</span></div>
        </div>
      </div></div>
    </div>
  </div>

  <!-- Risk & Protection Section -->
  <div class="rp">
    <div class="rp-h">
      <span style="color:${rcOn?'#F0B90B':'#5E6673'}">🛡️ Risk Controller</span>
      <span style="font-size:10px;font-weight:700;font-family:monospace;padding:2px 10px;border-radius:4px;${rcOn?'background:rgba(240,185,11,0.12);color:#F0B90B;border:1px solid rgba(240,185,11,0.3)':'background:#1E2329;color:#5E6673'}">${rcOn?'ACTIVE':'OFF'}</span>
    </div>
    <div class="rp-b">
      <div class="rp-c"><div class="rp-l">Risk Stops</div><div class="rp-v ${riskStops>0?'ca':'cg'}">${riskStops}</div></div>
      <div class="rp-c"><div class="rp-l">Peak Margin</div><div class="rp-v ${peakMargin>=80?'cr':peakMargin>=50?'ca':'cg'}">${typeof peakMargin==='number'?peakMargin.toFixed(1):peakMargin}%</div></div>
      <div class="rp-c"><div class="rp-l">SO Trigger</div><div class="rp-v" style="color:#EAECEF">${rcOn?rcSoTrig:'—'}</div></div>
      <div class="rp-c"><div class="rp-l">Max Loss</div><div class="rp-v" style="color:#EAECEF">${rcOn?rcLossMode:'—'}</div></div>
      <div class="rp-c"><div class="rp-l">Exit Direction</div><div class="rp-v" style="color:#EAECEF;font-size:10px">${rcOn?rcDirection:'—'}</div></div>
      <div class="rp-c"><div class="rp-l">Margin Guard</div><div class="rp-v" style="color:#EAECEF">${rcOn?rcMargin:'—'}</div></div>
      <div class="rp-c"><div class="rp-l">Avg SOs Filled</div><div class="rp-v cb">${s.avg_sos_filled}</div></div>
    </div>
  </div>

  <div class="capb">
    <div class="capf">
      <div><div class="cl">Initial</div><div class="cvl" style="color:#EAECEF">$${s.initial_capital.toFixed(2)}</div></div>
      <div class="ca2">→</div>
      <div><div class="cl">Final</div><div class="cvl" style="color:${retC}">$${s.final_capital.toFixed(2)}</div></div>
      <div style="margin-left:6px"><div class="cl">Return</div><div class="cvl" style="color:${retC};font-size:14px">${Number(retPct)>=0?'+':''}${retPct}%</div></div>
    </div>
    <div class="bw"><div class="bt"><div class="bf" style="width:${prog.toFixed(0)}%;background:${retC}"></div></div><div class="bl">Capital Growth</div></div>
    <div class="fb">
      <div>Trading: <span class="fv">-$${(s.total_trading_fees||0).toFixed(2)}</span></div>
      <div>Fund Paid: <span class="fv" style="color:#FB923C">-$${(s.total_funding_paid||0).toFixed(2)}</span></div>
      <div>Fund Rcvd: <span class="fv" style="color:#0ECB81">+$${(s.total_funding_received||0).toFixed(2)}</span></div>
      <div style="border-top:1px solid #2B3139;padding-top:2px;margin-top:2px">Total: <span class="fv">-$${(s.total_fees_paid||0).toFixed(2)}</span></div>
    </div>
  </div>

  ${openW}

  <div class="th"><h2>Trade History</h2><span class="ct">${s.total_trades} completed${s.has_open_trade?' + 1 open':''}</span></div>
  <table><thead><tr>
    <th>#</th><th>Side</th><th>Entry Time</th><th>Exit Time</th><th style="text-align:center">Dur.</th>
    <th>Entry $</th><th>Avg Entry</th><th>Exit $</th><th>Margin</th>
    <th>PnL</th><th>PnL%</th><th>Trade Fee</th><th>Funding</th><th style="text-align:center">SOs</th><th style="text-align:center">Exit</th>
  </tr></thead><tbody>${rows}</tbody></table>

  <div class="sfn">
    <span>Avg PnL: <strong>${s.avg_trade_pnl>=0?'+':''}$${s.avg_trade_pnl.toFixed(4)}</strong></span>
    <span>Avg SOs: <strong>${s.avg_sos_filled}</strong></span>
    <span>Directions: <strong>${config.allow_long?'✓ Long':'✗ Long'} / ${config.allow_short?'✓ Short':'✗ Short'}</strong></span>
    <span>Compounding: <strong>${config.compounding_enabled?config.compounding_pct+'%':'Off'}</strong></span>
  </div>

  <!-- RISK DISCLAIMER -->
  <div class="disc">
    <div class="disc-h">⚠️ Important Disclaimers & Risk Warnings</div>
    <div class="disc-b">
      <p><strong>Simulated Performance Notice:</strong> This report presents the results of a <strong>historical backtest simulation</strong> and does not represent actual trading results. Past performance, whether actual or simulated, is <span class="warn">not indicative of future results</span>. No representation is being made that any account will or is likely to achieve profits or losses similar to those shown.</p>

      <p><strong>Simulation Limitations:</strong> This backtest uses realistic execution modeling including Binance-equivalent maker/taker fees (0.02%/0.04%), estimated funding rate charges (every 8 hours), and order fill simulation against historical candlestick high/low wicks. However, the simulation <span class="warn">cannot fully replicate</span> real-world conditions such as order book depth, slippage at scale, partial fills, exchange outages, liquidation cascades, or network latency.</p>

      <p><strong>Leveraged Trading Risk:</strong> This strategy uses leveraged futures positions. <span class="warn">Leverage amplifies both profits and losses.</span> Trading with ${config.leverage}x leverage means a ${(100/config.leverage).toFixed(1)}% adverse price move could result in total loss of margin. You could lose more than your initial investment. Only trade with capital you can afford to lose entirely.</p>

      <p><strong>Market Risk:</strong> Cryptocurrency markets are highly volatile, operate 24/7, and can experience sudden price dislocations, flash crashes, or prolonged drawdowns that may not be reflected in the historical period tested. Results from a ${config.period_days}-day window may not be representative of longer-term market conditions.</p>

      <p><strong>Configuration Sensitivity:</strong> Backtest results are highly sensitive to parameter selection. Small changes in grid spacing, safety order counts, take-profit percentages, or signal thresholds can produce dramatically different outcomes. Results shown reflect <strong>one specific configuration</strong> and should not be extrapolated to other settings or market regimes.</p>

      <p><strong>No Financial Advice:</strong> This report is generated for informational and analytical purposes only. It does not constitute financial advice, investment advice, trading advice, or any other form of professional advice. Consult a qualified financial advisor before making any investment decisions.</p>

      <p style="margin-bottom:0;color:#5E6673;font-size:9px;font-style:italic">Report generated by Twin Grid Platform v1.0 • Engine: Candle-by-candle simulation with multi-indicator signal fusion (RSI, Bollinger Bands, EMA Slope, ATR) • Grid: Dynamic ATR-scaled safety order placement with configurable volume and step scaling.</p>
    </div>
  </div>
</div>

<div class="ft">
  <div><span class="ftd"></span>Twin Grid Platform • ${rid} • Generated ${now.toISOString()}</div>
  <div style="font-style:italic;color:#5E6673">CONFIDENTIAL — For authorized recipients only</div>
</div>
</body></html>`;

  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { w.print(); }, 800); }
}
