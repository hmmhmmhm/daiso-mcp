from __future__ import annotations

import argparse
from pathlib import Path

from .config import DEFAULT_SOURCE_URL, ai_config_from_env, load_app_env
from .crawler import crawl_to_excel


def main() -> int:
    parser = argparse.ArgumentParser(description="다이소몰 상품 정보를 엑셀로 저장합니다.")
    parser.add_argument("--source", default=DEFAULT_SOURCE_URL, help="카테고리 URL, 상품 URL, 또는 검색어")
    parser.add_argument("--output", default="desktop/outputs/daiso_result.xlsx", help="저장할 엑셀 경로")
    parser.add_argument("--limit", type=int, default=0, help="최대 수집 상품 수(0=전체)")
    parser.add_argument("--page-size", type=int, default=500, help="목록 페이지 크기")
    parser.add_argument("--ai", action="store_true", help="OpenRouter 이미지 AI 추출 사용")
    parser.add_argument("--workers", type=int, default=8, help="동시 상세 수집 개수")
    args = parser.parse_args()

    load_app_env()
    ai_config = ai_config_from_env(enabled=args.ai)
    output = crawl_to_excel(
        source=args.source,
        output_path=Path(args.output),
        limit=args.limit,
        page_size=args.page_size,
        ai_config=ai_config,
        log=lambda msg: print(msg, flush=True),
        workers=args.workers,
    )
    print(f"저장 완료: {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
