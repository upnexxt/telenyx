#!/usr/bin/env python3
"""
test_start.py — Start the service locally and point Telnyx at the tunnel for testing.

What it does (in order):
  1. Starts cloudflared tunnel -> captures the public HTTPS URL
  2. Updates .env PUBLIC_DOMAIN with the tunnel hostname
  3. Starts the server (npm run dev) on port 3000
  4. Points the Telnyx Call Control app webhook at the tunnel
  5. Prints "READY — call the number now"

Order matters: server reads PUBLIC_DOMAIN at import time via load_dotenv(),
so .env MUST be updated before the server process starts.

On Ctrl+C (or server crash) it automatically:
  - Restores the Telnyx webhook to the prod URL
  - Restores .env PUBLIC_DOMAIN to the prod domain
  - Kills the server and tunnel processes
"""

import os
import re
import subprocess
import sys

# Force UTF-8 output so Unicode arrows/dashes print on any Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import threading
import time
import requests
from pathlib import Path

# ---------------------------------------------------------------------------
# Config — update these if keys/IDs rotate
# ---------------------------------------------------------------------------
PROJECT_DIR = Path(__file__).parent
ENV_FILE = PROJECT_DIR / ".env"
CLOUDFLARED = PROJECT_DIR / "cloudflared.exe"

# TUNNEL: "cloudflared" or "ngrok"
# Note: ngrok needs authentication. Use cloudflared if no authtoken configured.
TUNNEL = "cloudflared"

TELNYX_API_KEY = "YOUR_TELNYX_API_KEY"
TELNYX_APP_ID = "2922916931633677655"
PROD_WEBHOOK = "https://prabeo-voice-1004140955004.europe-west1.run.app/telnyx-webhook"
PROD_DOMAIN = "prabeo-voice-1004140955004.europe-west1.run.app"
PORT = 3000
# ---------------------------------------------------------------------------


def update_env(key: str, value: str) -> None:
    """Replace KEY=<anything> with KEY=value in .env (in-place)."""
    text = ENV_FILE.read_text(encoding="utf-8")
    new_text = re.sub(rf"^{key}=.*$", f"{key}={value}", text, flags=re.MULTILINE)
    ENV_FILE.write_text(new_text, encoding="utf-8")


def set_telnyx_webhook(url: str) -> str:
    """PATCH the Telnyx app webhook URL. Returns the confirmed URL."""
    r = requests.patch(
        f"https://api.telnyx.com/v2/call_control_applications/{TELNYX_APP_ID}",
        headers={
            "Authorization": f"Bearer {TELNYX_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"webhook_event_url": url},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["data"]["webhook_event_url"]


def restore_prod() -> None:
    """Restore Telnyx webhook and .env to production values."""
    print("\n► Restoring Telnyx webhook -> prod...")
    try:
        confirmed = set_telnyx_webhook(PROD_WEBHOOK)
        print(f"  Confirmed: {confirmed}")
    except Exception as e:
        print(f"  WARNING: could not restore webhook: {e}")
        print("  Run restore_prod.py manually to fix this.")

    print(f"► Restoring .env PUBLIC_DOMAIN={PROD_DOMAIN}")
    try:
        update_env("PUBLIC_DOMAIN", PROD_DOMAIN)
    except Exception as e:
        print(f"  WARNING: could not update .env: {e}")


print("=" * 60)
print("  Telenyx AI Receptionist - Local Test Launcher")
print("=" * 60)
print()

# ---------------------------------------------------------------------------
# Step 1 — Start tunnel
# ---------------------------------------------------------------------------
cf = None
cf_log = None
tunnel_url: str | None = None

print(f"► [1/4] Starting {TUNNEL} tunnel (this takes ~5 s)...")

cf_log_path = PROJECT_DIR / "cloudflared_test.log"
if TUNNEL == "ngrok":
    cf_log_path = PROJECT_DIR / "ngrok_test.log"
cf_log = open(cf_log_path, "w", encoding="utf-8")

if TUNNEL == "ngrok":
    ngrok_cmd = Path(r"C:\Users\ReMarkt\AppData\Roaming\npm\ngrok.cmd")
    # Kill any existing ngrok processes
    try:
        subprocess.run(
            ["taskkill", "/f", "/im", "ngrok.exe"], check=False, capture_output=True
        )
        print("  Killed existing ngrok processes")
    except:
        pass
    # Also try ngrok kill all
    try:
        subprocess.run(
            [str(ngrok_cmd), "kill", "all"], check=False, capture_output=True
        )
        print("  Killed existing ngrok tunnels")
    except:
        pass
    cf = subprocess.Popen(
        [str(ngrok_cmd), "http", str(PORT)],
        cwd=str(PROJECT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    # Wait for ngrok to start and capture the URL from output
    deadline = time.time() + 20
    while time.time() < deadline:
        line = cf.stdout.readline()
        if not line:
            # Check if process died
            if cf.poll() is not None:
                # Read any stderr
                err = cf.stderr.read() if cf.stderr else ""
                print(f"  ERROR: ngrok died: {err[:200]}")
                break
            time.sleep(0.1)
            continue
        cf_log.write(line)
        cf_log.flush()
        # Look for URL in output (ngrok prints the URL)
        m = re.search(r"https://[\w\-]+\.ngrok-free\.app", line)
        if m:
            tunnel_url = m.group(0)
            break
        # Also check for the inspect URL
        m = re.search(r"Session Expires", line)
        if m and not tunnel_url:
            # ngrok started but we missed the URL, try API
            pass
        # Debug: print important lines
        if (
            "started" in line.lower()
            or "error" in line.lower()
            or "url" in line.lower()
        ):
            print(f"    ngrok: {line.strip()}")

    # Try API as fallback
    if not tunnel_url:
        try:
            r = requests.get("http://localhost:4040/api/tunnels", timeout=5)
            data = r.json()
            for t in data.get("tunnels", []):
                if t.get("proto") == "https":
                    tunnel_url = t.get("public_url")
                    break
        except Exception as e:
            print(f"  WARNING: Could not get ngrok URL from API: {e}")
else:
    cf = subprocess.Popen(
        [
            str(CLOUDFLARED),
            "tunnel",
            "--protocol",
            "quic",
            "--url",
            f"http://localhost:{PORT}",
        ],
        cwd=str(PROJECT_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    deadline = time.time() + 30
    for line in cf.stdout:
        cf_log.write(line)
        cf_log.flush()
        m = re.search(r"https://[\w-]+\.trycloudflare\.com", line)
        if m:
            tunnel_url = m.group(0)
            break
        if time.time() > deadline:
            break

if not tunnel_url:
    print(f"  ERROR: {TUNNEL} did not produce a tunnel URL.")
    if cf:
        cf.terminate()
    sys.exit(1)


def _drain(proc: subprocess.Popen, log) -> None:
    if proc.stdout:
        for ln in proc.stdout:
            log.write(ln)
            log.flush()


if cf.stdout:
    threading.Thread(target=_drain, args=(cf, cf_log), daemon=True).start()

hostname = tunnel_url.removeprefix("https://")
print(f"  Tunnel URL : {tunnel_url}")
update_env("PUBLIC_DOMAIN", hostname)

# ---------------------------------------------------------------------------
# Step 2 — Update .env BEFORE starting the server
# ---------------------------------------------------------------------------
print()
print(f"► [2/4] Updating .env  PUBLIC_DOMAIN={hostname}")
update_env("PUBLIC_DOMAIN", hostname)

# ---------------------------------------------------------------------------
# Step 3 — Start local server
# ---------------------------------------------------------------------------
server = None

print()
print(f"► [3/4] Starting npm run dev on port {PORT}...")

# Kill any process using port 3000
try:
    result = subprocess.run(
        "netstat -ano | findstr :3000", shell=True, capture_output=True, text=True
    )
    if result.stdout:
        lines = result.stdout.strip().split("\n")
        for line in lines:
            if "LISTENING" in line:
                parts = line.split()
                if len(parts) >= 5:
                    pid = parts[4]
                    try:
                        subprocess.run(
                            f"taskkill /f /pid {pid}", shell=True, check=False
                        )
                        print(f"  Killed process {pid} on port {PORT}")
                    except:
                        pass
except:
    pass

server = subprocess.Popen(
    "npm run dev",
    cwd=str(PROJECT_DIR),
    env={**os.environ, "PYTHONUNBUFFERED": "1", "PORT": str(PORT)},
    shell=True,
)

time.sleep(5)

if server.poll() is not None:
    print("  ERROR: Server exited immediately.")
    restore_prod()
    if cf:
        cf.terminate()
    sys.exit(1)

print(f"  Server PID {server.pid} — listening on http://localhost:{PORT}")

# ---------------------------------------------------------------------------
# Step 4 — Point Telnyx at the endpoint
# ---------------------------------------------------------------------------
print()
webhook = f"{tunnel_url}/api/v1/telnyx/inbound"
print(f"► [4/4] Pointing Telnyx webhook -> {webhook}")

try:
    confirmed = set_telnyx_webhook(webhook)
    print(f"  Telnyx confirmed: {confirmed}")
except Exception as e:
    print(f"  ERROR: could not update Telnyx webhook: {e}")
    restore_prod()
    if server:
        server.terminate()
    if cf:
        cf.terminate()
    sys.exit(1)

# ---------------------------------------------------------------------------
# Ready!
# ---------------------------------------------------------------------------
print()
print("=" * 60)
print("  READY — call the Telnyx number now!")

print(f"  Tunnel  : {tunnel_url}")
print(f"  Webhook : {webhook}")
print(f"  Logs    : {cf_log_path}")

print()
print("  Press Ctrl+C to stop and restore prod settings.")
print("=" * 60)
print()

# ---------------------------------------------------------------------------
# Keep running until Ctrl+C
# ---------------------------------------------------------------------------
try:
    if server:
        server.wait()
    else:
        # No server to wait for - just wait for Ctrl+C
        while True:
            time.sleep(1)
except KeyboardInterrupt:
    pass
finally:
    restore_prod()
    if server:
        server.terminate()
    if cf:
        cf.terminate()
    if cf_log:
        cf_log.close()
    print("► Done.")
