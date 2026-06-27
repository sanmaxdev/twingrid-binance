import logging
import os
import platform
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_admin
from app.core.logging import scrub
from app.models.user import User

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/system/resources")
async def get_system_resources(
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    """Get host system resource usage: CPU, RAM, Disk, Network, Uptime."""
    import psutil

    # CPU
    cpu_percent = psutil.cpu_percent(interval=0.5)
    cpu_count_logical = psutil.cpu_count(logical=True)
    cpu_count_physical = psutil.cpu_count(logical=False)
    cpu_freq = psutil.cpu_freq()

    # Memory
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()

    # Disk
    disk = psutil.disk_usage("/")

    # Network (bytes sent/recv since boot)
    net = psutil.net_io_counters()

    # Uptime
    boot_time = datetime.fromtimestamp(psutil.boot_time(), tz=UTC)
    uptime_seconds = (datetime.now(UTC) - boot_time).total_seconds()

    # Load averages (Linux/Mac only)
    try:
        load_avg = os.getloadavg()
    except (AttributeError, OSError):
        load_avg = [0, 0, 0]

    # Top processes by memory
    top_processes = []
    try:
        for proc in sorted(
            psutil.process_iter(["pid", "name", "memory_percent", "cpu_percent"]),
            key=lambda p: p.info.get("memory_percent", 0) or 0,
            reverse=True,
        )[:8]:
            info = proc.info
            top_processes.append(
                {
                    "pid": info.get("pid"),
                    "name": info.get("name", "unknown"),
                    "memory_percent": round(info.get("memory_percent", 0) or 0, 1),
                    "cpu_percent": round(info.get("cpu_percent", 0) or 0, 1),
                }
            )
    except Exception:
        pass

    return {
        "cpu": {
            "usage_percent": cpu_percent,
            "cores_logical": cpu_count_logical,
            "cores_physical": cpu_count_physical,
            "frequency_mhz": round(cpu_freq.current, 0) if cpu_freq else None,
            "load_avg_1m": round(load_avg[0], 2),
            "load_avg_5m": round(load_avg[1], 2),
            "load_avg_15m": round(load_avg[2], 2),
        },
        "memory": {
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2),
            "usage_percent": mem.percent,
            "swap_total_gb": round(swap.total / (1024**3), 2),
            "swap_used_gb": round(swap.used / (1024**3), 2),
            "swap_percent": swap.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024**3), 2),
            "used_gb": round(disk.used / (1024**3), 2),
            "free_gb": round(disk.free / (1024**3), 2),
            "usage_percent": round(disk.percent, 1),
        },
        "network": {
            "bytes_sent_mb": round(net.bytes_sent / (1024**2), 1),
            "bytes_recv_mb": round(net.bytes_recv / (1024**2), 1),
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        },
        "system": {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}",
            "python_version": platform.python_version(),
            "architecture": platform.machine(),
            "boot_time": boot_time.isoformat(),
            "uptime_hours": round(uptime_seconds / 3600, 1),
        },
        "top_processes": top_processes,
    }


@router.get("/system/logs")
async def get_system_logs(
    lines: int = Query(default=100, le=500, ge=10),
    level: str = Query(default="all"),
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    """Get recent application logs from in-memory ring buffer."""
    from app.core.logging import log_buffer

    all_logs = log_buffer.get_logs(lines)

    # Optional level filter
    if level != "all":
        level_upper = level.upper()
        all_logs = [line for line in all_logs if f"[{level_upper}]" in line]

    return {
        "service": "backend",
        "lines_requested": lines,
        "lines_returned": len(all_logs),
        "buffer_size": len(log_buffer.buffer),
        "buffer_capacity": log_buffer.buffer.maxlen,
        "logs": all_logs,
    }


@router.post("/system/docker-prune")
async def prune_docker_build_cache(
    current_user: User = Depends(require_admin),
) -> dict[str, Any]:
    """
    Prune Docker builder cache, dangling images, stopped containers, and unused networks.
    Uses the Docker Python SDK via the unix socket (works inside containers with socket mounted).
    """
    results = []
    total_freed_bytes = 0

    try:
        import docker  # type: ignore

        client = docker.DockerClient(base_url="unix://var/run/docker.sock")

        # 1. Prune stopped containers
        try:
            r = client.containers.prune()
            freed = r.get("SpaceReclaimed", 0) or 0
            total_freed_bytes += freed
            results.append({"step": "containers_prune", "success": True, "freed_bytes": freed})
        except Exception:
            results.append({"step": "containers_prune", "success": False, "output": "prune failed"})

        # 2. Prune dangling images
        try:
            r = client.images.prune(filters={"dangling": True})
            freed = r.get("SpaceReclaimed", 0) or 0
            total_freed_bytes += freed
            results.append({"step": "images_prune_dangling", "success": True, "freed_bytes": freed})
        except Exception:
            results.append(
                {"step": "images_prune_dangling", "success": False, "output": "prune failed"}
            )

        # 3. Prune all unused images (not just dangling)
        try:
            r = client.images.prune(filters={"dangling": False})
            freed = r.get("SpaceReclaimed", 0) or 0
            total_freed_bytes += freed
            results.append({"step": "images_prune_all", "success": True, "freed_bytes": freed})
        except Exception:
            results.append({"step": "images_prune_all", "success": False, "output": "prune failed"})

        # 4. Prune build cache via low-level API
        try:
            resp = client.api.prune_builds()
            freed = resp.get("SpaceReclaimed", 0) or 0
            total_freed_bytes += freed
            results.append({"step": "build_cache_prune", "success": True, "freed_bytes": freed})
        except Exception:
            results.append(
                {"step": "build_cache_prune", "success": False, "output": "prune failed"}
            )

        # 5. Prune unused networks
        try:
            client.networks.prune()
            results.append({"step": "networks_prune", "success": True})
        except Exception:
            results.append({"step": "networks_prune", "success": False, "output": "prune failed"})

        client.close()

    except ImportError:
        # Docker SDK not installed — fall back to CLI via subprocess
        import asyncio
        import re

        async def run_cmd(cmd: list) -> tuple:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            return proc.returncode, stdout.decode(), stderr.decode()

        for step, cmd in [
            ("builder_prune", ["docker", "builder", "prune", "-af"]),
            ("image_prune", ["docker", "image", "prune", "-af"]),
            ("container_prune", ["docker", "container", "prune", "-f"]),
        ]:
            try:
                code, out, err = await run_cmd(cmd)
                m = re.search(r"Total reclaimed space:\s+([\d.]+)\s*(GB|MB|kB|B)", out + err)
                if m:
                    val, unit = float(m.group(1)), m.group(2)
                    mult = {"GB": 1024**3, "MB": 1024**2, "kB": 1024, "B": 1}.get(unit, 1)
                    total_freed_bytes += int(val * mult)
                results.append(
                    {"step": step, "success": code == 0, "output": (out + err).strip()[:300]}
                )
            except Exception as e:
                logger.warning(f"Docker {step} failed: {scrub(e)}")
                results.append({"step": step, "success": False, "output": "prune failed"})

    except Exception as e:
        logger.warning(f"Docker SDK prune failed: {scrub(e)}")
        results.append({"step": "docker_sdk", "success": False, "output": "prune failed"})

    freed_gb = round(total_freed_bytes / (1024**3), 2)
    freed_mb = round(total_freed_bytes / (1024**2), 1)
    freed_label = f"{freed_gb} GB" if freed_gb >= 0.1 else f"{freed_mb} MB"

    logger.info(f"Docker pruned by admin {current_user.email} — freed {freed_label}")

    return {
        "success": True,
        "freed_bytes": total_freed_bytes,
        "freed_label": freed_label,
        "steps": results,
    }
