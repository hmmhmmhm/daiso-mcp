from __future__ import annotations

import html
import re
import time
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from .config import API_BASE_URL, CDN_BASE_URL, SSN_BASE_URL, WEB_BASE_URL

IMG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
CTGR_RE = re.compile(r"CTGR_\d+")
PDNO_RE = re.compile(r"(?:pdNo=|/)(\d{6,})")


class DaisoClient:
    def __init__(self, timeout: int = 25, delay: float = 0.2) -> None:
        self.timeout = timeout
        self.delay = delay
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
                ),
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                "Origin": WEB_BASE_URL,
                "Referer": WEB_BASE_URL + "/ds",
            }
        )

    def get_json(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        res = self.session.get(url, params=params, timeout=self.timeout)
        res.raise_for_status()
        self._sleep()
        return res.json()

    def post_json(self, path_or_url: str, payload: Any) -> dict[str, Any]:
        url = path_or_url if path_or_url.startswith("http") else API_BASE_URL + path_or_url
        res = self.session.post(url, json=payload, timeout=self.timeout)
        res.raise_for_status()
        self._sleep()
        return res.json()

    def find_products(
        self,
        source: str,
        page: int = 1,
        page_size: int = 30,
        sort: str = "order",
    ) -> tuple[list[dict[str, Any]], int]:
        source = source.strip()
        pd_no = extract_pd_no(source)
        if pd_no:
            return ([{"pdNo": pd_no}], 1)
        if "/ds/exhCtgr/" in source or "CTGR_" in source:
            codes = extract_category_codes(source)
            return self.find_category_products(codes, page, page_size, sort)
        return self.search_products(source, page, page_size)

    def find_category_products(
        self,
        codes: list[str],
        page: int = 1,
        page_size: int = 30,
        sort: str = "order",
    ) -> tuple[list[dict[str, Any]], int]:
        if not codes:
            raise ValueError("카테고리 코드(CTGR_...)를 찾지 못했습니다.")
        params = {
            "largeExhCtgrNo": codes[0],
            "pageNum": page,
            "cntPerPage": page_size,
            "searchSort": sort,
            "soldOutYn": "N",
            "isCategory": "1",
        }
        if len(codes) >= 2:
            params["middleExhCtgrNo"] = codes[1]
        if len(codes) >= 3:
            params["smallExhCtgrNo"] = codes[2]
        data = self.get_json(f"{SSN_BASE_URL}/GoodsCategorySmall", params=params)
        return extract_documents(data)

    def search_products(self, keyword: str, page: int = 1, page_size: int = 30) -> tuple[list[dict[str, Any]], int]:
        params = {"searchTerm": keyword, "pageNum": page, "cntPerPage": page_size}
        data = self.get_json(f"{SSN_BASE_URL}/FindStoreGoods", params=params)
        return extract_documents(data)

    def fetch_detail(self, pd_no: str) -> dict[str, Any]:
        info = self.post_json("/pd/pdr/pdDtl/selPdDtlInfo", {"pdNo": pd_no})
        desc = self.post_json("/pd/pdr/pdDtl/selPdDtlDesc", {"pdNo": pd_no})
        ntfc = self.post_json("/pd/pdr/pdDtl/selPdDtlNtfc", {"pdNo": pd_no})
        attr = self.post_json("/pd/pdr/pdDtl/selPdAttr", {"pdNo": pd_no})
        return {
            "info": info.get("data") or {},
            "desc": desc.get("data") or {},
            "notice": ntfc.get("data") or [],
            "attributes": attr.get("data") or [],
        }

    def _sleep(self) -> None:
        if self.delay > 0:
            time.sleep(self.delay)


def extract_category_codes(source: str) -> list[str]:
    parsed = urlparse(source)
    text = parsed.path + " " + parsed.query + " " + source
    return CTGR_RE.findall(text)


def extract_pd_no(source: str) -> str | None:
    parsed = urlparse(source)
    query_pd = parse_qs(parsed.query).get("pdNo")
    if query_pd and query_pd[0].isdigit():
        return query_pd[0]
    match = PDNO_RE.search(source)
    return match.group(1) if match else None


def full_image_url(path: str | None, resize: int | None = None) -> str:
    if not path:
        return ""
    value = html.unescape(str(path))
    if value.startswith("//"):
        value = "https:" + value
    elif value.startswith("/"):
        value = CDN_BASE_URL + value
    if resize and "/dims/" not in value:
        value = f"{value}/dims/resize/{resize}/quality/90"
    return value


def extract_documents(data: dict[str, Any]) -> tuple[list[dict[str, Any]], int]:
    result = ((data.get("resultSet") or {}).get("result") or [])
    best_docs: list[dict[str, Any]] = []
    best_total = 0
    for item in result:
        docs = item.get("resultDocuments") or []
        total = int(item.get("totalSize") or len(docs) or 0)
        if docs and len(docs) >= len(best_docs):
            best_docs = docs
            best_total = total
    return best_docs, best_total


def extract_detail_images(desc_data: dict[str, Any]) -> list[str]:
    detail = (desc_data.get("pdDtlDesc") or {}).get("pdDtlDc") or ""
    decoded = html.unescape(detail)
    return [full_image_url(src) for src in IMG_RE.findall(decoded)]
