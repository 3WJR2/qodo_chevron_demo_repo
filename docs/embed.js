const DEFAULT_THRESHOLDS = {
  temperature_celsius: 90,
  pressure_bar: 120,
  vibration_mm_s: 5,
};

let thresholds = { ...DEFAULT_THRESHOLDS };

const ui = {
  temp: document.getElementById("tempValue"),
  pressure: document.getElementById("pressureValue"),
  vibration: document.getElementById("vibrationValue"),
  status: document.getElementById("alertStatus"),
  start: document.getElementById("startBtn"),
  stop: document.getElementById("stopBtn"),
  sample: document.getElementById("sampleBtn"),
  lowerThreshold: document.getElementById("lowerThresholdBtn"),
  thresholdValue: document.getElementById("thresholdValue"),
};

const state = {
  timer: null,
  lastReading: null,
  thresholdSource: "default",
};

function format(value, unit) {
  return `${value.toFixed(1)} ${unit}`;
}

function generateReading() {
  return {
    temperature_celsius: 65 + Math.random() * 40,
    pressure_bar: 95 + Math.random() * 40,
    vibration_mm_s: 1 + Math.random() * 8,
    ts: Date.now(),
  };
}

function isAlert(reading) {
  return (
    reading.temperature_celsius > thresholds.temperature_celsius ||
    reading.pressure_bar > thresholds.pressure_bar ||
    reading.vibration_mm_s > thresholds.vibration_mm_s
  );
}

function render(reading) {
  ui.temp.textContent = format(reading.temperature_celsius, "°C");
  ui.pressure.textContent = format(reading.pressure_bar, "bar");
  ui.vibration.textContent = format(reading.vibration_mm_s, "mm/s");
  const alerting = isAlert(reading);
  ui.status.textContent = alerting
    ? "Alert: thresholds exceeded"
    : "Within safe range";
  ui.status.classList.toggle("alert", alerting);
}

function broadcast(reading) {
  if (!window.parent || window.parent === window) {
    return;
  }
  window.parent.postMessage(
    {
      namespace: "asset-monitor",
      type: "reading",
      payload: reading,
    },
    "*",
  );
}

function sampleOnce() {
  const reading = generateReading();
  state.lastReading = reading;
  render(reading);
  broadcast(reading);
}

function startSimulation() {
  if (state.timer) {
    return;
  }
  sampleOnce();
  state.timer = window.setInterval(sampleOnce, 2000);
  ui.start.disabled = true;
  ui.stop.disabled = false;
}

function stopSimulation() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  ui.start.disabled = false;
  ui.stop.disabled = true;
}

ui.start.addEventListener("click", startSimulation);
ui.stop.addEventListener("click", stopSimulation);
ui.sample.addEventListener("click", sampleOnce);
ui.lowerThreshold?.addEventListener("click", () => {
  thresholds = { ...thresholds, temperature_celsius: 88 };
  state.thresholdSource = "override";
  updateThresholdLabel();
  if (state.lastReading) {
    render(state.lastReading);
  }
});

function updateThresholdLabel() {
  if (!ui.thresholdValue) {
    return;
  }
  const suffix =
    state.thresholdSource === "override"
      ? " (demo override)"
      : state.thresholdSource === "config"
        ? " (from config)"
        : "";
  ui.thresholdValue.textContent = `${thresholds.temperature_celsius.toFixed(1)}${suffix}`;
}

async function hydrateThresholdsFromConfig() {
  try {
    const response = await fetch("services/asset_monitor/config.yaml");
    if (!response.ok) {
      throw new Error(`Unable to load config: ${response.status}`);
    }
    const text = await response.text();
    const parsed = extractThresholds(text);
    thresholds = { ...thresholds, ...parsed };
    state.thresholdSource = "config";
  } catch (error) {
    console.warn("Falling back to default thresholds", error);
    thresholds = { ...DEFAULT_THRESHOLDS };
    state.thresholdSource = "default";
  } finally {
    updateThresholdLabel();
  }
}

function extractThresholds(raw) {
  const pick = (key, fallback) => {
    const match = raw.match(new RegExp(`${key}\\s*:\\s*([0-9.]+)`, "i"));
    return match ? parseFloat(match[1]) : fallback;
  };
  return {
    temperature_celsius: pick("temperature_celsius", DEFAULT_THRESHOLDS.temperature_celsius),
    pressure_bar: pick("pressure_bar", DEFAULT_THRESHOLDS.pressure_bar),
    vibration_mm_s: pick("vibration_mm_s", DEFAULT_THRESHOLDS.vibration_mm_s),
  };
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.namespace !== "asset-monitor") {
    return;
  }
  switch (data.type) {
    case "start":
      startSimulation();
      break;
    case "stop":
      stopSimulation();
      break;
    case "sample":
      sampleOnce();
      break;
    default:
      break;
  }
});

window.assetMonitorEmbed = {
  start: startSimulation,
  stop: stopSimulation,
  sample: sampleOnce,
  getLastReading: () => state.lastReading,
};

// Show an initial idle state
ui.stop.disabled = true;
ui.status.textContent = "Idle";
updateThresholdLabel();
hydrateThresholdsFromConfig();
