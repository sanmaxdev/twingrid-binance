"""
Central Symbol Registry
========================
Single source of truth for all supported trading pairs.
Every backend module imports from here — no more scattered hardcoded lists.
"""

from typing import Dict, Any, List, Set

# ── Supported symbols (order matters for UI display) ──
SUPPORTED_SYMBOLS: List[str] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"]
SUPPORTED_SYMBOLS_SET: Set[str] = set(SUPPORTED_SYMBOLS)

# ── Maximum concurrent active symbols per account ──
MAX_ACTIVE_SYMBOLS: int = 3

# ── Per-symbol metadata (Binance exchange info) ──
SYMBOL_META: Dict[str, Dict[str, Any]] = {
    "BTCUSDT": {
        "min_qty": 0.001,
        "min_notional": 5.0,
        "price_approx": 105000,
        "qty_precision_step": 0.001,
        "tick_precision": 0.10,
        "icon": "₿",
        "label": "BTC / USDT",
    },
    "ETHUSDT": {
        "min_qty": 0.001,
        "min_notional": 5.0,
        "price_approx": 2500,
        "qty_precision_step": 0.001,
        "tick_precision": 0.01,
        "icon": "Ξ",
        "label": "ETH / USDT",
    },
    "SOLUSDT": {
        "min_qty": 1.0,
        "min_notional": 5.0,
        "price_approx": 170,
        "qty_precision_step": 1.0,
        "tick_precision": 0.0010,
        "icon": "◎",
        "label": "SOL / USDT",
    },
    "XRPUSDT": {
        "min_qty": 0.1,
        "min_notional": 5.0,
        "price_approx": 2.5,
        "qty_precision_step": 0.1,
        "tick_precision": 0.0001,
        "icon": "✕",
        "label": "XRP / USDT",
    },
}


def get_symbol_meta(symbol: str) -> Dict[str, Any]:
    """Get metadata for a symbol, falling back to conservative defaults."""
    return SYMBOL_META.get(symbol, {
        "min_qty": 0.1,
        "min_notional": 5.0,
        "price_approx": 1.0,
        "qty_precision_step": 0.1,
        "tick_precision": 0.0001,
        "icon": "?",
        "label": symbol,
    })


def normalize_active_symbols(config: dict) -> list:
    """
    Extract active_symbols from a config dict with backward compatibility.
    Handles both old `active_symbol` (string) and new `active_symbols` (list).
    """
    # New format
    if "active_symbols" in config and isinstance(config["active_symbols"], list):
        symbols = config["active_symbols"]
        # Validate & cap
        return [s for s in symbols if s in SUPPORTED_SYMBOLS_SET][:MAX_ACTIVE_SYMBOLS]

    # Old format — single string
    old = config.get("active_symbol", "BTCUSDT")
    if old in SUPPORTED_SYMBOLS_SET:
        return [old]
    return ["BTCUSDT"]
