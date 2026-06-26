import os

from celery import Celery
from celery.schedules import crontab

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")

celery_app = Celery(
    "twingrid_worker",
    broker=redis_url,
    backend=redis_url,
    include=[
        "app.tasks.trading_tasks",
        "app.tasks.equity_task",
        "app.tasks.market_data_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    beat_schedule={
        "process-all-accounts-every-minute": {
            "task": "app.tasks.trading_tasks.schedule_grid_ticks",
            "schedule": 60.0,
        },
        "monitor-active-baskets-every-30s": {
            "task": "app.tasks.trading_tasks.schedule_basket_monitoring",
            "schedule": 30.0,
        },
        "equity-snapshot-every-5min": {
            "task": "equity_snapshot",
            "schedule": 300.0,  # Every 5 minutes (was 60s — too frequent for DB)
        },
        "market-data-auto-update-daily": {
            "task": "market_data_auto_update",
            "schedule": crontab(hour=0, minute=30),  # Daily at 00:30 UTC
        },
    },
)
