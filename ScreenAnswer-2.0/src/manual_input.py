"""A reusable question window; hiding it retains the draft and current answer."""
import tkinter as tk
from tkinter import ttk
from tkinter.scrolledtext import ScrolledText


class ManualInput:
    def __init__(self, root, submit, visibility_changed):
        self.visibility_changed = visibility_changed
        self.submit = submit
        self.window = tk.Toplevel(root)
        self.window.withdraw()
        self.window.title('ScreenAnswer 2.0 · 질문 입력')
        self.window.geometry('660x560')
        self.window.minsize(420, 340)
        self.window.protocol('WM_DELETE_WINDOW', self.hide)
        self.window.bind('<Escape>', lambda _: self.hide())
        self.window.bind('<Control-Return>', self.send)
        self.window.bind('<Control-KP_Enter>', self.send)
        body = ttk.Frame(self.window, padding=16)
        body.pack(fill='both', expand=True)
        self.task = ttk.Label(body)
        self.task.pack(anchor='w', pady=(0, 8))
        panes = ttk.Panedwindow(body, orient='vertical')
        panes.pack(fill='both', expand=True)
        question = ttk.LabelFrame(panes, text='질문 / 원문', padding=6)
        answer = ttk.LabelFrame(panes, text='답변', padding=6)
        panes.add(question, weight=1)
        panes.add(answer, weight=2)
        self.draft = ScrolledText(question, wrap='word', height=7, undo=True,
                                  font=('Malgun Gothic', 11))
        self.draft.pack(fill='both', expand=True)
        self.answer = ScrolledText(answer, wrap='word', height=10, state='disabled',
                                   font=('Malgun Gothic', 11))
        self.answer.pack(fill='both', expand=True)
        self.status = ttk.Label(body, wraplength=400)
        self.status.pack(anchor='w', pady=(8, 4))
        footer = ttk.Frame(body)
        footer.pack(fill='x')
        ttk.Label(footer, text='Enter: 줄바꿈 · Esc: 숨기기').pack(side='left')
        self.send_button = ttk.Button(footer, text='전송 (Ctrl+Enter)', command=self.send)
        self.send_button.pack(side='right')

    @property
    def visible(self):
        return self.window.state() != 'withdrawn'

    def show(self, task, hotkey):
        self.task.configure(text=f'현재 작업: {task} · {hotkey}: 열기 / 숨기기')
        self.window.deiconify()
        self.window.lift()
        self.draft.focus_force()
        self.visibility_changed()

    def hide(self):
        self.window.withdraw()
        self.visibility_changed()
        return 'break'

    def send(self, _event=None):
        self.submit(self.draft.get('1.0', 'end-1c'))
        return 'break'

    def set_busy(self, busy):
        self.send_button.configure(state='disabled' if busy else 'normal')

    def set_result(self, text):
        self.answer.configure(state='normal')
        self.answer.delete('1.0', 'end')
        self.answer.insert('1.0', text)
        self.answer.configure(state='disabled')
