// Refactored dashboard – more structured, ready to talk about Qodo multi-language reasoning.

async function fetchLatestAlerts() {
    const response = await fetch("/api/alerts");
    if (!response.ok) {
      throw new Error(`Failed to fetch alerts: ${response.status}`);
    }
    return response.json();
  }
  
  function renderAlert(alert) {
    const row = document.createElement("div");
    row.className = "alert-row";
  
    const message = document.createElement("span");
    message.className = "alert-message";
    message.textContent = alert.message;
  
    const meta = document.createElement("span");
    meta.className = "alert-meta";
    meta.textContent = new Date(alert.triggered_at * 1000).toISOString();
  
    row.appendChild(message);
    row.appendChild(meta);
    return row;
  }
  
  async function render() {
    const container = document.getElementById("alerts");
    if (!container) return;
  
    try {
      const alerts = await fetchLatestAlerts();
      container.innerHTML = "";
  
      (alerts || []).forEach((alert) => {
        container.appendChild(renderAlert(alert));
      });
    } catch (err) {
      console.error("Error rendering alerts", err);
      container.innerHTML = "<p>Failed to load alerts.</p>";
    }
  }
  
  setInterval(render, 5000);
  render();
  