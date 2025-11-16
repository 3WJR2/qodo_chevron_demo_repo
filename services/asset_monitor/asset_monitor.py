from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

import yaml


@dataclass
class Thresholds:
    temperature_celsius: float
    pressure_bar: float
    vibration_mm_s: float


@dataclass
class AssetReading:
    temperature_celsius: float
    pressure_bar: float
    vibration_mm_s: float


@dataclass
class Alert:
    message: str
    reading: AssetReading
    triggered_at: float


@dataclass
class MonitorConfig:
    thresholds: Thresholds
    read_interval_seconds: int
    alerts_enabled: bool
    alerts_file: Path
    debounce_seconds: int


def load_config(path: Path) -> MonitorConfig:
    with path.open("r") as f:
        raw = yaml.safe_load(f)

    thresholds_cfg = raw.get("thresholds", {})
    logging_cfg = raw.get("logging", {})
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


def read_sensor_data() -> AssetReading:
    # In a real system, this would connect to field I/O or an API
    temp = 70 + random.uniform(-5, 25)
    pressure = 100 + random.uniform(-10, 30)
    vibration = 2.0 + random.uniform(-1, 6)

    return AssetReading(
        temperature_celsius=temp,
        pressure_bar=pressure,
        vibration_mm_s=vibration,
    )


def apply_jitter(reading: AssetReading, max_jitter: float = 1.0) -> AssetReading:
    jitter = random.uniform(-max_jitter, max_jitter)
    return AssetReading(
        temperature_celsius=reading.temperature_celsius + jitter,
        pressure_bar=reading.pressure_bar,
        vibration_mm_s=reading.vibration_mm_s,
    )


def should_trigger_alert(
    reading: AssetReading,
    thresholds: Thresholds,
) -> bool:
    if any(
        value is None
        for value in (
            reading.temperature_celsius,
            reading.pressure_bar,
            reading.vibration_mm_s,
        )
    ):
        # Defensive programming – treat missing values as non-alerting but log upstream
        return False

    return (
        reading.temperature_celsius > thresholds.temperature_celsius
        or reading.pressure_bar > thresholds.pressure_bar
        or reading.vibration_mm_s > thresholds.vibration_mm_s
    )


def format_alert(reading: AssetReading) -> str:
    return (
        f"ALERT: temp={reading.temperature_celsius:.2f}C, "
        f"pressure={reading.pressure_bar:.2f}bar, "
        f"vibration={reading.vibration_mm_s:.2f}mm/s"
    )


def write_alert(alert: Alert, path: Path) -> None:
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


def log_info(message: str) -> None:
    # Structured-friendly logging – in a real system this would use logging + JSON
    print(json.dumps({"level": "INFO", "message": message, "ts": time.time()}))


def log_warning(message: str) -> None:
    print(json.dumps({"level": "WARN", "message": message, "ts": time.time()}))


def evaluate_once(
    config: MonitorConfig,
    last_alert_timestamp: Optional[float],
) -> Optional[Alert]:
    reading = read_sensor_data()
    reading_with_jitter = apply_jitter(reading)

    if not should_trigger_alert(reading_with_jitter, config.thresholds):
        log_info(
            f"OK: temp={reading_with_jitter.temperature_celsius:.2f}, "
            f"pressure={reading_with_jitter.pressure_bar:.2f}, "
            f"vibration={reading_with_jitter.vibration_mm_s:.2f}"
        )
        return None

    now = time.time()
    if last_alert_timestamp is not None:
        if now - last_alert_timestamp < config.debounce_seconds:
            log_warning("Alert suppressed due to debounce interval.")
            return None

    message = format_alert(reading_with_jitter)
    alert = Alert(message=message, reading=reading_with_jitter, triggered_at=now)
    write_alert(alert, config.alerts_file)
    log_warning(message)
    return alert


def run_monitor_loop(config: MonitorConfig) -> None:
    log_info("Starting refactored asset monitor service...")

    last_alert_timestamp: Optional[float] = None

    while True:
        try:
            if config.alerts_enabled:
                alert = evaluate_once(config, last_alert_timestamp)
                if alert is not None:
                    last_alert_timestamp = alert.triggered_at
            else:
                log_info("Alerts are disabled by configuration.")
            time.sleep(config.read_interval_seconds)
        except KeyboardInterrupt:
            log_info("Received shutdown signal, exiting gracefully.")
            break
        except Exception as exc:  # noqa: BLE001 – deliberate: top-level guard
            log_warning(f"Unexpected error in monitor loop: {exc}")


def main() -> None:
    config_path = Path(__file__).with_name("config.yaml")
    config = load_config(config_path)
    run_monitor_loop(config)


if __name__ == "__main__":
    main()
