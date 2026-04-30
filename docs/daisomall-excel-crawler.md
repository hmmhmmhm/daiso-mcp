# 다이소몰 엑셀 크롤러

Windows용 Tkinter/PyInstaller 프로그램으로 다이소몰 상품 목록과 상세 정보를 수집해 엑셀 파일로 저장한다.

## 범위

- 입력: 다이소몰 뷰티/위생 전체 카테고리 URL, 하위 카테고리 URL, 상품 URL, 또는 검색어
- 출력: `.xlsx`
- 대표 이미지는 엑셀 셀에 삽입
- 상세 이미지 URL, 상품정보고시, 주요 속성, 가격/평점/리뷰/재고 등 저장
- 상세 이미지 OCR/추출은 OpenRouter 호환 Chat Completions API로 선택 실행
- Windows UI의 AI 기능은 기본 비활성화

## 확인한 다이소몰 엔드포인트

- 카테고리 목록: `GET /ssn/search/GoodsCategorySmall`
  - 예: `largeExhCtgrNo=CTGR_01050&middleExhCtgrNo=CTGR_01051&smallExhCtgrNo=CTGR_01065&pageNum=1&cntPerPage=30`
- 검색 목록: `GET /ssn/search/FindStoreGoods?searchTerm=...`
- 상품 상세: `POST /api/pd/pdr/pdDtl/selPdDtlInfo` with `{"pdNo":"..."}`
- 상세 HTML/이미지: `POST /api/pd/pdr/pdDtl/selPdDtlDesc`
- 상품정보고시: `POST /api/pd/pdr/pdDtl/selPdDtlNtfc`
- 주요 속성: `POST /api/pd/pdr/pdDtl/selPdAttr`

## 로컬 실행

```bash
cd desktop
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. python -m daiso_excel_crawler.cli --limit 5 --output outputs/sample.xlsx
# 전체 뷰티/위생 카테고리: --limit 0
PYTHONPATH=. python -m daiso_excel_crawler.cli --limit 0 --output outputs/daiso_beauty_all.xlsx
```

GUI 실행:

```bash
cd desktop
PYTHONPATH=. python main.py
```

## AI 옵션

OpenRouter API는 OpenAI Chat Completions와 유사한 스키마를 사용하며 기본 엔드포인트는 다음과 같다.

```text
https://openrouter.ai/api/v1/chat/completions
```

환경 파일은 커밋하지 않는다. 로컬에서만 `.env.local` 또는 UI 입력을 사용한다.

```bash
OPENROUTER_API_KEY=...
OPENROUTER_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
OPENROUTER_MODEL=openai/gpt-4o-mini
```

CLI에서 AI를 켜려면:

```bash
PYTHONPATH=. python -m daiso_excel_crawler.cli --ai --limit 5 --output outputs/ai_sample.xlsx
```

## Windows EXE 빌드

GitHub Actions `build-daiso-windows`가 `desktop/dist/DaisoExcelCrawler.exe`를 빌드해 artifact로 업로드한다.

수동 로컬 빌드:

```powershell
cd desktop
python -m pip install -r requirements.txt
pyinstaller --clean --noconfirm daiso_crawler.spec
```
