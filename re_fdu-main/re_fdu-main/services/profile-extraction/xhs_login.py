"""Launch a real Chrome window for XHS login and keep it attachable via CDP.

Usage:
  python xhs_login.py

Flow:
  1. Start a dedicated Chrome instance with remote debugging enabled.
  2. Open xiaohongshu.com in that browser.
  3. Let the user log in manually.
  4. Verify the collector can attach to the same browser over CDP.
"""

from __future__ import annotations

import json
import os
import queue
import re
import socket
import subprocess
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from schoolmate.browser import close, eval_js, new_page
from schoolmate.config import CDP_ENDPOINT_CACHE_PATH
from schoolmate.xhs_auth import HOME_URL, ensure_home_login_ready, format_login_markers
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Users\%USERNAME%\AppData\Local\Google\Chrome\Application\chrome.exe",
]
DEVTOOLS_WS_RE = re.compile(r"(ws://[^\s]+/devtools/browser/[^\s]+)")


def resolve_chrome_path() -> str:
    for candidate in CHROME_CANDIDATES:
        expanded = Path(os.path.expandvars(candidate))
        if expanded.exists():
            return str(expanded)
    raise FileNotFoundError("Google Chrome was not found in standard install paths.")


def ensure_cdp_env() -> tuple[str, str]:
    port = os.environ.get("SCHOOLMATE_CDP_PORT", "9222")
    endpoint = os.environ.get("SCHOOLMATE_CDP_ENDPOINT", f"http://127.0.0.1:{port}")
    os.environ["SCHOOLMATE_BROWSER_USE_CDP"] = "true"
    os.environ["SCHOOLMATE_CDP_ENDPOINT"] = endpoint
    return port, endpoint


def env_flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes")


def resolve_chrome_user_data_dir(*, use_system: bool | None = None) -> Path:
    configured = os.environ.get("SCHOOLMATE_CHROME_USER_DATA_DIR", "").strip()
    if configured:
        return Path(configured)

    use_system_resolved = (
        env_flag("SCHOOLMATE_CHROME_USE_SYSTEM_PROFILE", False)
        if use_system is None
        else use_system
    )
    if use_system_resolved:
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        if local_app_data:
            return Path(local_app_data) / "Google" / "Chrome" / "User Data"

    return Path.home() / "xhs-chrome-profile"


def resolve_chrome_profile_directory() -> str:
    return os.environ.get("SCHOOLMATE_CHROME_PROFILE_DIRECTORY", "Default").strip() or "Default"


def _endpoint_host_port(endpoint: str) -> tuple[str, int] | None:
    parsed = urlparse(endpoint)
    if parsed.hostname and parsed.port:
        return parsed.hostname, parsed.port
    return None


def is_cdp_endpoint_live(endpoint: str, timeout_sec: float = 1.0) -> bool:
    target = _endpoint_host_port(endpoint)
    if target is None:
        return False
    try:
        with socket.create_connection(target, timeout=timeout_sec):
            return True
    except OSError:
        return False


def read_cached_cdp_endpoint() -> str:
    cache_path = Path(CDP_ENDPOINT_CACHE_PATH)
    if not cache_path.exists():
        return ""
    try:
        return cache_path.read_text(encoding="utf-8").strip()
    except Exception:
        return ""


def probe_live_cdp_endpoint(port: str, timeout_sec: float = 2.0) -> str:
    version_url = f"http://127.0.0.1:{port}/json/version"
    try:
        with urlopen(version_url, timeout=timeout_sec) as response:
            payload = json.loads(response.read().decode("utf-8", errors="replace"))
    except (OSError, URLError, ValueError, json.JSONDecodeError):
        return ""

    ws_endpoint = str(payload.get("webSocketDebuggerUrl", "")).strip()
    if ws_endpoint and is_cdp_endpoint_live(ws_endpoint, timeout_sec=timeout_sec):
        return ws_endpoint
    return ""


def launch_chrome(user_data_dir: Path | None = None) -> subprocess.Popen[str]:
    chrome_path = resolve_chrome_path()
    port, _endpoint = ensure_cdp_env()
    user_data_dir = user_data_dir or resolve_chrome_user_data_dir()
    profile_directory = resolve_chrome_profile_directory()
    user_data_dir.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(
        [
            chrome_path,
            f"--remote-debugging-port={port}",
            "--remote-debugging-address=127.0.0.1",
            f"--user-data-dir={user_data_dir}",
            f"--profile-directory={profile_directory}",
            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            "https://www.xiaohongshu.com",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def capture_devtools_ws_endpoint(proc: subprocess.Popen[str], timeout_sec: float = 8.0) -> str:
    if proc.stderr is None:
        return ""

    lines: queue.Queue[str | None] = queue.Queue()

    def _reader() -> None:
        try:
            while True:
                line = proc.stderr.readline()
                if not line:
                    break
                lines.put(line)
        finally:
            lines.put(None)

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()

    deadline = time.time() + timeout_sec
    buffer: list[str] = []
    while time.time() < deadline:
        try:
            item = lines.get(timeout=0.2)
        except queue.Empty:
            continue
        if item is None:
            break
        buffer.append(item)
        matched = DEVTOOLS_WS_RE.search(item)
        if matched:
            return matched.group(1)
    for item in buffer:
        matched = DEVTOOLS_WS_RE.search(item)
        if matched:
            return matched.group(1)
    return ""


def persist_cdp_endpoint(endpoint: str) -> None:
    if not endpoint:
        return
    cache_path = Path(CDP_ENDPOINT_CACHE_PATH)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(endpoint.strip(), encoding="utf-8")


def clear_cached_cdp_endpoint() -> None:
    cache_path = Path(CDP_ENDPOINT_CACHE_PATH)
    try:
        if cache_path.exists():
            cache_path.unlink()
    except Exception:
        pass


def stop_process(proc: subprocess.Popen[str] | None) -> None:
    if proc is None:
        return
    try:
        if proc.poll() is None:
            proc.terminate()
            proc.wait(timeout=5)
    except Exception:
        try:
            if proc.poll() is None:
                proc.kill()
        except Exception:
            pass


def read_devtools_active_port(user_data_dir: Path, timeout_sec: float = 10.0) -> str:
    active_port_file = user_data_dir / "DevToolsActivePort"
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if active_port_file.exists():
            try:
                lines = [
                    line.strip()
                    for line in active_port_file.read_text(encoding="utf-8", errors="replace").splitlines()
                    if line.strip()
                ]
            except Exception:
                lines = []
            if len(lines) >= 2:
                port = lines[0]
                path = lines[1]
                if path.startswith("/"):
                    return f"ws://127.0.0.1:{port}{path}"
                return f"ws://127.0.0.1:{port}/{path}"
        time.sleep(0.2)
    return ""


def resolve_live_cdp_endpoint(port: str, user_data_dir: Path, timeout_sec: float = 10.0) -> str:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        ws_endpoint = probe_live_cdp_endpoint(port, timeout_sec=1.0)
        if ws_endpoint:
            return ws_endpoint

        ws_endpoint = read_devtools_active_port(user_data_dir, timeout_sec=0.2)
        if ws_endpoint and is_cdp_endpoint_live(ws_endpoint, timeout_sec=1.0):
            return ws_endpoint

        cached = read_cached_cdp_endpoint()
        if cached and is_cdp_endpoint_live(cached, timeout_sec=1.0):
            return cached

        time.sleep(0.2)
    return ""


def launch_and_wait_for_cdp(port: str, user_data_dir: Path) -> tuple[subprocess.Popen[str], str]:
    proc = launch_chrome(user_data_dir=user_data_dir)
    ws_endpoint = resolve_live_cdp_endpoint(port, user_data_dir)
    if not ws_endpoint:
        ws_endpoint = capture_devtools_ws_endpoint(proc)
        if ws_endpoint and not is_cdp_endpoint_live(ws_endpoint, timeout_sec=1.0):
            ws_endpoint = ""
    return proc, ws_endpoint


def verify(page) -> tuple[bool, str]:
    try:
        markers = ensure_home_login_ready(page, eval_js)
    except Exception as exc:  # noqa: BLE001
        return False, f"navigation failed: {exc}"
    if markers["ready"]:
        return True, format_login_markers(markers)
    if markers["has_captcha_text"] or markers["redirected"]:
        return False, f"{format_login_markers(markers)} (complete homepage captcha first)"
    return False, format_login_markers(markers)


def main() -> int:
    port, endpoint = ensure_cdp_env()
    prefer_system_profile = env_flag("SCHOOLMATE_CHROME_USE_SYSTEM_PROFILE", False)
    user_data_dir = resolve_chrome_user_data_dir(use_system=prefer_system_profile)
    profile_directory = resolve_chrome_profile_directory()
    dedicated_user_data_dir = resolve_chrome_user_data_dir(use_system=False)

    print("=" * 56)
    print("XHS Login via Real Chrome + CDP")
    print("=" * 56)
    print(f"CDP endpoint: {endpoint}")
    print(f"Chrome user data dir: {user_data_dir}")
    print(f"Chrome profile directory: {profile_directory}")
    print(f"Verification page: {HOME_URL}")
    print()
    print("Please close other Chrome windows first.")
    print("Then a CDP-enabled Chrome window will open with the profile above.")
    print("Complete login and any captcha there, then return here.")
    print()

    existing_ws_endpoint = probe_live_cdp_endpoint(port, timeout_sec=1.0)
    proc: subprocess.Popen[str] | None = None
    if existing_ws_endpoint:
        ws_endpoint = existing_ws_endpoint
        print("[INFO] Reusing an already-running Chrome remote debugging instance.")
    else:
        try:
            proc, ws_endpoint = launch_and_wait_for_cdp(port, user_data_dir)
        except Exception as exc:  # noqa: BLE001
            print(f"[FAIL] Could not launch Chrome on port {port}: {exc}")
            return 1

        if not ws_endpoint and prefer_system_profile:
            exit_code = proc.poll()
            print("[WARN] Chrome could not start a live CDP service with the system profile.")
            if exit_code is not None:
                print(f"[WARN] The system-profile Chrome process exited early with code {exit_code}.")
            print(f"[INFO] Retrying with an isolated Chrome profile: {dedicated_user_data_dir}")
            print("[INFO] This avoids Chrome handing the launch over to an already-running non-CDP instance.")
            stop_process(proc)
            clear_cached_cdp_endpoint()
            try:
                proc, ws_endpoint = launch_and_wait_for_cdp(port, dedicated_user_data_dir)
                user_data_dir = dedicated_user_data_dir
                profile_directory = "Default"
            except Exception as exc:  # noqa: BLE001
                print(f"[FAIL] Could not launch fallback Chrome profile on port {port}: {exc}")
                return 1

    if ws_endpoint:
        persist_cdp_endpoint(ws_endpoint)
        os.environ["SCHOOLMATE_CDP_ENDPOINT"] = ws_endpoint
        endpoint = ws_endpoint

    time.sleep(3)
    page = None
    try:
        attempt = 0
        if ws_endpoint:
            print(f"Detected DevTools websocket endpoint: {ws_endpoint}")
            print(f"Cached endpoint at: {CDP_ENDPOINT_CACHE_PATH}")
            print()
        else:
            print("[WARN] Could not find a live Chrome DevTools endpoint on 127.0.0.1:9222.")
            print("This usually means Chrome is not actually listening on that port yet, or a stale DevToolsActivePort file was detected.")
            print()
        while True:
            attempt += 1
            try:
                input(f">>> Attempt {attempt}: press Enter after login/captcha is complete... ")
            except (EOFError, KeyboardInterrupt):
                print("\nCancelled.")
                return 1

            if proc is not None:
                exit_code = proc.poll()
            else:
                exit_code = None
            if proc is not None and exit_code is not None:
                print(f"[WARN] The Chrome process started by this script has already exited (code {exit_code}).")
                print("This usually means the debug window was closed, or Chrome reused another instance/profile.")
                print("Close all Chrome windows and run this script again before retrying.")

            try:
                page = new_page(headless=False)
            except Exception as exc:  # noqa: BLE001
                print(f"[FAIL] Could not attach to Chrome via CDP: {exc}")
                print("Make sure the dedicated Chrome window is still open.")
                continue

            ok, info = verify(page)
            close(page)
            page = None

            if ok:
                print("[OK] Login verified. Future collection will attach to this Chrome instance via CDP.")
                print("Keep using the same Chrome profile for Xiaohongshu collection.")
                return 0

            print(f"[RETRY] Login not usable yet: {info}")
            print("Complete login/captcha in Chrome, then try again.")
    finally:
        if page is not None:
            close(page)


if __name__ == "__main__":
    raise SystemExit(main())
