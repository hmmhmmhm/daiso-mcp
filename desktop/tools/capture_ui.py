from __future__ import annotations

import sys
import time
from pathlib import Path

from PIL import ImageGrab

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from daiso_excel_crawler.gui import DaisoCrawlerApp  # noqa: E402


def main() -> int:
    output = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "outputs" / "ui-screenshot.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    app = DaisoCrawlerApp()
    app.status_var.set("대기 중")
    app.update_idletasks()
    app.update()
    try:
        app.attributes("-topmost", True)
    except Exception:
        pass
    time.sleep(1)
    app.update_idletasks()
    app.update()
    x = app.winfo_rootx()
    y = app.winfo_rooty()
    width = app.winfo_width()
    height = app.winfo_height()
    image = ImageGrab.grab(bbox=(x, y, x + width, y + height))
    image.save(output)
    app.destroy()
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
