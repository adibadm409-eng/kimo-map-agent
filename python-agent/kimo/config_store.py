"""Provider-settings persistence for the new engine.

Mirrors the old RN ``AgentSettings`` screen's data model but stores it as a
plain JSON file the Python engine reads at startup (``resolve_settings``).
No third-party dependencies.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict
from typing import Optional

from .config import AgentSettings, default_provider, list_providers

DEFAULT_PATH = os.path.join(os.getcwd(), "kimo_config.json")


def _default_path() -> str:
    # Prefer a project-local file; fall back to a user config dir.
    local = DEFAULT_PATH
    if os.path.exists(local) or os.access(os.path.dirname(local) or ".", os.W_OK):
        return local
    user_dir = os.path.join(os.path.expanduser("~"), ".config", "kimo")
    os.makedirs(user_dir, exist_ok=True)
    return os.path.join(user_dir, "config.json")


def load_settings(path: Optional[str] = None) -> AgentSettings:
    path = path or _default_path()
    if not os.path.exists(path):
        return AgentSettings()
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        valid = {k: v for k, v in data.items() if k in AgentSettings.__dataclass_fields__}
        return AgentSettings(**valid)
    except (json.JSONDecodeError, OSError):
        return AgentSettings()


def save_settings(settings: AgentSettings, path: Optional[str] = None) -> str:
    path = path or _default_path()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(asdict(settings), f, ensure_ascii=False, indent=2)
    return path


def resolve_settings(path: Optional[str] = None) -> AgentSettings:
    """Config file first, then environment overrides (env wins)."""
    s = load_settings(path)
    env_provider = os.environ.get("KIMO_PROVIDER")
    env_model = os.environ.get("KIMO_MODEL")
    env_key = os.environ.get("KIMO_API_KEY")
    if env_provider:
        s.provider_id = env_provider
        s.provider_name = None
    if env_model:
        s.model = env_model
    if env_key:
        s.api_key = env_key
    if not s.model:
        s.model = (default_provider(s.provider_id).default_models or ["gpt-4o-mini"])[0]
    return s


def providers_catalog() -> list[dict[str, Any]]:
    return list_providers()
