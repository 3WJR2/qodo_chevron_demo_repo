import time
from pathlib import Path

import pytest
import yaml

from services.asset_monitor.asset_monitor import (
    Alert,
    AssetReading,
    MonitorConfig,
    Thresholds,
    evaluate_once,
)


@pytest.fixture
def tmp_alerts_file(tmp_path: Path) -> Path:
    return tmp_path / "alerts.log"


@pytest.fixture
def monitor_config(tmp_alerts_file: Path) -> MonitorConfig:
    thresholds = Thresholds(
        temperature_celsius=90.0,
        pressure_bar=120.0,
        vibration_mm_s=5.0,
    )
    return MonitorConfig(
        thresholds=thresholds,
        read_interval_seconds=1,
        alerts_enabled=True,
        alerts_file=tmp_alerts_file,
        debounce_seconds=2,
    )


def test_thresholds_loaded_from_config(tmp_path: Path):
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(
        yaml.safe_dump(
            {
                "thresholds": {
                    "temperature_celsius": 95.0,
                    "pressure_bar": 110.0,
                    "vibration_mm_s": 4.5,
                },
                "read_interval_seconds": 3,
                "alerts": {
                    "enabled": True,
                    "file": "alerts.log",
                    "debounce_seconds": 10,
                },
            }
        )
    )

    from services.asset_monitor.asset_monitor import load_config

    config = load_config(cfg_path)
    assert config.thresholds.temperature_celsius == 95.0
    assert config.thresholds.pressure_bar == 110.0
    assert config.thresholds.vibration_mm_s == 4.5
    assert config.read_interval_seconds == 3
    assert config.debounce_seconds == 10


def test_evaluate_once_triggers_alert_when_over_threshold(monitor_config: MonitorConfig, monkeypatch):
    def fake_read_sensor_data():
        return AssetReading(
            temperature_celsius=100.0,
            pressure_bar=130.0,
            vibration_mm_s=6.0,
        )

    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.read_sensor_data",
        fake_read_sensor_data,
    )

    # Disable jitter for deterministic tests
    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.apply_jitter",
        lambda reading, max_jitter=1.0: reading,
    )

    alert = evaluate_once(monitor_config, last_alert_timestamp=None)
    assert isinstance(alert, Alert)
    assert "ALERT" in alert.message
    assert monitor_config.alerts_file.exists()


def test_evaluate_once_respects_debounce(monitor_config: MonitorConfig, monkeypatch):
    def fake_read_sensor_data():
        return AssetReading(
            temperature_celsius=100.0,
            pressure_bar=130.0,
            vibration_mm_s=6.0,
        )

    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.read_sensor_data",
        fake_read_sensor_data,
    )
    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.apply_jitter",
        lambda reading, max_jitter=1.0: reading,
    )

    now = time.time()
    alert = evaluate_once(monitor_config, last_alert_timestamp=now)
    # Because debounce is 2 seconds, this should not fire yet
    assert alert is None
