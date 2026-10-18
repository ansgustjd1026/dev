import os
import sys
from pathlib import Path
import queue
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS
from browser_drag import BrowserCopyRequest, BrowserDragTracker, document_at_pointer
from selection import SelectionWatcher


class BrowserDragTests(unittest.TestCase):
    def test_copy_keeps_gesture_but_select_all_invalidates_it(self):
        for key, keeps_selection in ((67, True), (65, False)):
            tracker = BrowserDragTracker()
            sample = tracker.active = (7, BrowserCopyRequest(1), (10, 20, 100, 200))
            user = Mock()
            user.GetForegroundWindow.return_value = 7
            user.GetCursorPos.return_value = True
            user.GetAsyncKeyState.side_effect = lambda vk: 0x8000 if vk in (17, key) else 0
            with patch('browser_drag.ctypes.windll.user32', user):
                self.assertEqual(tracker.poll(Mock()), sample if keeps_selection else None)

    def test_document_drag_requests_copy_and_keeps_stable_token(self):
        tracker = BrowserDragTracker()
        self.assertIsNone(tracker.update(True, (10, 20), 7, document=True))
        self.assertIsNone(tracker.update(True, (100, 200), 7))
        sample = tracker.update(False, (100, 200), 7)
        self.assertEqual(sample, (7, BrowserCopyRequest(1), (10, 20, 100, 200)))
        self.assertEqual(tracker.update(False, (250, 400), 7), sample)
        self.assertIsNone(tracker.update(True, (10, 20), 7, document=True))
        second = tracker.update(False, (100, 200), 7)
        self.assertNotEqual(second[:2], sample[:2])

    def test_clicks_non_document_drags_and_window_changes_do_not_copy(self):
        for document, end, source, cancel in ((True, (12, 22), 7, False),
                (False, (100, 200), 7, False), (True, (100, 200), 8, False),
                (True, (100, 200), 7, True)):
            tracker = BrowserDragTracker()
            tracker.update(True, (10, 20), 7, document=document)
            self.assertIsNone(tracker.update(False, end, source, cancel=cancel))

    def test_active_selection_is_invalidated_by_click_escape_and_window_switch(self):
        for down, source, cancel in ((True, 7, False), (False, 7, True), (False, 8, False)):
            tracker = BrowserDragTracker()
            tracker.update(True, (0, 0), 7, document=True)
            tracker.update(False, (100, 100), 7)
            self.assertIsNone(tracker.update(down, (100, 100), source, cancel=cancel))

    def document(self, kind='TextControl', password=False, hwnd=7):
        auto = Mock()
        root = Mock(ProcessId=os.getpid()+1, NativeWindowHandle=hwnd,
                    IsPassword=False, ControlTypeName='WindowControl')
        root.GetParentControl.return_value = None
        document = Mock(ProcessId=os.getpid()+2, NativeWindowHandle=0,
                        IsPassword=False, ControlTypeName='DocumentControl')
        document.GetParentControl.return_value = root
        leaf = Mock(ProcessId=os.getpid()+2, NativeWindowHandle=0,
                    IsPassword=password, ControlTypeName=kind)
        leaf.GetParentControl.return_value = document
        auto.ControlFromPoint.return_value = leaf
        auto.GetFocusedControl.return_value = leaf
        return auto

    def test_requires_browser_document_and_excludes_inputs_and_other_windows(self):
        with patch('browser_drag.is_browser', return_value=True):
            self.assertTrue(document_at_pointer(self.document(), (10, 20), 7))
            for kind in ('EditControl', 'ComboBoxControl', 'ScrollBarControl'):
                self.assertFalse(document_at_pointer(self.document(kind), (10, 20), 7))
            self.assertFalse(document_at_pointer(self.document(password=True), (10, 20), 7))
            self.assertFalse(document_at_pointer(self.document(hwnd=8), (10, 20), 7))
        with patch('browser_drag.is_browser', return_value=False):
            self.assertFalse(document_at_pointer(self.document(), (10, 20), 7))

    def test_watcher_dispatches_without_any_uia_selected_text(self):
        watcher = SelectionWatcher.__new__(SelectionWatcher)
        watcher.enabled, watcher.suspended = threading.Event(), threading.Event()
        watcher.enabled.set()
        watcher.stop, watcher.events = Mock(), queue.Queue()
        watcher.stop.wait.side_effect = [False] * 4 + [True]
        watcher.generation, watcher.current, watcher.delay_ms = 4, None, 50
        watcher.browser_copy = True
        sample = (7, BrowserCopyRequest(1), (10, 20, 100, 200))
        with patch.dict('sys.modules', {'uiautomation': Mock()}), \
             patch('selection.BrowserDragTracker') as tracker, \
             patch('selection.selected_text', return_value=None) as uia, \
             patch('selection.ctypes.windll.user32.GetAsyncKeyState', return_value=0), \
             patch('selection.time.monotonic', side_effect=[0, 1, 2, 3]):
            tracker.return_value.poll.side_effect = [None, sample, sample, sample]
            watcher.run()
        requests = [event for event in watcher.events.queue if event[0] == 'selection']
        self.assertEqual(requests, [('selection', (4, sample))])
        self.assertEqual(watcher.current, sample[:2])
        self.assertEqual(uia.call_count, 1)

    def test_app_copies_marker_request_and_sends_only_actual_text(self):
        app = App.__new__(App)
        app.settings, app.events = DEFAULTS.copy(), queue.Queue()
        app.root, app.tray, app.selection = Mock(), Mock(), Mock(generation=4)
        app.root.winfo_id.return_value = 99
        app.dialog, app.busy, app.last_auto_selection = None, False, None
        app.hide_near, app.set_tray_color, app.request_key = Mock(), Mock(), Mock(return_value='test-key')
        app.selection.enabled.is_set.return_value = True
        sample = (7, BrowserCopyRequest(2), (10, 20, 100, 200))
        app.selection.current = sample[:2]
        with patch('app.is_browser', return_value=True), patch('app.Clipboard'), \
             patch('app.C.windll.user32.GetForegroundWindow', return_value=7), \
             patch('app.copied_selection', return_value='Example: check box') as copied, \
             patch('app.ask', return_value={'answer': '예: 체크박스', 'led_count': 1}) as ask, \
             patch('app.threading.Thread') as thread:
            thread.return_value.start.side_effect = lambda: thread.call_args.kwargs['target']()
            app.answer_selection((4, sample))
        copied.assert_called_once()
        self.assertEqual(ask.call_args.kwargs['text'], 'Example: check box')
        self.assertEqual(app.request_source, 'Example: check box')
        self.assertEqual(app.pending_selection[-1], sample[1])


if __name__ == '__main__':
    unittest.main()
