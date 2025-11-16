## Legacy Asset Monitor Service

import time
import random

THRESHOLD_TEMP = 90
THRESHOLD_PRESSURE = 120
THRESHOLD_VIBRATION = 5.0

READ_INTERVAL_SECONDS = 2

# global state everywhere
last_alert_time = None
alerts_enabled = True


def read_sensor_data():
    # Fake sensor readings, but in a real plant this would be a fieldbus, Modbus, etc.
    temp = 70 + random.uniform(-5, 25)
    pressure = 100 + random.uniform(-10, 30)
    vibration = 2.0 + random.uniform(-1, 6)
    return {
        "temp": temp,
        "pressure": pressure,
        "vibration": vibration,
    }


def log_message(message):
    # Legacy: just print, no structure
    print(f"[LOG] {message}")


def write_alert_to_file(alert_text):
    # File is never closed properly, no error handling, no rotation
    f = open("alerts.log", "a")
    f.write(alert_text + "\n")


def check_alerts():
    global last_alert_time

    data = read_sensor_data()

    temp = data["temp"]
    pressure = data["pressure"]
    vibration = data["vibration"]

    jitter = random.uniform(-1, 1)  # Random logic in the middle of everything
    temp_with_jitter = temp + jitter

    if temp_with_jitter > THRESHOLD_TEMP or pressure > THRESHOLD_PRESSURE or vibration > THRESHOLD_VIBRATION:
        alert_text = (
            f"ALERT: temp={temp_with_jitter:.2f}, "
            f"pressure={pressure:.2f}, vibration={vibration:.2f}"
        )
        print(alert_text)
        write_alert_to_file(alert_text)
        last_alert_time = time.time()
    else:
        log_message(
            f"OK: temp={temp_with_jitter:.2f}, "
            f"pressure={pressure:.2f}, vibration={vibration:.2f}"
        )


def main():
    # No exit conditions, potential infinite loop
    log_message("Starting legacy asset monitor service...")
    while True:
        try:
            if alerts_enabled:
                check_alerts()
            else:
                log_message("Alerts temporarily disabled.")
            time.sleep(READ_INTERVAL_SECONDS)
        except Exception as e:
            # Catch-all that hides real issues
            print("Unexpected error in monitor loop:", e)


if __name__ == "__main__":
    main()
