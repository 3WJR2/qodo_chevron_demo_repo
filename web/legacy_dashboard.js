// Legacy dashboard code – intentionally simplistic and inconsistent.

function fetchLatestAlerts() {
    return fetch("/api/alerts")
      .then((res) => res.json())
      .catch((err) => {
        console.log("Error fetching alerts", err);
      });
  }
  
  function render() {
    fetchLatestAlerts().then(function (alerts) {
      var container = document.getElementById("alerts");
      if (!container) return;
  
      container.innerHTML = "";
      (alerts || []).forEach(function (alert) {
        var div = document.createElement("div");
        div.innerText = alert.message;
        container.appendChild(div);
      });
    });
  }
  
  setInterval(render, 5000);
  render();
  