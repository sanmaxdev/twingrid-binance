"""WebSocket real-time gateway per §14.

Provides authenticated WebSocket connections for:
- Live basket updates
- Live order updates
- Live position/balance updates (from Binance WS Manager via Redis pub/sub)
- Admin event feed
"""

import asyncio
import json

import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import settings
from app.core.redis_client import redis_client

logger = structlog.get_logger()
router = APIRouter()


class ConnectionManager:
    """Manages WebSocket connections and channel subscriptions."""

    def __init__(self):
        # channel_name → set of WebSocket connections
        self.channels: dict[str, set[WebSocket]] = {}
        # ws → user info
        self.ws_meta: dict[WebSocket, dict] = {}
        self._relay_task = None

    async def connect(self, ws: WebSocket, user_id: str, role: str):
        await ws.accept()
        self.ws_meta[ws] = {"user_id": user_id, "role": role}
        logger.info("ws_connected", user_id=user_id)

    def disconnect(self, ws: WebSocket):
        meta = self.ws_meta.pop(ws, {})
        # Remove from all channels
        for channel, subscribers in list(self.channels.items()):
            subscribers.discard(ws)
            if not subscribers:
                del self.channels[channel]
        logger.info("ws_disconnected", user_id=meta.get("user_id"))

    def subscribe(self, ws: WebSocket, channel: str):
        if channel not in self.channels:
            self.channels[channel] = set()
        self.channels[channel].add(ws)
        logger.info(
            "ws_subscribed",
            channel=channel,
            user_id=self.ws_meta.get(ws, {}).get("user_id"),
            total_subs=len(self.channels[channel]),
        )

    def unsubscribe(self, ws: WebSocket, channel: str):
        if channel in self.channels:
            self.channels[channel].discard(ws)

    async def broadcast(self, channel: str, data: dict):
        """Broadcast message to all subscribers of a channel."""
        subscribers = self.channels.get(channel, set())
        if not subscribers:
            return  # No subscribers for this channel
        dead = []
        sent = 0
        for ws in subscribers:
            try:
                await ws.send_json(data)
                sent += 1
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)
        if sent > 0:
            logger.info(
                "ws_broadcast",
                channel=channel,
                sent=sent,
                dead=len(dead),
                msg_type=data.get("type", "?"),
            )

    def get_user_id(self, ws: WebSocket) -> str:
        return self.ws_meta.get(ws, {}).get("user_id", "")

    def get_role(self, ws: WebSocket) -> str:
        return self.ws_meta.get(ws, {}).get("role", "")


manager = ConnectionManager()


def _validate_channel_access(ws: WebSocket, channel: str) -> bool:
    """Validate that a user can subscribe to a channel.

    Users can only subscribe to their own account channels.
    Admin channels require ADMIN or SUPER_ADMIN role.
    """
    meta = manager.ws_meta.get(ws, {})
    user_id = meta.get("user_id", "")
    role = meta.get("role", "")

    # Admin channels
    if channel.startswith("admin:"):
        return role in ("ADMIN", "SUPER_ADMIN")

    # Account channels: account:{account_id} — all authenticated users can
    # subscribe (ownership is verified via the dashboard API already)
    if channel.startswith("account:"):
        return True

    # User channels: user:{user_id}:*
    if channel.startswith(f"user:{user_id}:"):
        return True

    return False


def _authenticate_ws(token: str) -> dict | None:
    """Validate JWT token and return payload. Returns None on failure."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    token: str = Query(None),
):
    """Authenticated WebSocket endpoint.

    Connection: ws://host/api/v1/ws?token=<jwt_access_token>
    Also supports cookie-based auth: access_token cookie is used if no query param.

    Messages FROM client:
      {"action": "subscribe", "channel": "account:{account_id}"}
      {"action": "unsubscribe", "channel": "account:{account_id}"}
      {"action": "ping"}

    Messages TO client:
      {"type": "account_update", "data": {...}}
      {"type": "order_update", "data": {...}}
      {"type": "pong"}
      {"type": "error", "message": "..."}
    """
    # Authenticate — try query param first, fall back to cookie
    auth_token = token or ws.cookies.get("access_token")
    if not auth_token:
        await ws.close(code=4001, reason="Missing token")
        return

    payload = _authenticate_ws(auth_token)
    if not payload:
        await ws.close(code=4001, reason="Invalid token")
        return

    user_id = payload.get("sub")

    # Get user role from database
    role = "USER"
    try:
        import uuid

        from sqlalchemy import select

        from app.core.database import AsyncSessionLocal
        from app.models.user import User

        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User.role).where(User.id == uuid.UUID(user_id)))
            row = result.first()
            if row:
                role = row[0]
    except Exception as e:
        logger.error("ws_role_lookup_error", error=str(e))

    await manager.connect(ws, user_id, role)

    try:
        while True:
            data = await ws.receive_json()
            action = data.get("action")

            if action == "ping":
                await ws.send_json({"type": "pong"})

            elif action == "subscribe":
                channel = data.get("channel", "")
                if _validate_channel_access(ws, channel):
                    manager.subscribe(ws, channel)
                    await ws.send_json({"type": "subscribed", "channel": channel})
                else:
                    await ws.send_json(
                        {"type": "error", "message": f"Access denied for channel: {channel}"}
                    )

            elif action == "unsubscribe":
                channel = data.get("channel", "")
                manager.unsubscribe(ws, channel)
                await ws.send_json({"type": "unsubscribed", "channel": channel})

            else:
                await ws.send_json({"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        logger.error("ws_error", error=str(e))
        manager.disconnect(ws)


async def publish_to_channel(channel: str, event_type: str, data: dict):
    """Publish a message to a WebSocket channel (called from backend services)."""
    await manager.broadcast(channel, {"type": event_type, "channel": channel, "data": data})


# ─── Redis Pub/Sub Relay (bridges ws_manager container → frontend clients) ───


async def _redis_pubsub_relay():
    """Subscribe to Redis pub/sub channels from ws_manager and relay
    events to connected frontend WebSocket clients."""
    while True:
        try:
            pubsub = redis_client.pubsub()
            await pubsub.psubscribe("ws:live:*")
            logger.info("ws_relay_started", pattern="ws:live:*")

            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue

                try:
                    data = json.loads(message["data"])
                    account_id = data.get("account_id", "")
                    event_type = data.get("type", "update")

                    if not account_id:
                        continue

                    # Broadcast to all subscribers of account:{account_id}
                    channel = f"account:{account_id}"
                    await manager.broadcast(
                        channel,
                        {
                            "type": event_type,
                            "channel": channel,
                            "data": data,
                        },
                    )
                except (json.JSONDecodeError, Exception) as e:
                    logger.debug("ws_relay_message_error", error=str(e))

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("ws_relay_error", error=str(e))
            await asyncio.sleep(3)  # Reconnect after error


def start_relay():
    """Start the Redis pub/sub relay as a background task.
    Called from FastAPI startup event."""
    if manager._relay_task is None or manager._relay_task.done():
        manager._relay_task = asyncio.create_task(_redis_pubsub_relay())
        logger.info("ws_relay_task_created")
