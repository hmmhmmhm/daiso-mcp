from __future__ import annotations

import html
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable

from .ai import OpenRouterExtractor
from .client import DaisoClient, extract_detail_images, full_image_url
from .config import AiConfig, WEB_BASE_URL
from .excel import export_products

LogFn = Callable[[str], None]
StopFn = Callable[[], bool]


class CrawlStopped(RuntimeError):
    """Raised internally when the user stops the crawl."""


def crawl_products(
    source: str,
    limit: int = 0,
    page_size: int = 500,
    ai_config: AiConfig | None = None,
    log: LogFn | None = None,
    should_stop: StopFn | None = None,
    workers: int = 8,
) -> list[dict[str, Any]]:
    if page_size <= 0:
        raise ValueError("페이지 크기는 1 이상이어야 합니다.")

    client = DaisoClient()
    ai = OpenRouterExtractor(ai_config or AiConfig())
    target_limit = limit if limit > 0 else None
    items: list[tuple[dict[str, Any], str]] = []
    seen: set[str] = set()
    page = 1
    total = 0

    while target_limit is None or len(items) < target_limit:
        check_stop(should_stop)
        docs, total = client.find_products(source, page=page, page_size=page_size)
        if not docs:
            break
        write_log(log, f"목록 {page}페이지 수신: {len(docs)}개")
        for doc in docs:
            pd_no = product_number_from_doc(doc)
            if not pd_no or pd_no in seen:
                continue
            seen.add(pd_no)
            items.append((doc, pd_no))
            if target_limit is not None and len(items) >= target_limit:
                break
        if (target_limit is not None and len(items) >= target_limit) or (total and page * page_size >= total):
            break
        page += 1

    write_log(log, f"상세 수집 대상: {len(items)}개")
    products = build_products(items, ai=ai, log=log, should_stop=should_stop, workers=workers)
    write_log(log, f"수집 완료: {len(products)}개")
    return products


def crawl_to_excel(
    source: str,
    output_path: str | Path,
    limit: int = 0,
    page_size: int = 500,
    ai_config: AiConfig | None = None,
    log: LogFn | None = None,
    should_stop: StopFn | None = None,
    workers: int = 8,
) -> Path:
    products = crawl_products(
        source=source,
        limit=limit,
        page_size=page_size,
        ai_config=ai_config,
        log=log,
        should_stop=should_stop,
        workers=workers,
    )
    if not products:
        raise RuntimeError("수집된 상품이 없습니다.")
    write_log(log, "엑셀 파일 생성 중...")
    return export_products(products, output_path, log=log)


def build_products(
    items: list[tuple[dict[str, Any], str]],
    ai: OpenRouterExtractor,
    log: LogFn | None = None,
    should_stop: StopFn | None = None,
    workers: int = 8,
) -> list[dict[str, Any]]:
    if not items:
        return []
    if ai.enabled():
        workers = min(max(workers, 1), 2)
    else:
        workers = max(workers, 1)
    products: list[dict[str, Any] | None] = [None] * len(items)
    if workers == 1:
        client = DaisoClient()
        for idx, (doc, pd_no) in enumerate(items):
            check_stop(should_stop)
            try:
                products[idx] = build_product(client, doc, pd_no, ai=ai, log=log, should_stop=should_stop)
            except Exception as exc:
                write_log(log, f"상품 {pd_no} 실패: {exc}")
        return [product for product in products if product]

    def task(item: tuple[int, dict[str, Any], str]) -> tuple[int, dict[str, Any]]:
        idx, doc, pd_no = item
        check_stop(should_stop)
        worker_client = DaisoClient()
        return idx, build_product(worker_client, doc, pd_no, ai=ai, log=log, should_stop=should_stop)

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(task, (idx, doc, pd_no)) for idx, (doc, pd_no) in enumerate(items)]
        for future in as_completed(futures):
            check_stop(should_stop)
            try:
                idx, product = future.result()
                products[idx] = product
            except Exception as exc:
                write_log(log, f"상품 수집 실패: {exc}")
    return [product for product in products if product]


def build_product(
    client: DaisoClient,
    doc: dict[str, Any],
    pd_no: str,
    ai: OpenRouterExtractor,
    log: LogFn | None = None,
    should_stop: StopFn | None = None,
) -> dict[str, Any]:
    write_log(log, f"상세 수집: {pd_no}")
    detail = client.fetch_detail(pd_no)
    info = detail.get("info") or {}
    desc = detail.get("desc") or {}
    notice = detail.get("notice") or []
    attrs = detail.get("attributes") or []
    detail_images = extract_detail_images(desc)
    product = normalize_product(doc, info, pd_no, detail_images, notice, attrs)

    if ai.enabled() and detail_images:
        check_stop(should_stop)
        try:
            write_log(log, f"AI 이미지 추출: {pd_no}")
            product["ai_notice"] = ai.extract_notice(product.get("name") or pd_no, detail_images)
        except Exception as exc:
            product["ai_notice"] = {}
            write_log(log, f"AI 추출 실패({pd_no}): {exc}")
    return product


def normalize_product(
    doc: dict[str, Any],
    info: dict[str, Any],
    pd_no: str,
    detail_images: list[str],
    notice: list[Any],
    attrs: list[Any],
) -> dict[str, Any]:
    categories = pick_categories(doc, info)
    image_url = full_image_url(
        clean_text(first_value(info, "imgUrl"))
        or clean_text(first_value(doc, "pdImgUrl", "ATCH_FILE_URL", "IMG_URL")),
        resize=300,
    )
    return {
        "pd_no": pd_no,
        "name": clean_text(first_value(info, "exhPdNm", "pdNm"))
        or clean_text(first_value(doc, "exhPdNm", "pdNm", "PDNM", "EXH_PD_NM")),
        "price": first_value(info, "pdPrc") or first_value(doc, "pdPrc", "PD_PRC"),
        "brand": clean_text(first_value(info, "brndNm")) or clean_text(first_value(doc, "brndNm", "BRND_NM")),
        "rating": first_value(info, "revwAvg") or first_value(doc, "avgStscVal", "revwStsc", "REVW_STSC"),
        "review_count": first_value(info, "revwCnt") or first_value(doc, "revwCnt", "REVW_CNT"),
        "stock": first_value(info, "stckQy") or first_value(doc, "ONL_STCK_QY", "totOrQy"),
        "large_category": categories[0],
        "middle_category": categories[1],
        "small_category": categories[2],
        "image_url": image_url,
        "product_url": f"{WEB_BASE_URL}/pd/pdr/SCR_PDR_0001?pdNo={pd_no}",
        "detail_image_urls": detail_images,
        "notice_text": notice_text(notice),
        "attributes_text": attributes_text(attrs),
        "raw_keywords": clean_text(first_value(doc, "keywdCn", "KEYWD_CN")),
    }


def product_number_from_doc(doc: dict[str, Any]) -> str:
    pd_no = clean_text(first_value(doc, "pdNo", "PD_NO", "pd_no"))
    if pd_no and pd_no.isdigit():
        return pd_no
    for key in ("MASTER_PD_NO", "MAPP_BOX_PD_NO", "masterPdNo", "mappBoxPdNo"):
        candidate = clean_text(first_value(doc, key))
        if candidate and candidate.isdigit() and candidate != "0":
            return candidate
    return pd_no


def first_value(mapping: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in mapping and mapping[key] not in (None, ""):
            return mapping[key]
    return ""


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(html.unescape(str(value)).split())


def pick_categories(doc: dict[str, Any], info: dict[str, Any]) -> tuple[str, str, str]:
    large = clean_text(first_value(doc, "exhLargeCtgrNm", "EXH_LARGE_CTGR_NM")) or clean_text(first_value(info, "onlLclNm"))
    middle = clean_text(first_value(doc, "exhMiddleCtgrNm", "EXH_MIDDLE_CTGR_NM"))
    small = clean_text(first_value(doc, "exhSmallCtgrNm", "EXH_SMALL_CTGR_NM"))
    ctgr = info.get("exhCtgr") or []
    if isinstance(ctgr, list):
        for item in ctgr:
            if not isinstance(item, dict):
                continue
            large = large or clean_text(first_value(item, "exhLargeCtgrNm", "largeCtgrNm", "lclNm"))
            middle = middle or clean_text(first_value(item, "exhMiddleCtgrNm", "middleCtgrNm", "mclNm"))
            small = small or clean_text(first_value(item, "exhSmallCtgrNm", "smallCtgrNm", "sclNm"))
    return large, middle, small


def notice_text(notice: list[Any]) -> str:
    rows: list[str] = []
    for item in notice:
        if not isinstance(item, dict):
            continue
        name = clean_text(first_value(item, "ntfcIemNm", "iemNm", "name"))
        value = clean_text(first_value(item, "ntfcIemCn", "iemCn", "value"))
        if name or value:
            rows.append(f"{name}: {value}" if name else value)
    return "\n".join(rows)


def attributes_text(attrs: list[Any]) -> str:
    groups: dict[str, list[str]] = {}
    for item in attrs:
        if not isinstance(item, dict):
            continue
        group = clean_text(first_value(item, "attrnm", "attrNm", "ATTR_NM")) or "속성"
        name = clean_text(first_value(item, "attriemnm", "attrIemNm", "ATTR_IEM_NM"))
        if name:
            groups.setdefault(group, [])
            if name not in groups[group]:
                groups[group].append(name)
    return "\n".join(f"{group}: {', '.join(values)}" for group, values in groups.items())


def write_log(log: LogFn | None, message: str) -> None:
    if log:
        log(message)


def check_stop(should_stop: StopFn | None) -> None:
    if should_stop and should_stop():
        raise CrawlStopped("사용자가 중지했습니다.")
