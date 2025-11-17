from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import yaml


# ---------------------------------------------------------------------------
# Data Models
# ---------------------------------------------------------------------------

@dataclass
class Thresholds:
    """
    Threshold values used to determine when alerts should fire.
    """
    temperature_celsius: float
    pressure_bar: float
    vibration_mm_s: float


@dataclass
class AssetReading:
    """
    A single snapshot of sensor readings from an asset.
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
    Configuration for the asset monitoring service.
    """
    thresholds: Thresholds
    read_interval_seconds: int
    alerts_enabled: bool
    alerts_file: Path
    debounce_seconds: int


# ---------------------------------------------------------------------------
# Config Loading
# ---------------------------------------------------------------------------

def load_config(path: Path) -> MonitorConfig:
    """
    Load monitoring configuration from a YAML file.

    Returns:
        MonitorConfig: fully populated configuration object.
    """
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    with path.open("r") as f:
        raw = yaml.safe_load(f) or {}

    thresholds_cfg = raw.get("thresholds", {})
    alerts_cfg = raw.get("alerts", {})

    thresholds = Thresholds(
        temperature_celsius=float(thresholds_cfg.get("temperature_celsius", 90.0)),
        pressure_bar=float(thresholds_cfg.get("pressure_bar", 120.0)),
        vibration_mm_s=float(thresholds_cfg.get("vibration_mm_s", 5.0)),
    )

    read_interval = int(raw.get("read_interval_seconds", 2))

    alerts_enabled = bool(alerts_cfg.get("enabled", True))
    alerts_file = Path(alerts_cfg.get("file", "alerts.log"))
    debounce_seconds = int(alerts_cfg.get("debounce_seconds", 5))

    return MonitorConfig(
        thresholds=thresholds,
        read_interval_seconds=read_interval,
        alerts_enabled=alerts_enabled,
        alerts_file=alerts_file,
        debounce_seconds=debounce_seconds,
    )


# ---------------------------------------------------------------------------
# Sensor Input + Processing
# ---------------------------------------------------------------------------

def read_sensor_data() -> AssetReading:
    """
    Simulate reading raw sensor data from an asset.

    In production this would call hardware I/O or a telemetry API.
    """
    temp = 70 + random.uniform(-5, 25)
    pressure = 100 + random.uniform(-10, 30)
    vibration = 2.0 + random.uniform(-1, 6)

    return AssetReading(
        temperature_celsius=temp,
        pressure_bar=pressure,
        vibration_mm_s=vibration,
    )


def apply_jitter(reading: AssetReading, max_jitter: float = 1.0) -> AssetReading:
    """
    Apply a small jitter to simulate sensor noise.
    """
    if max_jitter < 0:
        raise ValueError("max_jitter must be non-negative")

    jitter = random.uniform(-max_jitter, max_jitter)

    return AssetReading(
        temperature_celsius=reading.temperature_celsius + jitter,
        pressure_bar=reading.pressure_bar,
        vibration_mm_s=reading.vibration_mm_s,
    )


# ---------------------------------------------------------------------------
# Alerting Logic
# ---------------------------------------------------------------------------

def should_trigger_alert(reading: AssetReading, thresholds: Thresholds) -> bool:
    """
    Return True if any reading exceeds its corresponding threshold.
    """
    return (
        reading.temperature_celsius > thresholds.temperature_celsius
        or reading.pressure_bar > thresholds.pressure_bar
        or reading.vibration_mm_s > thresholds.vibration_mm_s
    )


def format_alert(reading: AssetReading) -> str:
    """
    Convert a reading into a human-readable alert message.
    """
    return (
        f"ALERT: temp={reading.temperature_celsius:.2f}C, "
        f"pressure={reading.pressure_bar:.2f}bar, "
        f"vibration={reading.vibration_mm_s:.2f}mm/s"
    )


def write_alert(alert: Alert, path: Path) -> None:
    """
    Append an alert entry to disk in JSON form.
    """
    record = {
        "message": alert.message,
        "reading": {
            "temperature_celsius": alert.reading.temperature_celsius,
            "pressure_bar": alert.reading.pressure_bar,
            "vibration_mm_s": alert.reading.vibration_mm_s,
        },
        "triggered_at": alert.triggered_at,
    }

    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("a") as f:
        f.write(json.dumps(record) + "\n")


# ---------------------------------------------------------------------------
# Logging Helpers
# ---------------------------------------------------------------------------

def log_info(event: str, **fields: object) -> None:
    """
    Emit a structured INFO log entry.
    """
    data = {
        "level": "INFO",
        "event": event,
        "ts": time.time(),
        **fields,
    }
    print(json.dumps(data))


def log_warning(event: str, **fields: object) -> None:
    """
    Emit a structured WARN log entry.
    """
    data = {
        "level": "WARN",
        "event": event,
        "ts": time.time(),
        **fields,
    }
    print(json.dumps(data))


# ---------------------------------------------------------------------------
# Monitoring Loop
# ---------------------------------------------------------------------------

def evaluate_once(
    config: MonitorConfig,
    last_alert_timestamp: Optional[float],
) -> Optional[Alert]:
    """
    Perform one evaluation cycle:
      - Read sensor data
      - Apply jitter
      - Check thresholds
      - Enforce debounce window
      - Write alert if needed
    """
    reading = read_sensor_data()
    reading = apply_jitter(reading)

    if not should_trigger_alert(reading, config.thresholds):
        log_info(
            "sensor_reading_ok",
            temperature=reading.temperature_celsius,
            pressure=reading.pressure_bar,
            vibration=reading.vibration_mm_s,
        )
        return None

    now = time.time()

    # Debounce window enforcement
    if last_alert_timestamp is not None:
        if now - last_alert_timestamp < config.debounce_seconds:
            log_warning(
                "alert_debounced",
                temperature=reading.temperature_celsius,
                pressure=reading.pressure_bar,
                vibration=reading.vibration_mm_s,
            )
            return None

    message = format_alert(reading)
    alert = Alert(message=message, reading=reading, triggered_at=now)

    write_alert(alert, config.alerts_file)

    log_warning(
        "alert_triggered",
        message=message,
        temperature=reading.temperature_celsius,
        pressure=reading.pressure_bar,
        vibration=reading.vibration_mm_s,
    )

    return alert


def run_monitor_loop(config: MonitorConfig) -> None:
    """
    Continuously run the monitoring loop until interrupted.
    """
    log_info("monitor_startup", read_interval_seconds=config.read_interval_seconds)

    last_alert_timestamp: Optional[float] = None

    while True:
        try:
            if config.alerts_enabled:
                alert = evaluate_once(config, last_alert_timestamp)
                if alert:
                    last_alert_timestamp = alert.triggered_at
            else:
                log_info("alerts_disabled")

            time.sleep(config.read_interval_seconds)

        except KeyboardInterrupt:
            log_info("monitor_shutdown", reason="keyboard_interrupt")
            break

        except Exception as exc:  # top-level guard
            log_warning("unexpected_error", error=str(exc))


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    config_path = Path(__file__).with_name("config.yaml")
    config = load_config(config_path)
    run_monitor_loop(config)


if __name__ == "__main__":
    main()
