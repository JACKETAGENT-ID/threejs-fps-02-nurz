#!/usr/bin/env python3
"""Take the 4 Neon Docks v3 screenshots with headless Chromium (Playwright).

Reads shots.json, opens each ?shot= URL on the local static server, waits for
window.__shotReady (the game renders the frame twice, then freezes), and saves
a JPEG. Run from the repo root while `node serve.ts` is up on :8080.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
SHOTS = json.loads((ROOT / "shots.json").read_text())
BASE = "http://127.0.0.1:8080/index.html"

with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=str(Path.home() / ".cache/ms-playwright/chromium-1148/chrome-linux/chrome"),
        args=[
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
            "--disable-gpu-sandbox",
            "--no-sandbox",
        ],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    # The browser's own /favicon.ico request 404s on the static server; that is
    # not a game error and index.html references no favicon. Track 404s by URL.
    page.on("response", lambda r: errors.append(f"{r.status} {r.url}") if r.status >= 400 and "favicon" not in r.url else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    for shot in SHOTS:
        url = BASE + shot["query"]
        page.goto(url, wait_until="load")
        try:
            page.wait_for_function("window.__shotReady === true", timeout=20000)
        except Exception as exc:  # noqa: BLE001
            print(f"TIMEOUT {shot['name']}: {exc}", file=sys.stderr)
            continue
        out = ROOT / "screenshots" / shot["name"]
        page.screenshot(path=str(out), type="jpeg", quality=85)
        size = out.stat().st_size
        print(f"{shot['name']}: {size} bytes")
    browser.close()

if errors:
    print("PAGE ERRORS:", file=sys.stderr)
    for err in errors[:10]:
        print(" -", err, file=sys.stderr)
    sys.exit(1)
print("shots done, no page errors")
