from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

APP_NAME = "다이소몰 엑셀 크롤러"
CDN_BASE_URL = "https://cdn.daisomall.co.kr"
WEB_BASE_URL = "https://www.daisomall.co.kr"
API_BASE_URL = f"{WEB_BASE_URL}/api"
SSN_BASE_URL = f"{WEB_BASE_URL}/ssn/search"
DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "openai/gpt-4o-mini"
DEFAULT_SOURCE_URL = "https://www.daisomall.co.kr/ds/exhCtgr/C208/CTGR_01050"


@dataclass
class AiConfig:
    enabled: bool = False
    api_key: str = ""
    endpoint: str = DEFAULT_ENDPOINT
    model: str = DEFAULT_MODEL


def load_dotenv(path: str | Path = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def ai_config_from_env(enabled: bool = False) -> AiConfig:
    return AiConfig(
        enabled=enabled,
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        endpoint=os.environ.get("OPENROUTER_ENDPOINT", DEFAULT_ENDPOINT),
        model=os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL),
    )


def load_app_env() -> None:
    candidates = [Path.cwd() / ".env", Path.cwd() / ".env.local"]
    try:
        app_dir = Path(__file__).resolve().parents[2]
        candidates.extend([app_dir / ".env", app_dir / ".env.local"])
    except Exception:
        pass
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        load_dotenv(candidate)
