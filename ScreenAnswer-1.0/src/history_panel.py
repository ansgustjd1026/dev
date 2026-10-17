"""Date-indexed API history inside the settings window; network work off Tk."""
import base64
import os
import queue
import threading
import tkinter as tk
from tkinter import ttk

from credentials import protect
from history import HistoryIndex, retrieve


class HistoryPanel(ttk.Frame):
    def __init__(self, parent, app):
        super().__init__(parent)
        self.app = app
        self.index = HistoryIndex()
        self.jobs, self.results = queue.Queue(maxsize=1), queue.Queue(maxsize=1)
        self.closed = threading.Event()
        self.serial = 0
        self.rows = {}
        self.columnconfigure(0, weight=1)
        self.rowconfigure(4, weight=1)
        self.rowconfigure(6, weight=2)
        toolbar = ttk.Frame(self)
        toolbar.grid(row=0, column=0, sticky='ew', pady=6)
        ttk.Label(toolbar, text='날짜').pack(side='left')
        self.day = ttk.Combobox(toolbar, state='readonly', width=13)
        self.day.pack(side='left', padx=6)
        self.day.bind('<<ComboboxSelected>>', lambda _: self.load_day())
        ttk.Button(toolbar, text='새로고침', command=self.reload).pack(side='right')
        ttk.Label(self, text='업데이트 이후 기록 · 서버 기본 보관 30일\n날짜·응답 ID는 PC에, 원문·답변은 API에 보관합니다.',
                  wraplength=340).grid(row=1, column=0, sticky='w')
        listing = ttk.Frame(self)
        listing.grid(row=2, column=0, sticky='ew', pady=5)
        self.tree = ttk.Treeview(listing, columns=('time', 'task', 'kind'), show='headings', height=4)
        for name, title, width in (('time', '시간', 75), ('task', '작업', 90), ('kind', '입력', 55)):
            self.tree.heading(name, text=title)
            self.tree.column(name, width=width, minwidth=40)
        scroll = ttk.Scrollbar(listing, command=self.tree.yview)
        scroll.pack(side='right', fill='y')
        self.tree.configure(yscrollcommand=scroll.set)
        self.tree.pack(fill='both', expand=True)
        self.tree.bind('<<TreeviewSelect>>', self.select)
        self.status = ttk.Label(self, text='', wraplength=340)
        self.status.grid(row=7, column=0, sticky='ew', pady=4)
        self.views = []
        for row, title in ((3, '전송 원문'), (5, '답변')):
            ttk.Label(self, text=title).grid(row=row, column=0, sticky='w')
            body = ttk.Frame(self)
            body.grid(row=row+1, column=0, sticky='nsew')
            bar = ttk.Scrollbar(body)
            bar.pack(side='right', fill='y')
            view = tk.Text(body, wrap='word', width=30, height=4, font=('Malgun Gothic', 10),
                           yscrollcommand=bar.set, padx=8, pady=8, state='disabled')
            view.pack(fill='both', expand=True)
            bar.configure(command=view.yview)
            self.views.append(view)
        self.bind('<Destroy>', self.stop)
        threading.Thread(target=self.worker, daemon=True).start()
        self.job = self.after(100, self.poll)
        self.reload()

    def show(self, source='', answer=''):
        for view, value in zip(self.views, (source, answer)):
            view.configure(state='normal')
            view.delete('1.0', 'end')
            view.insert('1.0', value)
            view.configure(state='disabled')

    def reload(self):
        try:
            days = self.index.days()
            previous = self.day.get()
            self.day.configure(values=days)
            self.day.set(previous if previous in days else days[0] if days else '')
            self.load_day()
        except Exception:
            self.status.configure(text='날짜별 기록 목록을 읽을 수 없습니다.')

    def load_day(self):
        self.serial += 1
        self.show()
        self.tree.delete(*self.tree.get_children())
        self.rows = {}
        try:
            for row in self.index.entries(self.day.get()):
                self.rows[row['id']] = row
                self.tree.insert('', 'end', iid=row['id'],
                                 values=(row['clock'], row['task'], '텍스트' if row['kind'] == 'text' else '화면'))
            self.status.configure(text='기록을 선택하면 API에서 가져옵니다.' if self.rows else
                                  '저장된 기록이 없습니다. 새 요청부터 기록됩니다.')
        except Exception:
            self.status.configure(text='기록 목록을 읽을 수 없습니다.')

    def select(self, _=None):
        selected = self.tree.selection()
        if not selected or selected[0] not in self.rows:
            return
        self.serial += 1
        self.show()
        try:
            key = os.environ.get('OPENAI_API_KEY', '').strip()
            if not key and self.app.settings.get('key'):
                key = protect(base64.b64decode(self.app.settings['key']), True).decode('utf-8')
            if not key:
                raise ValueError()
        except Exception:
            self.status.configure(text='설정에 저장된 API 키를 확인해 주세요.')
            return
        try:
            self.jobs.get_nowait()
        except queue.Empty:
            pass
        self.jobs.put_nowait((self.serial, self.rows[selected[0]], key))
        self.status.configure(text='API에서 기록을 불러오는 중입니다…')

    def worker(self):
        while not self.closed.is_set():
            try:
                serial, row, key = self.jobs.get(timeout=.2)
            except queue.Empty:
                continue
            try:
                values, error = retrieve(row['id'], key, row['kind']), ''
            except Exception as exc:
                values, error = ('', ''), str(exc) if isinstance(exc, ValueError) else '기록 조회에 실패했습니다.'
            finally:
                key = None
            if self.closed.is_set():
                return
            try:
                self.results.get_nowait()
            except queue.Empty:
                pass
            self.results.put_nowait((serial, values, error))

    def poll(self):
        try:
            serial, values, error = self.results.get_nowait()
            if serial == self.serial:
                self.show(*values)
                self.status.configure(text=error or 'API에서 가져왔습니다.')
        except queue.Empty:
            pass
        self.job = self.after(100, self.poll)

    def stop(self, event):
        if event.widget == self:
            self.closed.set()
            self.after_cancel(self.job)
            for pending in (self.jobs, self.results):
                try:
                    pending.get_nowait()
                except queue.Empty:
                    pass
