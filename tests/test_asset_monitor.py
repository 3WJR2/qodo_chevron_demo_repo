import json
import time
from pathlib import Path
import pytest
import yaml

from services.asset_monitor.asset_monitor import (
    Alert,
    AssetReading,
    MonitorConfig,
    Thresholds,
    apply_jitter,
    evaluate_once,
    load_config,
    log_info,
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


def test_thresholds_loaded_from_config(tmp_path: Path) -> None:
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
        ),
        encoding="utf-8",
    )

    config = load_config(cfg_path)

    assert config.thresholds.temperature_celsius == 95.0
    assert config.thresholds.pressure_bar == 110.0
    assert config.thresholds.vibration_mm_s == 4.5
    assert config.read_interval_seconds == 3
    assert config.debounce_seconds == 10
    assert config.alerts_file.name == "alerts.log"
    assert config.alerts_enabled is True

@pytest.mark.parametrize(
    "metric, value",
    [
        ("temperature_celsius", 100.0),
        ("pressure_bar", 130.0),
        ("vibration_mm_s", 6.0),
    ],
)
def test_evaluate_once_triggers_alert_when_over_threshold(
    metric: str,
    value: float,
    monitor_config: MonitorConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_read_sensor_data() -> AssetReading:
        reading_values = {
            "temperature_celsius": 50.0,
            "pressure_bar": 100.0,
            "vibration_mm_s": 4.0,
        }
        # Only one metric is pushed over its threshold at a time
        reading_values[metric] = value
        return AssetReading(**reading_values)

    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.read_sensor_data",
        fake_read_sensor_data,
    )
    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.apply_jitter",
        lambda reading, max_jitter=1.0: reading,
    )

    alert = evaluate_once(monitor_config, last_alert_timestamp=None)
    assert isinstance(alert, Alert)
    assert "ALERT" in alert.message
    assert monitor_config.alerts_file.exists()



def test_evaluate_once_respects_debounce(
    monitor_config: MonitorConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_read_sensor_data() -> AssetReading:
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


def test_threshold_boundary_does_not_trigger_alert(
    monitor_config: MonitorConfig,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Exact-threshold values should NOT trigger an alert.
    """
    def fake_read_sensor_data() -> AssetReading:
        return AssetReading(
            temperature_celsius=monitor_config.thresholds.temperature_celsius,
            pressure_bar=monitor_config.thresholds.pressure_bar,
            vibration_mm_s=monitor_config.thresholds.vibration_mm_s,
        )

    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.read_sensor_data",
        fake_read_sensor_data,
    )
    monkeypatch.setattr(
        "services.asset_monitor.asset_monitor.apply_jitter",
        lambda reading, max_jitter=1.0: reading,
    )

    alert = evaluate_once(monitor_config, last_alert_timestamp=None)
    assert alert is None


def test_apply_jitter_rejects_negative_max_jitter() -> None:
    reading = AssetReading(100.0, 120.0, 5.0)
    with pytest.raises(ValueError):
        apply_jitter(reading, max_jitter=-0.1)


def test_log_info_emits_structured_json(capsys: pytest.CaptureFixture[str]) -> None:
    """
    Verify that log_info emits JSON with expected keys.
    """
    log_info("test_event", foo="bar", answer=42)
    captured = capsys.readouterr()
    line = captured.out.strip()
    assert line, "Expected log output"

    parsed = json.loads(line)
    assert parsed["level"] == "INFO"
    assert parsed["event"] == "test_event"
    assert parsed["foo"] == "bar"
    assert parsed["answer"] == 42
    assert "ts" in parsed
