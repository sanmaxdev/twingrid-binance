import logging
from collections import deque

import structlog


class MemoryLogHandler(logging.Handler):
    """Ring buffer log handler that keeps the last N log lines in memory."""

    def __init__(self, capacity: int = 2000):
        super().__init__()
        self.buffer: deque[str] = deque(maxlen=capacity)

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            self.buffer.append(msg)
        except Exception:
            self.handleError(record)

    def get_logs(self, n: int = 100) -> list[str]:
        """Return the last N log lines."""
        lines = list(self.buffer)
        return lines[-n:] if n < len(lines) else lines


# Global singleton — importable from anywhere
log_buffer = MemoryLogHandler(capacity=2000)


def scrub(value: object) -> str:
    """Strip CR/LF from untrusted values before logging to prevent log forging."""
    return str(value).replace("\r", " ").replace("\n", " ")


def setup_logging():
    # Setup standard python logging to route to structlog
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    # Attach the memory buffer handler to the root logger
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    log_buffer.setFormatter(formatter)
    log_buffer.setLevel(logging.INFO)
    logging.getLogger().addHandler(log_buffer)

    structlog.configure(
        processors=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
