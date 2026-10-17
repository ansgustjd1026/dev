from datetime import datetime
from pathlib import Path
import sys
import tempfile
import threading
import time
import tkinter as tk
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from history import HistoryIndex
from history_panel import HistoryPanel


class HistoryPanelTests(unittest.TestCase):
    def test_select_date_load_answer_and_ignore_old_inflight_result(self):
        with tempfile.TemporaryDirectory() as folder:
            index = HistoryIndex(Path(folder) / 'index.db')
            for identity, date in (('resp_first', datetime(2026, 10, 18, 9)),
                                   ('resp_second', datetime(2026, 10, 17, 9))):
                index.add({'id': identity, 'created_at': date.timestamp()}, '번역', 'text')
            app = Mock(settings={'key': ''})
            root = tk.Tk()
            root.geometry('440x660')
            entered, release = threading.Event(), threading.Event()
            def fetch(identity, key, kind):
                if identity == 'resp_first':
                    entered.set()
                    release.wait(3)
                return identity + ' 원문', identity + ' 답변'
            try:
                with patch('history_panel.HistoryIndex', return_value=index), \
                     patch.dict('history_panel.os.environ', {'OPENAI_API_KEY': 'fake-key'}), \
                     patch('history_panel.retrieve', side_effect=fetch):
                    panel = HistoryPanel(root, app)
                    panel.pack(fill='both', expand=True)
                    root.update()
                    self.assertEqual(panel.day.get(), '2026-10-18')
                    panel.tree.selection_set('resp_first')
                    root.update()
                    self.assertTrue(entered.wait(2))
                    panel.day.set('2026-10-17')
                    panel.load_day()
                    panel.tree.selection_set('resp_second')
                    root.update()
                    release.set()
                    deadline = time.monotonic() + 3
                    while time.monotonic() < deadline:
                        root.update()
                        if panel.views[1].get('1.0', 'end-1c') == 'resp_second 답변':
                            break
                        time.sleep(.02)
                    self.assertEqual(panel.views[0].get('1.0', 'end-1c'), 'resp_second 원문')
                    self.assertEqual(panel.views[1].get('1.0', 'end-1c'), 'resp_second 답변')
                    self.assertLessEqual(panel.status.winfo_y()+panel.status.winfo_height(), panel.winfo_height())
                    panel.destroy()
                    self.assertTrue(panel.closed.is_set())
            finally:
                release.set()
                root.destroy()


if __name__ == '__main__':
    unittest.main()
