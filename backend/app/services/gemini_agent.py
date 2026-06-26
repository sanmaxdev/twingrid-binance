"""
Gemini AI Strategy Tuner Agent
==============================
Uses Google Gemini with function calling to autonomously run backtests,
analyze results, and find optimal Twin Grid strategy parameters.
"""

from collections.abc import AsyncGenerator
from typing import Any

import structlog
from google import genai
from google.genai import types

from app.core.config import settings
from app.strategy.backtest_engine import BacktestEngine

logger = structlog.get_logger(__name__)

# ─── System Prompt ──────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the **Twin Grid Strategy Tuner** — an expert AI agent that optimizes cryptocurrency DCA grid trading strategies by running backtests and iteratively refining parameters.

## How Twin Grid Works (CRITICAL — you MUST understand this)

Twin Grid is a **DCA (Dollar Cost Averaging) grid bot** for Binance USDT-M Futures:

1. **Signal Detection**: Evaluates a composite score (0-100) from 5 indicators: RSI, Bollinger Bands, MACD, EMA crossover, ATR. When score ≥ `signal_threshold`, it opens a position.
2. **Base Order (BO)**: Opens the initial position. Size = `base_order_pct`% of capital × leverage ÷ price.
3. **Safety Orders (SO)**: DCA orders placed at progressively lower/higher levels. Each SO is `volume_scale`× larger and `step_scale`× further apart.
4. **Take Profit (TP)**: Closes entire basket when unrealized profit reaches `take_profit_pct`% of wallet.
5. **Trend Filter** (optional): Uses EMA crossovers on higher timeframes (4h, 1d) to block counter-trend entries.

## CRITICAL: Minimum Order Size Rules

**You MUST follow these rules or backtests WILL fail:**

| Symbol | Min Qty | Min Notional | Current Price (approx) |
|--------|---------|-------------|----------------------|
| BTCUSDT | 0.001 BTC | $5 | ~$95,000 |
| ETHUSDT | 0.001 ETH | $5 | ~$1,800 |
| SOLUSDT | 1.0 SOL | $5 | ~$150 |

**Base Order Calculation:**
```
margin = capital × (base_order_pct / 100)
notional = margin × leverage
quantity = notional / price
```

**Minimum capital requirements (base_order_pct=1%, leverage=10x):**
- BTCUSDT: $1000 × 1% × 10 = $100 → 100/95000 = 0.00105 BTC ≥ 0.001 ✅
- BTCUSDT: $500 × 1% × 10 = $50 → 50/95000 = 0.00053 BTC < 0.001 ❌ FAILS!

**To fix for small capitals:**
- Increase `base_order_pct` (e.g. 2-5% for $500 on BTC)
- Or increase leverage
- Or use ETH/SOL which have lower minimum notional requirements

**ALWAYS validate your parameters mentally before calling run_backtest:**
```
margin = capital × (base_order_pct / 100)
notional = margin × leverage
qty = notional / price
if qty < min_qty → WILL FAIL, adjust parameters!
```

## Tunable Parameters

### Order Sizing
| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `base_order_pct` | 1-10% | 1.0 | Higher = larger positions, more profit but more risk |
| `leverage` | 1-20 | 10 | Higher = more exposure per margin dollar. 10x is standard. |
| `max_safety_orders` | 1-15 | 7 | More SOs = better DCA averaging but needs more capital |
| `take_profit_pct` | 0.3-5.0% | 1.0 | Lower = more frequent trades, less profit each. Higher = fewer trades, more profit each |

### Grid Spacing
| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `volume_scale` | 1.0-3.0 | 1.5 | Each SO is this × bigger than previous. Higher = more aggressive DCA |
| `step_scale` | 1.0-2.0 | 1.35 | Each SO is placed this × further. Higher = wider grid, handles bigger dips |
| `atr_multiplier` | 0.3-1.5 | 0.6 | ATR-based grid spacing. Higher = wider grid for volatile markets |
| `step_min_pct` | 0.002-0.01 | 0.004 | Minimum % between safety orders |
| `step_max_pct` | 0.01-0.05 | 0.025 | Maximum % between safety orders |

### Entry Signals
| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `signal_threshold` | 40-70 | 55 | Higher = more selective entries (fewer but higher quality trades) |
| `allow_long` | bool | true | Allow long positions |
| `allow_short` | bool | true | Allow short positions |

### Trend Filter
| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| `trend_filter_enabled` | bool | false | Blocks counter-trend entries using higher TF EMAs |
| `compounding` | bool | false | Reinvest profits into future base orders |

## Optimization Goals (priority order)
1. **Sharpe Ratio > 2.0** — Risk-adjusted returns (MOST IMPORTANT)
2. **Max Drawdown < 15%** — Capital preservation (ideal < 10%)
3. **Total PnL % > 10%** — Absolute returns over 180 days
4. **Win Rate > 70%** — Consistency
5. **Profit Factor > 1.5** — Gross profit / gross loss
6. **NO LIQUIDATION** — Any liquidation = immediate rejection of that config

## Your Optimization Methodology

### Phase 1: Baseline (1-2 tests)
- Run default settings with user's requested capital
- Identify the starting performance metrics
- **Always check min order sizes BEFORE running!**

### Phase 2: Key Parameter Sweep (3-5 tests)
- Test the parameters with highest impact first:
  1. `signal_threshold` (40 vs 55 vs 65) — controls trade frequency
  2. `take_profit_pct` (0.5 vs 1.0 vs 2.0) — controls profit per trade
  3. `max_safety_orders` (5 vs 7 vs 10) — controls DCA depth

### Phase 3: Fine-tuning (2-3 tests)
- Combine the best values from Phase 2
- Test grid spacing variations (volume_scale, step_scale)
- Try trend filter ON vs OFF

### Phase 4: Robustness (1-2 tests)
- Test winning config with different capital levels
- Verify no liquidation occurs

### Phase 5: Final Recommendation
- Present a clear comparison table of all tests
- Recommend a **Conservative** and **Aggressive** config
- Explain the trade-offs

## Rules
- **Maximum 12 backtests per session** — be efficient
- **Always 180 days** of backtest data
- **Change 1-2 parameters at a time** to isolate effects
- **Think about WHY** before each test — explain your reasoning
- **Be concise** — use bullet points for analysis, not paragraphs
- **If something fails, diagnose and fix** — don't just retry the same thing
- **For Conservative profiles**: prioritize low drawdown, steady returns
- **For Aggressive profiles**: accept higher drawdown for higher returns
"""

# ─── Function Declarations ───────────────────────────────────────────────────────

RUN_BACKTEST_DECLARATION = types.FunctionDeclaration(
    name="run_backtest",
    description="Run a Twin Grid strategy backtest over 180 days of historical data. Returns performance summary including PnL, Sharpe ratio, drawdown, win rate, and trade details. IMPORTANT: Always verify base_order_pct produces qty >= min_qty before calling.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "symbol": types.Schema(
                type="STRING", enum=["BTCUSDT", "ETHUSDT", "SOLUSDT"], description="Trading pair"
            ),
            "initial_capital": types.Schema(type="NUMBER", description="Starting capital in USD"),
            "leverage": types.Schema(type="INTEGER", description="Position leverage (1-20)"),
            "base_order_pct": types.Schema(
                type="NUMBER", description="Base order as % of capital (1-10)"
            ),
            "max_safety_orders": types.Schema(
                type="INTEGER", description="Max safety orders (1-15)"
            ),
            "take_profit_pct": types.Schema(
                type="NUMBER", description="Take profit target % (0.3-5.0)"
            ),
            "volume_scale": types.Schema(
                type="NUMBER", description="SO volume multiplier (1.0-3.0)"
            ),
            "step_scale": types.Schema(type="NUMBER", description="SO step multiplier (1.0-2.0)"),
            "signal_threshold": types.Schema(
                type="INTEGER", description="Entry signal threshold (40-70)"
            ),
            "atr_multiplier": types.Schema(type="NUMBER", description="ATR grid spacing (0.3-1.5)"),
            "allow_long": types.Schema(type="BOOLEAN", description="Allow long positions"),
            "allow_short": types.Schema(type="BOOLEAN", description="Allow short positions"),
            "trend_filter_enabled": types.Schema(type="BOOLEAN", description="Enable trend filter"),
            "compounding": types.Schema(type="BOOLEAN", description="Enable compounding"),
            "label": types.Schema(
                type="STRING", description="Short label for this test (e.g. 'baseline', 'high_tp')"
            ),
        },
        required=["symbol", "initial_capital", "label"],
    ),
)

GET_STRATEGY_INFO_DECLARATION = types.FunctionDeclaration(
    name="get_strategy_info",
    description="Get default strategy configuration with parameter descriptions and min order size requirements per symbol.",
    parameters=types.Schema(type="OBJECT", properties={}),
)

COMPARE_RESULTS_DECLARATION = types.FunctionDeclaration(
    name="compare_results",
    description="Compare all backtest results collected so far, ranked by Sharpe ratio. Use after running multiple tests.",
    parameters=types.Schema(type="OBJECT", properties={}),
)


# ─── Tool Execution ─────────────────────────────────────────────────────────────

DEFAULT_CONFIG = {
    "symbol": "BTCUSDT",
    "period_days": 180,
    "initial_capital": 1000,
    "leverage": 10,
    "sizing_mode": "pct_capital",
    "base_order_pct": 1.0,
    "base_order_usd": 1.0,
    "compounding_enabled": False,
    "compounding_pct": 100,
    "max_safety_orders": 7,
    "take_profit_pct": 1.0,
    "tp_mode": "pct",
    "tp_fixed_amount": 0.0,
    "volume_scale": 1.5,
    "step_scale": 1.35,
    "rsi_long_threshold": 40,
    "rsi_short_threshold": 60,
    "signal_threshold": 55,
    "allow_long": True,
    "allow_short": True,
    "atr_multiplier": 0.6,
    "step_min_pct": 0.004,
    "step_max_pct": 0.025,
    "max_basket_age_hours": 72,
    "trend_filter_enabled": False,
    "trend_timeframes": ["1d", "4h"],
    "trend_mode": "majority",
    "trend_ema_fast": 9,
    "trend_ema_slow": 21,
    "risk_controller_enabled": False,
    "rc_max_so_trigger": 5,
    "rc_margin_usage_pct": 80.0,
    "rc_max_basket_loss_pct": 10.0,
    "rc_max_basket_loss_usd": 0.0,
    "rc_loss_mode": "pct_wallet",
}

# Minimum order quantities per symbol (from Binance exchange info)
MIN_QTY = {"BTCUSDT": 0.001, "ETHUSDT": 0.001, "SOLUSDT": 1.0}
APPROX_PRICES = {"BTCUSDT": 95000, "ETHUSDT": 1800, "SOLUSDT": 150}


async def execute_run_backtest(args: dict[str, Any]) -> dict[str, Any]:
    """Execute a backtest with the given parameters. Returns summary only (no chart data)."""
    config = DEFAULT_CONFIG.copy()

    # Override with provided args
    param_mapping = {
        "symbol": "symbol",
        "initial_capital": "initial_capital",
        "leverage": "leverage",
        "base_order_pct": "base_order_pct",
        "max_safety_orders": "max_safety_orders",
        "take_profit_pct": "take_profit_pct",
        "volume_scale": "volume_scale",
        "step_scale": "step_scale",
        "signal_threshold": "signal_threshold",
        "atr_multiplier": "atr_multiplier",
        "step_min_pct": "step_min_pct",
        "step_max_pct": "step_max_pct",
        "allow_long": "allow_long",
        "allow_short": "allow_short",
        "trend_filter_enabled": "trend_filter_enabled",
    }

    for arg_key, config_key in param_mapping.items():
        if arg_key in args:
            config[config_key] = args[arg_key]

    # Handle compounding
    if args.get("compounding"):
        config["compounding_enabled"] = True
        config["compounding_pct"] = 100

    config["period_days"] = 180
    config["sizing_mode"] = "pct_capital"  # Always use pct mode for AI tuner

    label = args.get("label", "test")

    # Pre-flight validation — catch min order errors before wasting time
    symbol = config["symbol"]
    capital = config["initial_capital"]
    bo_pct = config["base_order_pct"]
    lev = config["leverage"]
    approx_price = APPROX_PRICES.get(symbol, 50000)
    min_q = MIN_QTY.get(symbol, 0.001)

    margin = capital * (bo_pct / 100.0)
    notional = margin * lev
    est_qty = notional / approx_price

    if est_qty < min_q * 0.8:  # 80% buffer for price fluctuations
        min_capital = (min_q * approx_price) / (lev * (bo_pct / 100.0))
        return {
            "error": f"Base order too small. With ${capital} capital, {bo_pct}% BO, {lev}x leverage: "
            f"qty={est_qty:.6f} < min {min_q}. "
            f"Either increase base_order_pct to {max(bo_pct, round((min_q * approx_price * 1.2) / (capital * lev) * 100, 1))}% "
            f"or use capital >= ${min_capital:.0f}.",
            "label": label,
            "suggestion": {
                "min_base_order_pct": round(
                    (min_q * approx_price * 1.2) / (capital * lev) * 100, 1
                ),
                "min_capital_at_current_pct": round(min_capital),
            },
        }

    logger.info(f"AI Tuner running backtest: {label}", symbol=symbol, capital=capital)

    try:
        engine = BacktestEngine(config)
        result = await engine.run()
        summary = result.get("summary", {})

        return {
            "label": label,
            "symbol": config["symbol"],
            "capital": config["initial_capital"],
            "leverage": config["leverage"],
            "total_trades": summary.get("total_trades", 0),
            "winning_trades": summary.get("winning_trades", 0),
            "losing_trades": summary.get("losing_trades", 0),
            "win_rate": summary.get("win_rate", 0.0),
            "total_pnl": summary.get("total_pnl", 0.0),
            "total_pnl_pct": summary.get("total_pnl_pct", 0.0),
            "final_capital": summary.get("final_capital", 0.0),
            "max_drawdown_pct": summary.get("max_drawdown_pct", 0.0),
            "sharpe_ratio": summary.get("sharpe_ratio", 0.0),
            "profit_factor": summary.get("profit_factor", 0.0),
            "avg_trade_pnl": summary.get("avg_trade_pnl", 0.0),
            "avg_sos_filled": summary.get("avg_sos_filled", 0.0),
            "total_fees_paid": summary.get("total_fees_paid", 0.0),
            "liquidated": summary.get("liquidated", False),
            "trend_filter_enabled": summary.get("trend_filter_enabled", False),
            "trend_blocked_count": summary.get("trend_blocked_count", 0),
            "config_used": {
                "base_order_pct": config["base_order_pct"],
                "max_safety_orders": config["max_safety_orders"],
                "take_profit_pct": config["take_profit_pct"],
                "volume_scale": config["volume_scale"],
                "step_scale": config["step_scale"],
                "signal_threshold": config["signal_threshold"],
                "atr_multiplier": config["atr_multiplier"],
                "step_min_pct": config["step_min_pct"],
                "step_max_pct": config["step_max_pct"],
                "leverage": config["leverage"],
                "allow_long": config["allow_long"],
                "allow_short": config["allow_short"],
                "trend_filter_enabled": config["trend_filter_enabled"],
                "compounding": config.get("compounding_enabled", False),
            },
        }
    except Exception as e:
        logger.error(f"AI Tuner backtest failed: {e}")
        return {"error": str(e), "label": label}


def execute_get_strategy_info() -> dict[str, Any]:
    """Return default strategy config and parameter documentation."""
    return {
        "default_config": {
            "base_order_pct": 1.0,
            "max_safety_orders": 7,
            "take_profit_pct": 1.0,
            "volume_scale": 1.5,
            "step_scale": 1.35,
            "signal_threshold": 55,
            "atr_multiplier": 0.6,
            "leverage": 10,
            "allow_long": True,
            "allow_short": True,
            "trend_filter_enabled": False,
            "compounding": False,
        },
        "min_order_requirements": {
            "BTCUSDT": {"min_qty": 0.001, "approx_price": 95000, "min_capital_1pct_10x": 950},
            "ETHUSDT": {"min_qty": 0.001, "approx_price": 1800, "min_capital_1pct_10x": 18},
            "SOLUSDT": {"min_qty": 1.0, "approx_price": 150, "min_capital_1pct_10x": 150},
        },
        "parameter_ranges": {
            "base_order_pct": {"min": 1, "max": 10, "default": 1.0},
            "max_safety_orders": {"min": 1, "max": 15, "default": 7},
            "take_profit_pct": {"min": 0.3, "max": 5.0, "default": 1.0},
            "volume_scale": {"min": 1.0, "max": 3.0, "default": 1.5},
            "step_scale": {"min": 1.0, "max": 2.0, "default": 1.35},
            "signal_threshold": {"min": 40, "max": 70, "default": 55},
            "atr_multiplier": {"min": 0.3, "max": 1.5, "default": 0.6},
            "leverage": {"min": 1, "max": 20, "default": 10},
        },
        "formula": "qty = capital × (base_order_pct/100) × leverage / price. Must be >= min_qty.",
    }


def execute_compare_results(all_results: list[dict]) -> dict[str, Any]:
    """Compare all results collected so far, ranked by Sharpe ratio."""
    if not all_results:
        return {"message": "No results to compare yet. Run some backtests first."}

    ranked = sorted(all_results, key=lambda r: r.get("sharpe_ratio", 0), reverse=True)

    comparison = []
    for i, r in enumerate(ranked):
        comparison.append(
            {
                "rank": i + 1,
                "label": r.get("label", "?"),
                "symbol": r.get("symbol", "?"),
                "capital": r.get("capital", 0),
                "pnl_pct": r.get("total_pnl_pct", 0),
                "sharpe": r.get("sharpe_ratio", 0),
                "max_dd": r.get("max_drawdown_pct", 0),
                "win_rate": r.get("win_rate", 0),
                "profit_factor": r.get("profit_factor", 0),
                "trades": r.get("total_trades", 0),
                "liquidated": r.get("liquidated", False),
            }
        )

    best = ranked[0] if ranked else None
    return {
        "total_tests": len(ranked),
        "ranking": comparison,
        "best_config": best.get("config_used") if best else None,
        "best_label": best.get("label") if best else None,
        "best_sharpe": best.get("sharpe_ratio", 0) if best else 0,
    }


# ─── Agent Loop ──────────────────────────────────────────────────────────────────


async def run_agent(
    goal: str,
    symbol: str = "BTCUSDT",
) -> AsyncGenerator[dict[str, Any], None]:
    """
    Run the Gemini AI agent with function calling.
    Yields SSE events as dicts: {event: str, data: dict}
    """
    if not settings.GEMINI_API_KEY:
        yield {"event": "error", "data": {"message": "GEMINI_API_KEY not configured"}}
        return

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    tools = [
        types.Tool(
            function_declarations=[
                RUN_BACKTEST_DECLARATION,
                GET_STRATEGY_INFO_DECLARATION,
                COMPARE_RESULTS_DECLARATION,
            ]
        )
    ]

    config = types.GenerateContentConfig(
        tools=tools,
        system_instruction=SYSTEM_PROMPT,
        temperature=0.7,
        max_output_tokens=8192,
    )

    # Initial user message with context
    user_prompt = (
        f"Optimize the Twin Grid strategy for **{symbol}**.\n\n"
        f"**Goal:** {goal}\n\n"
        f"Start by calling get_strategy_info to understand the parameter ranges and minimum order sizes. "
        f"Then validate your base order calculation before running any backtest. "
        f"Run a baseline first, then iterate to find optimal settings."
    )

    contents: list[types.Content] = [
        types.Content(role="user", parts=[types.Part(text=user_prompt)])
    ]

    all_results: list[dict] = []
    backtest_count = 0
    max_backtests = 12
    max_turns = 30

    yield {"event": "session_start", "data": {"symbol": symbol, "goal": goal}}

    # Auto-detect working model
    model_candidates = [settings.GEMINI_MODEL, "gemini-2.0-flash", "gemini-2.0-flash-lite"]
    working_model = None

    for model_name in model_candidates:
        try:
            client.models.generate_content(
                model=model_name,
                contents="respond with OK",
                config=types.GenerateContentConfig(max_output_tokens=10),
            )
            working_model = model_name
            logger.info(f"AI Tuner using model: {model_name}")
            break
        except Exception as e:
            logger.warning(f"Model {model_name} unavailable: {e}")
            continue

    if not working_model:
        yield {
            "event": "error",
            "data": {
                "message": "No Gemini model available. Please check your API key at https://aistudio.google.com/apikey"
            },
        }
        return

    for turn in range(max_turns):
        try:
            response = client.models.generate_content(
                model=working_model,
                contents=contents,
                config=config,
            )
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            yield {"event": "error", "data": {"message": f"Gemini API error: {str(e)}"}}
            return

        if not response.candidates:
            yield {"event": "error", "data": {"message": "No response from Gemini"}}
            return

        response_content = response.candidates[0].content
        contents.append(response_content)

        has_function_call = False
        function_response_parts = []

        for part in response_content.parts:
            if part.text:
                yield {"event": "thinking", "data": {"content": part.text, "turn": turn + 1}}

            if part.function_call:
                has_function_call = True
                fc = part.function_call
                func_name = fc.name
                func_args = dict(fc.args) if fc.args else {}

                yield {
                    "event": "function_call",
                    "data": {
                        "name": func_name,
                        "args": func_args,
                        "turn": turn + 1,
                    },
                }

                result = None
                if func_name == "run_backtest":
                    if backtest_count >= max_backtests:
                        result = {
                            "error": f"Maximum {max_backtests} backtests reached. Present your final recommendation now."
                        }
                    else:
                        if "symbol" not in func_args:
                            func_args["symbol"] = symbol
                        result = await execute_run_backtest(func_args)
                        if "error" not in result:
                            all_results.append(result)
                            backtest_count += 1
                elif func_name == "get_strategy_info":
                    result = execute_get_strategy_info()
                elif func_name == "compare_results":
                    result = execute_compare_results(all_results)
                else:
                    result = {"error": f"Unknown function: {func_name}"}

                yield {
                    "event": "function_result",
                    "data": {
                        "name": func_name,
                        "result": result,
                        "backtest_count": backtest_count,
                    },
                }

                function_response_parts.append(
                    types.Part.from_function_response(
                        name=func_name,
                        response={"result": result},
                    )
                )

        if has_function_call and function_response_parts:
            contents.append(types.Content(role="user", parts=function_response_parts))
            continue

        # No function calls — agent is done
        break

    # Final comparison
    final_comparison = execute_compare_results(all_results)

    yield {
        "event": "complete",
        "data": {
            "backtests_run": backtest_count,
            "results": all_results,
            "comparison": final_comparison,
            "best_config": final_comparison.get("best_config"),
            "best_sharpe": final_comparison.get("best_sharpe", 0),
            "best_pnl_pct": all_results[0].get("total_pnl_pct", 0) if all_results else 0,
        },
    }
