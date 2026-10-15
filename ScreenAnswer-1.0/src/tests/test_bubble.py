"""Exercise the actual Tk bubble without captures, API calls or tray hooks."""
import ctypes
import sys
import tkinter as tk
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App


@unittest.skipUnless(sys.platform == 'win32', 'Windows nonactivating popup')
class BubbleTests(unittest.TestCase):
    def setUp(self):
        self.app = App.__new__(App)
        self.app.root = tk.Tk()
        self.app.root.withdraw()
        self.app.settings = {'answer_transparency': 0}
        self.app.near_popup = None

    def tearDown(self):
        if hasattr(self.app, 'tray'):
            self.app.hide_tray_answer()
        self.app.hide_near()
        self.app.root.destroy()

    def show(self, text, work):
        foreground = ctypes.windll.user32.GetForegroundWindow()
        with patch('app.monitor_workarea', return_value=work):
            self.app.show_near(text, (work[0]+20, work[1]+20, work[0]+100, work[1]+40))
        self.app.root.update()
        self.assertEqual(ctypes.windll.user32.GetForegroundWindow(), foreground)
        window = self.app.near_popup
        self.assertLessEqual(window.winfo_width(), work[2]-work[0]-16)
        self.assertLessEqual(window.winfo_height(), work[3]-work[1]-16)
        canvas = next(child for child in window.winfo_children() if isinstance(child, tk.Canvas))
        label = canvas.winfo_children()[0]
        self.assertEqual(label.cget('text'), text)
        self.assertGreaterEqual(canvas.winfo_width(), label.winfo_reqwidth())
        return window, canvas, label

    def test_all_lines_and_more_than_180_characters_remain_visible(self):
        text = '첫 번째 문단입니다. ' * 20 + '\n\n두 번째 문단과 마지막 줄입니다.'
        window, canvas, label = self.show(text, (0, 0, 1920, 1040))
        self.assertGreaterEqual(canvas.winfo_height(), label.winfo_reqheight())
        self.assertEqual(len(window.pack_slaves()), 1)

    def test_long_answer_can_scroll_to_last_line_on_small_monitor(self):
        text = '\n'.join(f'{n}번째 문단: 끝까지 확인할 번역입니다.' for n in range(100))
        window, canvas, label = self.show(text, (0, 0, 320, 240))
        self.assertGreater(label.winfo_reqheight(), canvas.winfo_height())
        self.assertEqual(len(window.pack_slaves()), 2)
        label.event_generate('<MouseWheel>', delta=-12000)
        self.app.root.update()
        self.assertEqual(canvas.yview()[1], 1.0)
        self.assertTrue(label.cget('text').endswith('99번째 문단: 끝까지 확인할 번역입니다.'))

    def test_stream_update_reuses_window_and_preserves_focus(self):
        window, canvas, label = self.show('번역 시작', (0, 0, 320, 240))
        foreground = ctypes.windll.user32.GetForegroundWindow()
        text = '이어지는 번역 문장입니다.\n' * 100
        with patch('app.monitor_workarea', return_value=(0, 0, 320, 240)):
            self.app.resize_near(text, (20, 20, 100, 40))
        self.app.root.update()
        self.assertIs(self.app.near_popup, window)
        self.assertEqual(label.cget('text'), text)
        self.assertEqual(ctypes.windll.user32.GetForegroundWindow(), foreground)
        self.assertLessEqual(window.winfo_height(), 224)
        self.assertLessEqual(window.winfo_width(), 304)

    def test_tray_hover_keeps_full_answer_and_scrolls_to_last_line(self):
        text = '\n'.join(f'{n}번째 번역 문장: 원문을 끝까지 번역합니다.' for n in range(100))
        self.app.tray = Mock(title='', hover_pending=True)
        self.app.set_tray_color = Mock()
        self.app.publish(text, '#7ce6a6')
        self.assertEqual(self.app.tray.title, text)
        self.app.tray_hover_started = 0
        self.app.tray_hover_seen = 0
        self.app.tray_hover_text = None
        foreground = ctypes.windll.user32.GetForegroundWindow()
        with patch('app.icon_bounds', return_value=(240, 240, 272, 272)), \
             patch('app.cursor_position', return_value=(250, 250)), \
             patch('app.time.monotonic', return_value=1), \
             patch('app.monitor_workarea', return_value=(0, 0, 320, 240)):
            self.app.update_tray_hover()
        self.app.root.update()
        window = self.app.tray_popup
        canvas, label, scrollbar = window.answer_widgets
        self.assertEqual(label.cget('text'), text)
        self.assertEqual(ctypes.windll.user32.GetForegroundWindow(), foreground)
        self.assertIsNone(self.app.near_popup)
        label.event_generate('<MouseWheel>', delta=-120000)
        self.app.root.update()
        self.assertEqual(canvas.yview()[1], 1.0)
        self.assertTrue(label.cget('text').endswith('99번째 번역 문장: 원문을 끝까지 번역합니다.'))

        # Moving from the icon into the answer keeps it open for reading/scrolling.
        self.app.root.after_cancel(self.app.tray_hover_timer)
        with patch('app.icon_bounds', return_value=(240, 240, 272, 272)), \
             patch('app.cursor_position', return_value=(window.winfo_rootx()+10, window.winfo_rooty()+10)), \
             patch('app.time.monotonic', return_value=2):
            self.app.update_tray_hover()
        self.assertIs(self.app.tray_popup, window)
        self.app.root.after_cancel(self.app.tray_hover_timer)
        with patch('app.icon_bounds', return_value=(240, 240, 272, 272)), \
             patch('app.cursor_position', return_value=(900, 900)), \
             patch('app.time.monotonic', return_value=3):
            self.app.update_tray_hover()
        self.assertIsNone(self.app.tray_popup)
        self.assertFalse(self.app.tray.hover_pending)


if __name__ == '__main__':
    unittest.main()
