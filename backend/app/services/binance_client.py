import httpx
import hashlib
import hmac
import time
import asyncio
import logging
from typing import Any
from urllib.parse import urlencode

from app.core.config import settings

logger = logging.getLogger(__name__)

# Per-API-key weight tracking (shared across calls within the same worker process)
_api_weight_cache: dict[str, int] = {}

class BinanceClient:
    def __init__(self, api_key: str, api_secret: str, is_testnet: bool = False):
        self.api_key = api_key
        self.api_secret = api_secret
        self.is_testnet = is_testnet
        if is_testnet:
            self.base_url = settings.BINANCE_TESTNET_BASE_URL
            self.fallback_url = settings.BINANCE_DEMO_BASE_URL
        else:
            self.base_url = settings.BINANCE_LIVE_BASE_URL
            self.fallback_url = None

    @property
    def ws_base_url(self) -> str:
        """WebSocket base URL for User Data Streams."""
        if self.is_testnet:
            return settings.BINANCE_WS_TESTNET_URL
        return settings.BINANCE_WS_LIVE_URL

    async def create_listen_key(self) -> str:
        """POST /fapi/v1/listenKey — Start a User Data Stream (returns listenKey)."""
        endpoint = "/fapi/v1/listenKey"
        headers = {"X-MBX-APIKEY": self.api_key}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(f"{self.base_url}{endpoint}", headers=headers)
            if response.status_code != 200:
                raise ValueError(f"Failed to create listenKey: {response.text}")
            return response.json()["listenKey"]

    async def keepalive_listen_key(self, listen_key: str) -> None:
        """PUT /fapi/v1/listenKey — Extend listenKey validity for 60 minutes."""
        endpoint = "/fapi/v1/listenKey"
        headers = {"X-MBX-APIKEY": self.api_key}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.put(
                f"{self.base_url}{endpoint}",
                headers=headers,
                params={"listenKey": listen_key},
            )
            if response.status_code != 200:
                raise ValueError(f"Failed to keepalive listenKey: {response.text}")

    async def close_listen_key(self, listen_key: str) -> None:
        """DELETE /fapi/v1/listenKey — Close a User Data Stream."""
        endpoint = "/fapi/v1/listenKey"
        headers = {"X-MBX-APIKEY": self.api_key}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(
                f"{self.base_url}{endpoint}",
                headers=headers,
                params={"listenKey": listen_key},
            )
            # Ignore errors on close — the key may have already expired

    def _generate_signature(self, query_string: str) -> str:
        return hmac.new(
            self.api_secret.encode('utf-8'),
            query_string.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()

    async def verify_credentials(self) -> dict:
        """
        Calls /fapi/v2/account to verify the API key and secret.
        Tries primary testnet URL first, falls back to demo URL on 404.
        """
        endpoints_to_try = ["/fapi/v2/account", "/fapi/v1/account"]
        urls_to_try = [self.base_url]
        if self.fallback_url:
            urls_to_try.append(self.fallback_url)

        last_error = None
        for base_url in urls_to_try:
            for endpoint in endpoints_to_try:
                try:
                    timestamp = int(time.time() * 1000)
                    params = {"timestamp": timestamp}
                    query_string = urlencode(params)
                    signature = self._generate_signature(query_string)

                    headers = {"X-MBX-APIKEY": self.api_key}
                    url = f"{base_url}{endpoint}?{query_string}&signature={signature}"

                    logger.info(f"Trying Binance API: {base_url}{endpoint}")

                    async with httpx.AsyncClient(timeout=15.0) as client:
                        response = await client.get(url, headers=headers)

                        if response.status_code == 404:
                            logger.warning(f"Got 404 from {base_url}{endpoint}, trying next...")
                            last_error = f"Endpoint not found at {base_url}"
                            continue

                        if response.status_code != 200:
                            error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {"msg": response.text}
                            error_msg = error_data.get("msg", response.text)
                            raise ValueError(f"Binance API error ({response.status_code}): {error_msg}")

                        data = response.json()

                        if not data.get("canTrade", False):
                            raise ValueError("API key does not have trading permission enabled.")

                        # NOTE: /fapi/v2/account canWithdraw refers to futures wallet transfer capability,
                        # NOT the API key's "Enable Withdrawals" permission. Checking it here causes
                        # false positives for mainnet keys. The proper check would be /sapi/v1/account/apiRestrictions
                        # but since we only do futures trading, this is unnecessary.

                        # If we got here with testnet fallback, update the base_url for future calls
                        if base_url != self.base_url:
                            logger.info(f"Testnet fallback succeeded, using {base_url}")
                            self.base_url = base_url

                        return data
                except ValueError:
                    raise
                except httpx.ConnectError as e:
                    logger.warning(f"Connection failed to {base_url}: {e}")
                    last_error = f"Cannot connect to {base_url}"
                    continue
                except Exception as e:
                    logger.warning(f"Error trying {base_url}{endpoint}: {e}")
                    last_error = str(e)
                    continue

        raise ValueError(f"Failed to verify credentials with Binance API. {last_error or 'All endpoints returned errors.'}")

    async def get_account_info(self) -> dict:
        return await self._signed_get("/fapi/v2/account")

    async def get_klines(self, symbol: str, interval: str, limit: int = 100) -> list:
        endpoint = "/fapi/v1/klines"
        params = {"symbol": symbol, "interval": interval, "limit": limit}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{self.base_url}{endpoint}", params=params)
            if response.status_code != 200:
                raise ValueError(f"Failed to get klines: {response.text}")
            return response.json()

    async def get_ticker_price(self, symbol: str) -> float:
        endpoint = "/fapi/v1/ticker/price"
        params = {"symbol": symbol}
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{self.base_url}{endpoint}", params=params)
            if response.status_code != 200:
                raise ValueError(f"Failed to get price: {response.text}")
            return float(response.json()["price"])

    async def set_leverage(self, symbol: str, leverage: int) -> dict:
        return await self._signed_post("/fapi/v1/leverage", {"symbol": symbol, "leverage": leverage})

    async def set_margin_type(self, symbol: str, margin_type: str) -> dict:
        # Binance API expects CROSSED, not CROSS
        mt = margin_type.upper()
        if mt == "CROSS":
            mt = "CROSSED"
        try:
            return await self._signed_post("/fapi/v1/marginType", {"symbol": symbol, "marginType": mt})
        except ValueError as e:
            if "No need to change margin type" in str(e):
                return {"msg": "Already set"}
            raise

    async def place_market_order(self, symbol: str, side: str, quantity: float, reduce_only: bool = False) -> dict:
        params = {"symbol": symbol, "side": side, "type": "MARKET", "quantity": quantity}
        if reduce_only:
            params["reduceOnly"] = "true"
        return await self._signed_post("/fapi/v1/order", params)

    async def place_limit_order(self, symbol: str, side: str, quantity: float, price: float, reduce_only: bool = False, client_order_id: str = None) -> dict:
        params = {"symbol": symbol, "side": side, "type": "LIMIT", "quantity": quantity, "price": price, "timeInForce": "GTC"}
        if reduce_only:
            params["reduceOnly"] = "true"
        if client_order_id:
            params["newClientOrderId"] = client_order_id
        return await self._signed_post("/fapi/v1/order", params)

    async def cancel_order(self, symbol: str, order_id: int = None, client_order_id: str = None) -> dict:
        params = {"symbol": symbol}
        if order_id:
            params["orderId"] = order_id
        if client_order_id:
            params["origClientOrderId"] = client_order_id
        return await self._signed_delete("/fapi/v1/order", params)

    async def cancel_all_orders(self, symbol: str) -> dict:
        return await self._signed_delete("/fapi/v1/allOpenOrders", {"symbol": symbol})

    async def get_open_orders(self, symbol: str = None) -> list:
        params = {}
        if symbol:
            params["symbol"] = symbol
        return await self._signed_get("/fapi/v1/openOrders", params)

    async def get_order(self, symbol: str, order_id: int) -> dict:
        """Query a specific order to get fill details (executedQty, avgPrice, cumQuote, status)."""
        return await self._signed_get("/fapi/v1/order", {
            "symbol": symbol, "orderId": order_id
        })

    async def get_position_info(self, symbol: str = None) -> list:
        params = {}
        if symbol:
            params["symbol"] = symbol
        return await self._signed_get("/fapi/v2/positionRisk", params)

    async def get_balances(self) -> list:
        return await self._signed_get("/fapi/v2/balance")

    async def get_trade_history(self, symbol: str = None, limit: int = 100) -> list:
        params = {"limit": limit}
        if symbol:
            params["symbol"] = symbol
        return await self._signed_get("/fapi/v1/userTrades", params)

    async def get_all_orders(self, symbol: str, limit: int = 50) -> list:
        """Get all orders (open + closed) for forensic analysis."""
        return await self._signed_get("/fapi/v1/allOrders", {
            "symbol": symbol, "limit": limit
        })

    async def get_income_history(self, income_type: str = None, symbol: str = None, start_time: int = None, end_time: int = None, limit: int = 1000) -> list:
        params = {"limit": limit}
        if income_type:
            params["incomeType"] = income_type
        if symbol:
            params["symbol"] = symbol
        if start_time:
            params["startTime"] = start_time
        if end_time:
            params["endTime"] = end_time
        return await self._signed_get("/fapi/v1/income", params)

    async def get_exchange_info(self, symbol: str = None) -> dict:
        """Get exchange info for a symbol (filters, precision rules)."""
        endpoint = "/fapi/v1/exchangeInfo"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(f"{self.base_url}{endpoint}")
            if response.status_code != 200:
                raise ValueError(f"Failed to get exchange info: {response.text}")
            data = response.json()
            if symbol:
                for s in data.get("symbols", []):
                    if s["symbol"] == symbol:
                        return s
                raise ValueError(f"Symbol {symbol} not found in exchange info")
            return data

    async def close_all_positions(self, symbol: str) -> list:
        """Close all open positions for a symbol by placing market orders."""
        positions = await self.get_position_info(symbol)
        results = []
        for pos in positions:
            amt = float(pos.get("positionAmt", 0))
            if amt == 0:
                continue
            side = "SELL" if amt > 0 else "BUY"
            result = await self.place_market_order(symbol, side, abs(amt), reduce_only=True)
            results.append(result)
        return results

    # ---- Internal signed request helpers ----

    def _track_api_weight(self, response: httpx.Response):
        """Parse X-MBX-USED-WEIGHT header and track API consumption."""
        weight_str = response.headers.get("X-MBX-USED-WEIGHT-1M", "") or response.headers.get("X-MBX-USED-WEIGHT", "")
        if weight_str:
            try:
                weight = int(weight_str)
                _api_weight_cache[self.api_key[:8]] = weight
                if weight > 1800:
                    logger.warning(f"⚠️ API weight CRITICAL: {weight}/2400 — throttling 5s")
                elif weight > 1000:
                    logger.info(f"API weight elevated: {weight}/2400")
            except (ValueError, TypeError):
                pass

    async def _check_weight_throttle(self):
        """If API weight is critical, sleep before making another request."""
        weight = _api_weight_cache.get(self.api_key[:8], 0)
        if weight > 1800:
            logger.warning(f"Throttling: API weight {weight}/2400, sleeping 5s")
            await asyncio.sleep(5)

    async def _signed_get(self, endpoint: str, extra_params: dict = None) -> Any:
        await self._check_weight_throttle()
        timestamp = int(time.time() * 1000)
        params = {"timestamp": timestamp}
        if extra_params:
            params.update(extra_params)
        query_string = urlencode(params)
        signature = self._generate_signature(query_string)
        headers = {"X-MBX-APIKEY": self.api_key}
        url = f"{self.base_url}{endpoint}?{query_string}&signature={signature}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            self._track_api_weight(response)
            if response.status_code != 200:
                raise ValueError(f"Binance API error ({endpoint}): {response.text}")
            return response.json()

    async def _signed_post(self, endpoint: str, extra_params: dict = None) -> Any:
        await self._check_weight_throttle()
        timestamp = int(time.time() * 1000)
        params = {"timestamp": timestamp}
        if extra_params:
            params.update(extra_params)
        query_string = urlencode(params)
        signature = self._generate_signature(query_string)
        headers = {"X-MBX-APIKEY": self.api_key}
        url = f"{self.base_url}{endpoint}?{query_string}&signature={signature}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers)
            self._track_api_weight(response)
            if response.status_code != 200:
                raise ValueError(f"Binance API error ({endpoint}): {response.text}")
            return response.json()

    async def _signed_delete(self, endpoint: str, extra_params: dict = None) -> Any:
        await self._check_weight_throttle()
        timestamp = int(time.time() * 1000)
        params = {"timestamp": timestamp}
        if extra_params:
            params.update(extra_params)
        query_string = urlencode(params)
        signature = self._generate_signature(query_string)
        headers = {"X-MBX-APIKEY": self.api_key}
        url = f"{self.base_url}{endpoint}?{query_string}&signature={signature}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.delete(url, headers=headers)
            self._track_api_weight(response)
            if response.status_code != 200:
                raise ValueError(f"Binance API error ({endpoint}): {response.text}")
            return response.json()
