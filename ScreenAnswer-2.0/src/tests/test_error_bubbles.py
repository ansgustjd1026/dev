"""Failures stay in the result panel and never create cursor/hover popups."""
import gc
from pathlib import Path
import sys
import tkinter as tk
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS
from result_panel import ResultPanel


class ErrorBubbleTests(unittest.TestCase):
    def instance(self):
        app = App.__new__(App)
        app.root, app.tray, app.selection, app.blinker = Mock(), Mock(), Mock(), Mock()
        app.settings = {**DEFAULTS, 'bubble_enabled': True, 'led_enabled': False}
        app.dialog, app.busy = None, False
        app.pending_selection = (1, 77, (10, 10, 100, 40), 'selected')
        app.near_popup, app.tray_popup = Mock(), Mock()
        app.result_text = '이전 답변'
        app.set_tray_color, app.display_selection_answer = Mock(), Mock()
        return app

    def test_request_error_hides_popups_and_never_displays_at_selection(self):
        app = self.instance()
        near, hover = app.near_popup, app.tray_popup
        app.handle_error('요청 제한입니다.')
        app.display_selection_answer.assert_not_called()
        near.destroy.assert_called_once()
        hover.destroy.assert_called_once()
        self.assertIsNone(app.pending_selection)
        self.assertIsNone(app.near_popup)
        self.assertIsNone(app.tray_popup)
        self.assertEqual(app.result_text, '요청 오류\n요청 제한입니다.')
        self.assertFalse(app.busy)
        app.begin_tray_hover()
        with patch('app.icon_bounds') as bounds:
            app.update_tray_hover()
        bounds.assert_not_called()
        app.root.after.assert_not_called()

    def test_non_request_error_cancels_hover_and_preserves_answer(self):
        app = self.instance()
        app.tray_hover_timer = 'pending-hover'
        app.publish('LED 알림 실패: 장치 오류', '#ff8484')
        app.root.after_cancel.assert_called_once_with('pending-hover')
        self.assertEqual(app.last, 'LED 알림 실패: 장치 오류')
        self.assertEqual(app.result_text, '이전 답변')
        self.assertTrue(app.popup_error)
        app.set_tray_color.assert_called_with('#ff8484')
        app.begin_tray_hover()
        app.root.after.assert_not_called()

    def test_partial_and_final_bubbles_are_blocked_during_error(self):
        app = self.instance()
        del app.display_selection_answer
        app.popup_error = True
        app.show_near = Mock()
        app.display_selection_answer('늦게 도착한 내용', final=False)
        app.display_selection_answer('요청 오류')
        app.show_near.assert_not_called()
        self.assertIsNone(app.pending_selection)

    def test_new_request_and_success_restore_normal_bubbles(self):
        app = self.instance()
        app.handle_error('test')
        with patch('app.threading.Thread'):
            app.submit('test-key', text='새 질문')
        self.assertFalse(app.popup_error)
        app.finish_binary(1, '정상 답변')
        app.display_selection_answer.assert_called_once_with('정상 답변')
        app.create_answer_bubble = Mock(return_value=Mock())
        app.tray_hover_started, app.tray_hover_seen = 0, 0
        with patch('app.icon_bounds', return_value=(10, 10, 40, 40)), \
             patch('app.cursor_position', return_value=(20, 20)), \
             patch('app.time.monotonic', return_value=1):
            app.update_tray_hover()
        app.create_answer_bubble.assert_called_once_with('정상 답변', (10, 10, 40, 40))

    def test_uncertain_answer_is_not_a_request_error(self):
        app = self.instance()
        app.finish_binary(3, '판별 불가\n정보가 부족합니다.')
        self.assertFalse(app.popup_error)
        app.display_selection_answer.assert_called_once_with('판별 불가\n정보가 부족합니다.')
        app.begin_tray_hover()
        app.root.after.assert_called_once()

    def test_answer_text_starting_with_error_words_is_still_an_answer(self):
        app = self.instance()
        text = '요청 오류라는 문구의 의미는 다음과 같습니다.'
        app.handle_answer({'answer': text, 'led_count': 1})
        self.assertFalse(app.popup_error)
        app.display_selection_answer.assert_called_once_with(text)

    def test_error_details_remain_readable_in_existing_panel(self):
        root = tk.Tk()
        root.withdraw()
        app = self.instance()
        app.root = root
        try:
            app.publish('저장된 API 키를 읽을 수 없습니다.', '#ff8484')
            panel = ResultPanel(root, app)
            self.assertEqual(panel.views[1].get('1.0', 'end-1c'), '저장된 API 키를 읽을 수 없습니다.')
            self.assertFalse(any(isinstance(child, tk.Toplevel) for child in root.winfo_children()))
        finally:
            root.destroy()
            del panel, app, root
            gc.collect()
