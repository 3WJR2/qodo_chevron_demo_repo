const thresholds = {
  temperature_celsius: 90,
  pressure_bar: 120,
  vibration_mm_s: 5,
};

const ui = {
  temp: document.getElementById("tempValue"),
  pressure: document.getElementById("pressureValue"),
  vibration: document.getElementById("vibrationValue"),
  status: document.getElementById("alertStatus"),
  start: document.getElementById("startBtn"),
  stop: document.getElementById("stopBtn"),
  sample: document.getElementById("sampleBtn"),
};

const state = {
  timer: null,
  lastReading: null,
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
