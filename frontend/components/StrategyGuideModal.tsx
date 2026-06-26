"use client";
import { X, ChevronDown, TrendingUp, Shield, Settings2, Zap, BarChart3, Target, Gauge, Clock, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Portal } from "@/components/Portal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function Section({ icon, title, accent, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#2B3139] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[#2B3139]/30 transition-colors"
      >
        <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${accent}15` }}>
          {icon}
        </div>
        <span className="text-sm font-bold text-[#EAECEF] flex-1 text-left">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#5E6673] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="px-4 pb-4 space-y-3 border-t border-[#2B3139]/60">{children}</div>}
    </div>
  );
}

function Setting({ name, defaultVal, children }: { name: string; defaultVal: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-[#EAECEF]">{name}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2B3139] text-[#848E9C] font-mono">
          Default: {defaultVal}
        </span>
      </div>
      <div className="text-xs text-[#848E9C] leading-relaxed">{children}</div>
    </div>
  );
}

function Example({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 bg-[#0B0E11] border border-[#2B3139]/60 rounded-lg px-3 py-2 text-[11px] text-[#F0B90B]/80 font-mono leading-relaxed">
      {children}
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex gap-2 bg-[#0ECB81]/5 border border-[#0ECB81]/10 rounded-lg px-3 py-2">
      <span className="text-[10px]">💡</span>
      <span className="text-[11px] text-[#0ECB81]/90 leading-relaxed">{children}</span>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex gap-2 bg-[#F6465D]/5 border border-[#F6465D]/10 rounded-lg px-3 py-2">
      <span className="text-[10px]">⚠️</span>
      <span className="text-[11px] text-[#F6465D]/90 leading-relaxed">{children}</span>
    </div>
  );
}

export default function StrategyGuideModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <Portal>
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-[#181A20] border border-[#2B3139] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2B3139] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#EAECEF] flex items-center gap-2">
              <Settings2 className="h-4.5 w-4.5 text-[#F0B90B]" />
              Strategy Settings Guide
            </h2>
            <p className="text-[11px] text-[#5E6673] mt-0.5">
              Understand every parameter and how it affects your trading bot.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#2B3139] text-[#5E6673] hover:text-[#EAECEF] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">

          {/* ─── Trading Pair ─── */}
          <Section
            icon={<BarChart3 className="h-4 w-4 text-[#F0B90B]" />}
            title="Trading Pair"
            accent="#F0B90B"
            defaultOpen={true}
          >
            <Setting name="Active Symbol" defaultVal="BTC/USDT">
              The futures pair the bot trades on. All signals, orders, and grid calculations are tied to this pair.
              Changing the pair <strong className="text-[#EAECEF]">does not</strong> close existing positions — finish
              active baskets first.
            </Setting>
            <Example>
              BTC/USDT — Higher liquidity, wider price swings → larger ATR-based grid spacing.<br/>
              ETH/USDT — Moderate volatility, good for balanced grid setups.<br/>
              SOL/USDT — Higher % moves, more frequent signals, but also more volatile.
            </Example>
          </Section>

          {/* ─── Position Sizing ─── */}
          <Section
            icon={<TrendingUp className="h-4 w-4 text-[#0ECB81]" />}
            title="Position Sizing"
            accent="#0ECB81"
          >
            <Setting name="Sizing Mode" defaultVal="Fixed USD">
              <strong className="text-[#EAECEF]">Fixed USD ($)</strong> — Every base order uses a fixed dollar amount as margin,
              regardless of your account balance. Best for consistent, predictable risk.<br/><br/>
              <strong className="text-[#EAECEF]">% of Capital</strong> — Base order margin is calculated as a percentage of your
              current wallet balance. Automatically scales up/down as your balance changes.
            </Setting>
            <Example>
              Fixed $1 + 20x leverage = $20 notional per base order.<br/>
              1% of $500 wallet + 20x = $5 margin → $100 notional per base order.
            </Example>

            <Setting name="Base Order" defaultVal="$1 / 1%">
              The initial position size (margin) when a new basket opens. This is the <strong className="text-[#EAECEF]">first entry</strong>.
              Safety orders add to this position using the Volume Scale multiplier.
            </Setting>
            <Example>
              Base Order = $1, Leverage = 20x<br/>
              → Actual position = $1 × 20 = $20 notional<br/>
              → On BTC at $60,000: you hold ~0.000333 BTC
            </Example>

            <Setting name="Leverage (x)" defaultVal="10x">
              Multiplies your margin to create a larger position. Higher leverage = bigger profits but also
              faster liquidation if the market moves against you.
            </Setting>
            <Warning>
              At 20x, a 5% price move against you = 100% margin loss (liquidation).
              Start with 5-10x while testing.
            </Warning>
          </Section>

          {/* ─── Compounding ─── */}
          <Section
            icon={<Zap className="h-4 w-4 text-[#8B5CF6]" />}
            title="Compounding"
            accent="#8B5CF6"
          >
            <Setting name="Compounding Toggle" defaultVal="OFF">
              When enabled, the base order size automatically grows as your account balance increases.
              The bot records your <strong className="text-[#EAECEF]">initial capital</strong> on the first trade, then scales
              orders proportionally to account growth.
            </Setting>

            <Setting name="Growth Scale (%)" defaultVal="100%">
              Controls how aggressively order sizes compound. At 100%, orders grow proportionally with your account.
              At 50%, orders grow at half the rate.
            </Setting>
            <Example>
              Initial capital: $100, Base order: $1, Growth Scale: 100%<br/>
              Account grows to $120 (20% growth):<br/>
              → New base order = $1 × (1 + 1.0 × 0.20) = <strong>$1.20</strong><br/><br/>
              Same scenario with Growth Scale 50%:<br/>
              → New base order = $1 × (1 + 0.5 × 0.20) = <strong>$1.10</strong>
            </Example>
            <Tip>
              Use 100% for fully proportional scaling. Use lower values (30-50%) for conservative compounding
              that limits exposure during rapid growth phases.
            </Tip>
          </Section>

          {/* ─── Grid Configuration ─── */}
          <Section
            icon={<Target className="h-4 w-4 text-[#3B82F6]" />}
            title="Grid Configuration"
            accent="#3B82F6"
          >
            <Setting name="Max Safety Orders" defaultVal="7">
              The maximum number of DCA (Dollar Cost Average) orders placed <strong className="text-[#EAECEF]">below</strong> your
              entry (for longs) or <strong className="text-[#EAECEF]">above</strong> (for shorts). Each safety order averages down
              your entry price, making it easier to reach take profit.
            </Setting>
            <Example>
              7 safety orders = 1 base order + 7 DCA levels = 8 total entries per basket.<br/>
              More SOs = deeper grid = survives larger dips but requires more capital.
            </Example>

            <Setting name="Take Profit" defaultVal="1% / $5">
              Set your profit target per basket. Two modes are available:<br/><br/>
              <strong className="text-[#EAECEF]">% of Balance</strong> — Target profit is calculated as a percentage of your total wallet
              balance. Scales automatically as your balance changes.<br/><br/>
              <strong className="text-[#EAECEF]">Fixed Amount ($)</strong> — Target profit is a fixed dollar amount per basket,
              regardless of your wallet balance. Best for predictable, consistent profit targets.
            </Setting>
            <Example>
              <strong>% Mode:</strong> Wallet = $500, TP = 1% → Target = $5 per basket.<br/>
              Wallet = $500, TP = 0.5% → Target = $2.50 per basket.<br/><br/>
              <strong>Fixed Mode:</strong> TP = $3 → Every basket closes at $3 profit,<br/>
              regardless of wallet size.
            </Example>
            <Tip>
              <strong>% Mode:</strong> Lower TP (0.3-0.5%) = more frequent closes, higher win rate.
              Higher TP (1-2%) = fewer but larger profits.<br/>
              <strong>Fixed Mode:</strong> Great for consistent position sizing. Use when you want
              the same dollar profit on every basket regardless of account growth.
            </Tip>

            <Setting name="Volume Scale" defaultVal="1.5">
              Multiplier for each successive safety order{"'"}s size. Each SO is <strong className="text-[#EAECEF]">Volume Scale × previous SO</strong>.
              Higher values make later safety orders much larger, averaging entry price faster.
            </Setting>
            <Example>
              Base = $1, Volume Scale = 1.5:<br/>
              SO1 = $1 × 1.5¹ = <strong>$1.50</strong><br/>
              SO2 = $1 × 1.5² = <strong>$2.25</strong><br/>
              SO3 = $1 × 1.5³ = <strong>$3.37</strong><br/>
              SO7 = $1 × 1.5⁷ = <strong>$17.08</strong><br/>
              Total margin (all 8 levels) ≈ <strong>$44.17</strong>
            </Example>
            <Warning>
              Volume Scale 2.0+ creates an exponential curve — SO7 can be 128x the base order.
              Ensure your wallet can cover the full grid depth.
            </Warning>

            <Setting name="Step Scale" defaultVal="1.35">
              Controls the <strong className="text-[#EAECEF]">spacing</strong> between safety order levels. Each step is{" "}
              <strong className="text-[#EAECEF]">Step Scale × previous step</strong>. Higher values spread safety orders further apart.
              The initial step size is derived from ATR (market volatility).
            </Setting>
            <Example>
              ATR-based initial step = 0.5%, Step Scale = 1.35:<br/>
              SO1 fills at: 0.50% from entry<br/>
              SO2 fills at: 0.50% + 0.67% = <strong>1.17%</strong> from entry<br/>
              SO3 fills at: 1.17% + 0.91% = <strong>2.08%</strong> from entry<br/>
              SO7 fills at: ≈ <strong>8.5%</strong> from entry<br/><br/>
              Step Scale = 1.0 (no scaling):<br/>
              All steps are equal → SO7 at 3.5% from entry (much tighter grid).
            </Example>
            <Tip>
              Step Scale 1.0 = uniform grid (better for ranging markets).<br/>
              Step Scale 1.3-1.5 = exponential grid (better for trending/volatile markets, covers more range).
            </Tip>
          </Section>

          {/* ─── Risk Management ─── */}
          <Section
            icon={<Shield className="h-4 w-4 text-[#F6465D]" />}
            title="Risk Management"
            accent="#F6465D"
          >
            <Setting name="Max Basket Age" defaultVal="72 hours">
              Force-closes any basket (open position) older than this duration. Prevents capital from being locked
              in a single losing trade indefinitely.
            </Setting>
            <Example>
              72h → If a basket opened Monday at 10:00 AM hasn{"'"}t hit TP by Thursday 10:00 AM,
              the bot force-closes it at market price (may close at a loss).<br/><br/>
              "Off" → No time limit. The basket stays open until TP is hit or you manually close it.
            </Example>
            <Warning>
              Disabling this ("Off") means a deep drawdown could lock your capital indefinitely.
              Recommended: 48-72h for active trading, 7 days for swing-style setups.
            </Warning>
          </Section>

          {/* ─── Risk Controller ─── */}
          <Section
            icon={<ShieldAlert className="h-4 w-4 text-[#F0B90B]" />}
            title="Risk Controller"
            accent="#F0B90B"
          >
            <Setting name="Risk Controller Toggle" defaultVal="OFF">
              When enabled, the bot monitors every open basket in real-time and automatically
              <strong className="text-[#EAECEF]"> force-closes the position</strong> when it breaches
              your defined "affordable loss" threshold. This prevents baskets from reaching liquidation
              by cutting losses at a controlled level you choose in advance.
            </Setting>
            <Tip>
              This is your last line of defense before liquidation. Even with a well-tuned grid,
              extreme market moves (flash crashes, black swan events) can exhaust all safety orders.
              The Risk Controller closes the position <strong>before</strong> the exchange liquidates it.
            </Tip>

            <Setting name="SO Trigger" defaultVal="5">
              The number of Safety Orders that must be filled <strong className="text-[#EAECEF]">before</strong> the
              risk controller starts evaluating loss limits. This prevents premature closes — the grid strategy
              naturally recovers from small dips via DCA, so the risk controller only activates when the position
              is deeply underwater.
            </Setting>
            <Example>
              SO Trigger = 3 → After 3 SOs fill, the risk controller starts checking your loss limit.<br/>
              SO Trigger = 5 → More patient — lets the grid work through moderate dips before intervening.<br/>
              SO Trigger = 7 → Only activates when ALL SOs are filled (maximum exposure).
            </Example>

            <Setting name="Affordable Loss Mode" defaultVal="% of Wallet">
              Choose how the loss limit is calculated:<br/><br/>
              <strong className="text-[#EAECEF]">% of Wallet</strong> — Loss threshold as a percentage of your total
              wallet balance. Automatically scales with account size. Best for proportional risk management.<br/><br/>
              <strong className="text-[#EAECEF]">Fixed USD</strong> — A fixed dollar amount as the maximum acceptable loss
              per basket. Best when you want a hard cap regardless of account size.
            </Setting>
            <Example>
              <strong>% Mode:</strong> Wallet = $500, Max Loss = 10%<br/>
              → Risk controller closes the basket when unrealized loss exceeds <strong>$50</strong>.<br/><br/>
              <strong>Fixed Mode:</strong> Max Loss = $30<br/>
              → Closes the basket when unrealized loss exceeds <strong>$30</strong>, regardless of wallet size.
            </Example>

            <Setting name="Exit Direction" defaultVal="Exceeds">
              Controls <strong className="text-[#EAECEF]">when</strong> the risk controller triggers relative to your
              loss threshold. Two modes:<br/><br/>
              <strong className="text-[#EAECEF]">⛔ Exceeds (default)</strong> — Standard stop-loss. The basket is
              force-closed as soon as the unrealized loss crosses the threshold. If the limit is 10%, the bot closes
              at exactly 10%.<br/><br/>
              <strong className="text-[#EAECEF]">↩️ Recovers To</strong> — Recovery exit. The basket is allowed to
              go <em>deeper than the threshold</em>, but is closed when the PnL recovers <em>back</em> to the threshold.
              This allows the DCA grid more room to work — the bot waits for partial recovery before exiting.
            </Setting>
            <Example>
              Max Loss = 10% of wallet ($50 on a $500 account).<br/><br/>
              <strong>Exceeds mode:</strong><br/>
              Loss hits $50 → Bot closes immediately at -$50.<br/><br/>
              <strong>Recovers To mode:</strong><br/>
              Loss hits $50 → Bot keeps running, SOs continue filling.<br/>
              Loss deepens to $80 (grid is working) → Still running.<br/>
              Price recovers, loss improves to $50 → Bot closes at -$50.
            </Example>
            <Tip>
              {"Recovers To"} is ideal when you trust the grid to recover but want a guaranteed maximum exit level.
              The bot absorbs deeper drawdown without panic-closing, then exits cleanly at your chosen threshold
              on the way back up.
            </Tip>
            <Warning>
              In {"Recovers To"} mode, the basket can reach losses significantly deeper than the threshold before
              the exit triggers. Make sure your account has enough margin to survive the deeper drawdown phase.
              Combine with Margin Guard for protection against extreme moves.
            </Warning>

            <Setting name="Margin Guard" defaultVal="ON / 80%">
              An <strong className="text-[#EAECEF]">independent safety gate</strong> that monitors your account{"'s"}
              margin ratio in real-time. If the ratio exceeds this threshold, the basket is force-closed
              <strong className="text-[#EAECEF]"> regardless of how many SOs have filled</strong>. This is the
              closest guard to actual liquidation.<br /><br />
              Use the <strong className="text-[#EAECEF]">toggle</strong> to enable or disable Margin Guard entirely.
              When disabled, the % threshold input is hidden and no margin-based exit will fire.
            </Setting>
            <Example>
              Margin Guard = 80% → If your account margin usage reaches 80%, close immediately.<br/>
              Binance liquidates at 100% — setting this to 80% gives you a 20% safety buffer.<br/><br/>
              Margin Guard = 90% → Tighter buffer. More capital efficient but riskier.
            </Example>
            <Warning>
              The Margin Guard fires independently of the SO Trigger. Even if only 1 SO has filled,
              if your margin ratio hits the threshold, the basket will be closed. This is intentional —
              it{"'s"} your emergency brake. Set it between 70-85% for safe operation.
            </Warning>
          </Section>

          {/* ── Trend Filter ── */}
          <Section
            icon={<BarChart3 className="h-4 w-4 text-[#F0B90B]" />}
            title="Trend Filter"
            accent="#F0B90B"
          >
            <Setting name="Trend Filter Toggle" defaultVal="OFF">
              When enabled, the bot checks the <strong className="text-[#EAECEF]">macro trend direction</strong> on higher
              timeframes (1D, 4H, 1H) before opening any position. If the trend is bearish, LONG entries are blocked.
              If the trend is bullish, SHORT entries are blocked. This prevents the strategy from fighting the dominant
              market direction — a key cause of liquidation.
            </Setting>
            <Tip>
              This is the most impactful risk-reduction setting. Even with all other settings well-tuned,
              a single counter-trend trade in a strong move can wipe out weeks of profit.
            </Tip>

            <Setting name="Timeframes" defaultVal="1D, 4H">
              Select which higher timeframes to analyze for trend detection. The bot uses <strong className="text-[#EAECEF]">EMA crossovers</strong>{" "}
              (fast vs slow) on each selected timeframe to determine if the trend is bullish, bearish, or neutral.
            </Setting>
            <Example>
              1D + 4H (default) → Checks daily and 4-hour trend. Both must agree (majority mode).<br/>
              1D only → Follows only the daily trend (slower, fewer direction changes).<br/>
              1D + 4H + 1H → All three timeframes contribute to the trend decision.
            </Example>

            <Setting name="Combine Mode" defaultVal="Majority">
              How to combine signals from multiple timeframes:<br/><br/>
              <strong className="text-[#EAECEF]">Majority</strong> — Most selected timeframes must agree on direction. With 2 TFs, both must agree.
              With 3 TFs, 2-of-3 is enough.<br/><br/>
              <strong className="text-[#EAECEF]">All</strong> — ALL selected timeframes must agree. Strictest mode — if any TF disagrees,
              both directions are allowed (no filtering).<br/><br/>
              <strong className="text-[#EAECEF]">Any</strong> — ANY single timeframe can set the direction. Loosest mode — even one
              bearish TF will block longs.
            </Setting>
            <Example>
              1D = BULLISH, 4H = BEARISH:<br/>
              Majority → No consensus → Both allowed (NEUTRAL).<br/>
              All → Disagree → Both allowed (NEUTRAL).<br/>
              Any → Conflict → Higher count wins; if tied, NEUTRAL.<br/><br/>
              1D = BULLISH, 4H = BULLISH, 1H = BEARISH:<br/>
              Majority → 2/3 bullish → Only LONG allowed.<br/>
              All → Not all agree → Both allowed.<br/>
              Any → Bullish wins (2 vs 1) → Only LONG allowed.
            </Example>

            <Setting name="Fast EMA / Slow EMA" defaultVal="9 / 21">
              The EMA periods used for trend detection. When the <strong className="text-[#EAECEF]">Fast EMA</strong> is above
              the <strong className="text-[#EAECEF]">Slow EMA</strong> and rising, the trend is bullish. When below and falling,
              it{"'s"} bearish. When they{"'re"} within 0.1% of each other, the trend is neutral.
            </Setting>
            <Example>
              Fast 9 / Slow 21 (default) → Responsive, catches trend changes quickly.<br/>
              Fast 20 / Slow 50 → Slower, filters out short-term noise. Better for swing-style setups.
            </Example>
            <Warning>
              Very fast EMAs (3/5) will flip trend direction frequently, reducing the filter{"'s"} effectiveness.
              Very slow EMAs (50/200) will lag behind major trend reversals.
            </Warning>
          </Section>

          {/* ── Signal Sensitivity ── */}
          <Section
            icon={<Gauge className="h-4 w-4 text-[#F0B90B]" />}
            title="Signal Sensitivity"
            accent="#F0B90B"
          >
            <Setting name="Entry Threshold" defaultVal="50">
              The minimum score (0–100) required to open a new basket. The bot scores each potential trade based on
              5 weighted indicators: RSI (30pts), Bollinger Bands (25pts), MACD (20pts), EMA Trend (15pts),
              and Price Action (10pts).
            </Setting>
            <Example>
              Threshold 35 (Aggressive) → Opens baskets on weaker signals. More trades, but more false entries.<br/>
              Threshold 55 (Default) → Balanced — needs good confluence across indicators.<br/>
              Threshold 70 (Conservative) → Only trades on very strong, high-confidence setups. Fewer trades.
            </Example>
            <Tip>
              In trending markets, lower thresholds (40-50) catch more moves.<br/>
              In choppy/sideways markets, higher thresholds (60-70) filter out noise.
            </Tip>

            <Setting name="RSI Long Threshold (<)" defaultVal="40">
              RSI value below which the bot considers the market <strong className="text-[#0ECB81]">oversold</strong> (buy opportunity).
              Lower = more oversold required to trigger the RSI component of the long signal score.
            </Setting>
            <Example>
              RSI Long = 40 → RSI must drop below 40 to score points for a long entry.<br/>
              RSI Long = 30 → More restrictive — only triggers on deep oversold conditions.
            </Example>

            <Setting name="RSI Short Threshold (>)" defaultVal="60">
              RSI value above which the bot considers the market <strong className="text-[#F6465D]">overbought</strong> (sell opportunity).
              Higher = more overbought required to trigger the RSI component of the short signal score.
            </Setting>
            <Example>
              RSI Short = 60 → RSI must rise above 60 to contribute to a short signal.<br/>
              RSI Short = 70 → Only extreme overbought conditions trigger short RSI scoring.
            </Example>
          </Section>

          {/* ─── Trade Direction ─── */}
          <Section
            icon={<TrendingUp className="h-4 w-4 text-[#0ECB81]" />}
            title="Trade Direction"
            accent="#0ECB81"
          >
            <Setting name="Allow Long / Allow Short" defaultVal="Both ON">
              Toggle which directions the bot can trade. You can run long-only, short-only, or both.
            </Setting>
            <Example>
              Both ON → Bot trades in both directions based on signals (default).<br/>
              Long Only → Only opens long positions — good during confirmed uptrends.<br/>
              Short Only → Only opens short positions — useful during confirmed downtrends.
            </Example>
            <Tip>
              During a strong bull market, disable shorts to avoid fighting the trend.
              During a bear market, disable longs. In sideways markets, keep both enabled.
            </Tip>
          </Section>

          {/* ─── Quick Reference ─── */}
          <div className="border border-[#F0B90B]/20 bg-[#F0B90B]/5 rounded-xl p-4">
            <h3 className="text-xs font-bold text-[#F0B90B] uppercase tracking-wider mb-3">⚡ Quick Reference: Default Settings</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px]">
              {[
                ["Trading Pair", "BTC/USDT"],
                ["Sizing Mode", "Fixed USD"],
                ["Base Order", "$1"],
                ["Leverage", "10x"],
                ["Compounding", "OFF"],
                ["Max Safety Orders", "7"],
                ["Take Profit", "1% / $5"],
                ["Volume Scale", "1.5"],
                ["Step Scale", "1.35"],
                ["Max Basket Age", "72 hours"],
                ["Risk Controller", "OFF"],
                ["SO Trigger", "5 SOs"],
                ["Exit Direction", "Exceeds"],
                ["Margin Guard", "ON / 80%"],
                ["Entry Threshold", "50"],
                ["RSI Long / Short", "40 / 60"],
                ["Trend Filter", "OFF"],
              ].map(([k, v], i) => (
                <div key={i} className="flex justify-between py-0.5 border-b border-[#2B3139]/30">
                  <span className="text-[#848E9C]">{k}</span>
                  <span className="text-[#EAECEF] font-mono font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
    </Portal>
  );
}
