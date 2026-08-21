"""Configuration management for the archive CLI.

Stores the API URL and tenant API key in a local JSON file so the user
doesn't have to pass them with every command.
"""

import json
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".archive"
CONFIG_FILE = CONFIG_DIR / "config.json"


def save_config(api_url: str, api_key: str) -> None:
    """Create or update the local configuration file."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    data = {"api_url": api_url.rstrip("/"), "api_key": api_key}
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    # Restrict permissions since this file holds a secret API key.
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except OSError:
        pass


def load_config() -> dict:
    """Load the local configuration file, raising a clear error if missing."""
    if not CONFIG_FILE.exists():
        raise FileNotFoundError(
            "No configuration found. Run 'archive configure --api-url <url> "
            "--api-key <key>' first."
        )
    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        return json.load(f)
