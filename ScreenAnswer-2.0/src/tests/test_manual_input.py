import ctypes as C
import json
from pathlib import Path
import queue
import sys
import tempfile
import threading
import tkinter as tk
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS
from hotkeys import Hotkey
from manual_input import ManualInput
from settings_store import load_settings


class ManualInputTests(unittest.TestCase):
    def make_app(self):
        app = App.__new__(App)
        app.settings = {**DEFAULTS, 'led_enabled': False}
        app.busy, app.dialog, app.manual_request = False, None, False
        app.selection = Mock()
        app.selection.suspended = threading.Event()
        app.manual_window = Mock(visible=True)
        app.hotkey, app.manual_hotkey, app.tray, app.blinker = Mock(), Mock(), Mock(), Mock()
        app.hide_near, app.publish, app.set_tray_color = Mock(), Mock(), Mock()
        app.display_selection_answer = Mock()
        return app

    def test_hide_preserves_draft_and_complete_answer(self):
        root = tk.Tk()
        root.withdraw()
        try:
            send, changed = Mock(), Mock()
            window = ManualInput(root, send, changed)
            self.assertFalse(window.visible)
            draft = '질문입니다.\n둘째 줄도 전송합니다.'
            answer = '긴 답변\n' * 200
            window.draft.insert('1.0', draft)
            window.show('자유 질문', 'Ctrl+Alt+Space')
            self.assertTrue(window.visible)
            window.hide()
            window.set_result(answer)
            self.assertFalse(window.visible)
            window.show('번역', 'Ctrl+Alt+Space')
            self.assertEqual(window.draft.get('1.0', 'end-1c'), draft)
            self.assertEqual(window.answer.get('1.0', 'end-1c'), answer)
            window.send()
            send.assert_called_once_with(draft)
        finally:
            root.destroy()

    def test_toggle_and_disabled_feature(self):
        app = self.make_app()
        app.toggle_manual_input()
        app.manual_window.hide.assert_called_once()
        app.manual_window.visible = False
        app.hide_tray_answer = Mock()
        app.toggle_manual_input()
        app.manual_window.show.assert_called_once_with('자유 질문', 'Ctrl+Alt+Space')
        app.settings['manual_input_enabled'] = False
        app.toggle_manual_input()
        self.assertEqual(app.manual_window.show.call_count, 1)

    def test_manual_submit_uses_exact_text_and_ignores_duplicate(self):
        app = self.make_app()
        app.request_key = Mock(return_value='test-key')
        app.submit = Mock()
        app.submit_manual('  질문\n내용  ')
        app.submit.assert_called_once_with('test-key', text='질문\n내용')
        self.assertTrue(app.manual_request)
        self.assertTrue(app.selection.suspended.is_set())
        app.submit_manual('다른 질문')
        self.assertEqual(app.submit.call_count, 1)

    def test_empty_input_and_settings_dialog_do_not_send(self):
        app = self.make_app()
        app.submit, app.request_key = Mock(), Mock()
        app.submit_manual('  ')
        app.dialog = Mock()
        app.submit_manual('question')
        app.request_key.assert_not_called()
        app.submit.assert_not_called()

    def test_hidden_window_receives_answer_without_opening(self):
        app = self.make_app()
        app.manual_request = True
        app.manual_window.visible = False
        app.handle_answer({'answer': '전체 답변', 'led_count': 1})
        app.manual_window.set_result.assert_called_once_with('전체 답변')
        app.manual_window.show.assert_not_called()
        self.assertFalse(app.busy)
        self.assertFalse(app.selection.suspended.is_set())
        app.manual_window.visible = True
        app.finish_binary(1, '답변')
        self.assertTrue(app.selection.suspended.is_set())

    def test_failure_and_retry(self):
        app = self.make_app()
        app.request_key = Mock(return_value='test-key')
        app.submit = Mock(side_effect=RuntimeError('test'))
        with patch('app.record_error'):
            app.submit_manual('question')
        self.assertFalse(app.busy)
        self.assertFalse(app.manual_request)
        self.assertIn('요청 오류', app.manual_window.set_result.call_args.args[0])
        app.manual_window.set_busy.assert_called_with(False)

    def test_shortcuts_rollback_and_collision(self):
        app = self.make_app()
        with patch('app.save_settings', side_effect=OSError('test')):
            with self.assertRaises(OSError):
                app.apply_settings({**app.settings, 'manual_input_hotkey': 'Ctrl+Alt+F10'})
        app.manual_hotkey.register.assert_called_with('Ctrl+Alt+Space')
        app.hotkey.register.assert_called_with('Ctrl+Alt+Q')
        with self.assertRaises(ValueError):
            app.apply_settings({**app.settings, 'manual_input_hotkey': 'Alt+Ctrl+Q'})

    def test_existing_settings_keep_key_and_task(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_text(json.dumps({'key': 'encrypted-test', 'task_preset': '번역',
                                        'settings_version': 4}), encoding='utf-8')
            settings = load_settings(config=path)
            self.assertEqual(settings['key'], 'encrypted-test')
            self.assertEqual(settings['task_preset'], '번역')
            self.assertTrue(settings['manual_input_enabled'])
            self.assertEqual(settings['manual_input_hotkey'], 'Ctrl+Alt+Space')

    def test_native_space_hotkey_registration_and_dispatch(self):
        events = queue.Queue()
        handler = Hotkey(events, 'manual_input')
        try:
            handler.register('Ctrl+Alt+Space')
            # First registration uses id 2 on this handler's own native thread.
            self.assertTrue(C.windll.user32.PostThreadMessageW(handler.thread.native_id, 0x312, 2, 0))
            self.assertEqual(events.get(timeout=2), ('manual_input', None))
            handler.register(None)
        finally:
            handler.commands.put(('stop',))
            handler.thread.join(3)
        self.assertFalse(handler.thread.is_alive())
