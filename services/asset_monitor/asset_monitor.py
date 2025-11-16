from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml


@dataclass
class Thresholds:
    """
    Threshold values for asset monitoring.

    These are the configurable limits used to determine when an alert should fire.
    """
    temperature_celsius: float
    pressure_bar: float
    vibration_mm_s: float


@dataclass
class AssetReading:
    """
    A single snapshot of readings from an asset.

    In a real system, this would be populated from hardware sensors or an API.
    """
    temperature_celsius: float
    pressure_bar: float
    vibration_mm_s: float


@dataclass
class Alert:
    """
    Represents an alert event produced by the monitor.
    """
    message: str
    reading: AssetReading
    triggered_at: float


@dataclass
class MonitorConfig:
    """
    Configuration for the asset monitor service.

    This is loaded from YAML and treated as the single source of truth
    for thresholds and runtime behavior.
    """
    thresholds: Thresholds
    read_interval_seconds: int
    alerts_enabled: bool
    alerts_file: Path
    debounce_seconds: int


def log_info(event: str, **fields: object) -> None:
    """                                         
    Log a structured INFO-level event.

    Uses JSON output so logs can be parsed by log
    aggregation tools.
    """
    print(json.dumps({
        "level": "INFO",
        "event": event,
        "fields": fields,
    }))