from __future__ import annotations

import json
import re
from typing import Any

import requests

from .config import AiConfig

JSON_RE = re.compile(r"\{[\s\S]*\}")


class OpenRouterExtractor:
    def __init__(self, config: AiConfig, timeout: int = 60) -> None:
        self.config = config
        self.timeout = timeout

    def enabled(self) -> bool:
        return bool(self.config.enabled and self.config.api_key.strip())

    def extract_notice(self, product_name: str, image_urls: list[str]) -> dict[str, Any]:
        if not self.enabled() or not image_urls:
            return {}
        content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": (
                    "다이소몰 상세 이미지에서 상품 정보 제공 고시 표와 전성분/사용법/주의사항을 "
                    "읽어 JSON으로 정리해 주세요. 보이지 않는 값은 빈 문자열로 두세요. "
                    "JSON 객체만 반환하세요. 필드: 제품명, 용량, 제조국, 사용방법, 전성분, "
                    "주의사항, 소비자상담실, 요약"
                ),
            }
        ]
        for url in image_urls[:6]:
            content.append({"type": "image_url", "image_url": {"url": url}})
        payload = {
            "model": self.config.model,
            "messages": [
                {"role": "system", "content": "You extract Korean product notice data from images."},
                {"role": "user", "content": content},
            ],
            "temperature": 0,
            "max_tokens": 1400,
            "response_format": {"type": "json_object"},
        }
        headers = {
            "Authorization": f"Bearer {self.config.api_key.strip()}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/hmmhmmhm/daiso-mcp",
            "X-OpenRouter-Title": "Daiso Excel Crawler",
        }
        res = requests.post(self.config.endpoint, headers=headers, json=payload, timeout=self.timeout)
        res.raise_for_status()
        message = res.json()["choices"][0]["message"]["content"]
        return parse_json_object(message)


def parse_json_object(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {"요약": str(value)}
    except json.JSONDecodeError:
        match = JSON_RE.search(text)
        if not match:
            return {"요약": text.strip()}
        try:
            value = json.loads(match.group(0))
            return value if isinstance(value, dict) else {"요약": str(value)}
        except json.JSONDecodeError:
            return {"요약": text.strip()}
