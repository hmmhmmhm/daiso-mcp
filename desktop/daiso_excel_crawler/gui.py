from __future__ import annotations

import queue
import threading
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from .config import DEFAULT_ENDPOINT, DEFAULT_MODEL, DEFAULT_SOURCE_URL, AiConfig, load_app_env
from .crawler import CrawlStopped, crawl_to_excel


class DaisoCrawlerApp(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        load_app_env()
        self.title("다이소몰 엑셀 크롤러")
        self.geometry("760x560")
        self.minsize(720, 520)
        self.queue: queue.Queue[tuple[str, str]] = queue.Queue()
        self.worker: threading.Thread | None = None
        self.stop_requested = False

        self.source_var = tk.StringVar(value=DEFAULT_SOURCE_URL)
        self.output_var = tk.StringVar(value=str(default_output_path()))
        self.limit_var = tk.StringVar(value="전체")
        self.ai_enabled_var = tk.BooleanVar(value=False)
        self.api_key_var = tk.StringVar()
        self.endpoint_var = tk.StringVar(value=DEFAULT_ENDPOINT)
        self.model_var = tk.StringVar(value=DEFAULT_MODEL)
        self.status_var = tk.StringVar(value="대기 중")

        self.build_ui()
        self.toggle_ai_fields()
        self.after(100, self.drain_queue)

    def build_ui(self) -> None:
        root = ttk.Frame(self, padding=14)
        root.pack(fill="both", expand=True)
        root.columnconfigure(1, weight=1)
        root.rowconfigure(9, weight=1)

        ttk.Label(root, text="수집 대상").grid(row=0, column=0, sticky="w", pady=4)
        ttk.Entry(root, textvariable=self.source_var).grid(row=0, column=1, columnspan=2, sticky="ew", pady=4)

        ttk.Label(root, text="엑셀 저장").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Entry(root, textvariable=self.output_var).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Button(root, text="위치 선택", command=self.pick_output).grid(row=1, column=2, sticky="ew", padx=(8, 0), pady=4)

        ttk.Label(root, text="상품 수").grid(row=2, column=0, sticky="w", pady=4)
        limit_frame = ttk.Frame(root)
        limit_frame.grid(row=2, column=1, sticky="w", pady=4)
        ttk.Entry(limit_frame, textvariable=self.limit_var, width=10).pack(side="left")
        ttk.Label(limit_frame, text="빈칸/전체=전체").pack(side="left", padx=(6, 0))

        ai_check = ttk.Checkbutton(
            root,
            text="AI 이미지 추출 사용(OpenRouter)",
            variable=self.ai_enabled_var,
            command=self.toggle_ai_fields,
        )
        ai_check.grid(row=3, column=0, columnspan=3, sticky="w", pady=(12, 4))

        ttk.Label(root, text="API 키").grid(row=4, column=0, sticky="w", pady=4)
        self.api_key_entry = ttk.Entry(root, textvariable=self.api_key_var, show="*")
        self.api_key_entry.grid(row=4, column=1, columnspan=2, sticky="ew", pady=4)

        ttk.Label(root, text="엔드포인트").grid(row=5, column=0, sticky="w", pady=4)
        self.endpoint_entry = ttk.Entry(root, textvariable=self.endpoint_var)
        self.endpoint_entry.grid(row=5, column=1, columnspan=2, sticky="ew", pady=4)

        ttk.Label(root, text="모델").grid(row=6, column=0, sticky="w", pady=4)
        self.model_entry = ttk.Entry(root, textvariable=self.model_var)
        self.model_entry.grid(row=6, column=1, columnspan=2, sticky="ew", pady=4)

        button_frame = ttk.Frame(root)
        button_frame.grid(row=7, column=0, columnspan=3, sticky="ew", pady=(12, 8))
        self.start_button = ttk.Button(button_frame, text="시작", command=self.start)
        self.start_button.pack(side="left")
        self.stop_button = ttk.Button(button_frame, text="중지", command=self.stop, state="disabled")
        self.stop_button.pack(side="left", padx=(8, 0))
        ttk.Label(button_frame, textvariable=self.status_var).pack(side="left", padx=(14, 0))

        ttk.Label(root, text="로그").grid(row=8, column=0, columnspan=3, sticky="w")
        self.log_box = tk.Text(root, height=14, wrap="word", state="disabled")
        self.log_box.grid(row=9, column=0, columnspan=3, sticky="nsew")
        scrollbar = ttk.Scrollbar(root, command=self.log_box.yview)
        scrollbar.grid(row=9, column=3, sticky="ns")
        self.log_box.configure(yscrollcommand=scrollbar.set)

    def toggle_ai_fields(self) -> None:
        state = "normal" if self.ai_enabled_var.get() else "disabled"
        for widget in (self.api_key_entry, self.endpoint_entry, self.model_entry):
            widget.configure(state=state)

    def pick_output(self) -> None:
        filename = filedialog.asksaveasfilename(
            title="엑셀 저장 위치",
            defaultextension=".xlsx",
            filetypes=[("Excel 파일", "*.xlsx")],
            initialfile=Path(self.output_var.get()).name,
        )
        if filename:
            self.output_var.set(filename)

    def start(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        try:
            raw_limit = self.limit_var.get().strip()
            limit = 0 if raw_limit in ("", "전체", "all", "ALL") else int(raw_limit)
            if limit < 0:
                raise ValueError
        except ValueError:
            messagebox.showerror("입력 오류", "상품 수는 숫자 또는 전체로 입력해 주세요.")
            return
        if self.ai_enabled_var.get() and not self.api_key_var.get().strip():
            messagebox.showerror("입력 오류", "AI 사용 시 OpenRouter API 키를 입력해 주세요.")
            return

        self.stop_requested = False
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.status_var.set("실행 중")
        self.clear_log()
        self.worker = threading.Thread(target=self.run_worker, args=(limit,), daemon=True)
        self.worker.start()

    def stop(self) -> None:
        self.stop_requested = True
        self.status_var.set("중지 요청 중")

    def run_worker(self, limit: int) -> None:
        try:
            ai_config = AiConfig(
                enabled=self.ai_enabled_var.get(),
                api_key=self.api_key_var.get(),
                endpoint=self.endpoint_var.get().strip() or DEFAULT_ENDPOINT,
                model=self.model_var.get().strip() or DEFAULT_MODEL,
            )
            output = crawl_to_excel(
                source=self.source_var.get().strip(),
                output_path=self.output_var.get().strip(),
                limit=limit,
                ai_config=ai_config,
                log=lambda msg: self.queue.put(("log", msg)),
                should_stop=lambda: self.stop_requested,
                workers=8,
            )
            self.queue.put(("done", str(output)))
        except CrawlStopped as exc:
            self.queue.put(("stopped", str(exc)))
        except Exception as exc:
            self.queue.put(("error", str(exc)))

    def drain_queue(self) -> None:
        try:
            while True:
                kind, msg = self.queue.get_nowait()
                if kind == "log":
                    self.write_log(msg)
                elif kind == "done":
                    self.write_log(f"완료: {msg}")
                    self.status_var.set("완료")
                    self.finish_buttons()
                    messagebox.showinfo("완료", f"엑셀 저장 완료\n{msg}")
                elif kind == "stopped":
                    self.write_log(msg)
                    self.status_var.set("중지됨")
                    self.finish_buttons()
                elif kind == "error":
                    self.write_log(f"오류: {msg}")
                    self.status_var.set("오류")
                    self.finish_buttons()
                    messagebox.showerror("오류", msg)
        except queue.Empty:
            pass
        self.after(100, self.drain_queue)

    def finish_buttons(self) -> None:
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")

    def clear_log(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

    def write_log(self, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")


def default_output_path() -> Path:
    desktop = Path.home() / "Desktop"
    base = desktop if desktop.exists() else Path.cwd()
    return base / "daiso_result.xlsx"


def main() -> None:
    app = DaisoCrawlerApp()
    app.mainloop()
