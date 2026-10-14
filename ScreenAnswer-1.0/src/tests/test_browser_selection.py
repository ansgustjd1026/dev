from contextlib import contextmanager
import queue
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS
from browser_selection import Clipboard, copied_selection


class FakeClipboard:
    def __init__(self, copied='Unfortunately', owner=10):
        self.user = Mock()
        self.seq, self.owner, self.copied = 1, owner, copied
        self.restored, self.freed = 0, 0
        self.snapshot = {13: 'original text', 49000: 'original rich text'}

    def backup(self): return dict(self.snapshot), self.seq
    def sequence(self): return self.seq
    def foreground(self): return 7
    def owner_pid(self): return self.owner
    def copy(self, source): self.seq = 2
    def text(self): return self.copied
    @contextmanager
    def opened(self): yield
    def restore(self, snapshot):
        self.restored += 1
        self.asserted_snapshot = dict(snapshot)
        snapshot.clear()
    def free(self, snapshot):
        self.freed += 1
        snapshot.clear()


class BrowserSelectionTests(unittest.TestCase):
    def test_native_backup_never_passes_gdi_handles_to_global_size(self):
        for fmt in (2, 9, 14, 0x82, 0x8e):
            clip = Clipboard.__new__(Clipboard)
            clip.user, clip.kernel, clip.ole, clip.gdi = Mock(), Mock(), Mock(), Mock()
            clip.user.OpenClipboard.return_value = True
            clip.user.EnumClipboardFormats.side_effect = [fmt, 0]
            clip.user.GetClipboardData.return_value = 123
            clip.kernel.GetLastError.return_value = 0
            clip.kernel.GlobalSize.side_effect = AssertionError('GDI is not global memory')
            clip.ole.OleDuplicateData.return_value = 456
            clip.gdi.CopyEnhMetaFileW.return_value = 456
            clip.hwnd = 99
            snapshot, _ = clip.backup()
            self.assertEqual(snapshot, {fmt: 456})

    @patch('browser_selection.window_pid', return_value=10)
    def test_reads_copied_selection_and_restores_all_previous_formats(self, pid):
        clip = FakeClipboard()
        self.assertEqual(copied_selection(7, clip, lambda: True), 'Unfortunately')
        self.assertEqual(clip.asserted_snapshot, clip.snapshot)
        self.assertEqual((clip.restored, clip.freed), (1, 1))

    @patch('browser_selection.window_pid', return_value=10)
    def test_new_copy_from_another_app_is_neither_sent_nor_overwritten(self, pid):
        clip = FakeClipboard(owner=20)
        with self.assertRaises(ValueError): copied_selection(7, clip, lambda: True)
        self.assertEqual(clip.restored, 0)
        self.assertEqual(clip.freed, 1)

    @patch('browser_selection.window_pid', return_value=10)
    def test_selection_change_after_copy_aborts_and_still_restores(self, pid):
        clip = FakeClipboard()
        valid = Mock(side_effect=[True, True, False])
        with self.assertRaises(ValueError): copied_selection(7, clip, valid)
        self.assertEqual(clip.restored, 1)

    @patch('browser_selection.window_pid', return_value=10)
    def test_partial_copy_failure_restores_changed_clipboard(self, pid):
        clip = FakeClipboard()
        def failed_copy(source):
            clip.seq = 2
            raise ValueError('copy failed')
        clip.copy = failed_copy
        with self.assertRaises(ValueError): copied_selection(7, clip, lambda: True)
        self.assertEqual(clip.restored, 1)

    @patch('browser_selection.window_pid', return_value=10)
    def test_timeout_does_not_use_previous_clipboard_text(self, pid):
        clip = FakeClipboard()
        clip.copy = Mock()
        with self.assertRaises(ValueError): copied_selection(7, clip, lambda: True, timeout=0)
        self.assertEqual(clip.restored, 0)

    def instance(self):
        app = App.__new__(App)
        app.settings = DEFAULTS.copy()
        app.events = queue.Queue()
        app.tray, app.root = Mock(), Mock()
        app.root.winfo_id.return_value = 99
        app.selection = Mock(generation=4, current=(7, 'ly, making pr'))
        app.selection.enabled.is_set.return_value = True
        return app

    def test_only_corrected_original_reaches_api_and_recent_input(self):
        app = self.instance()
        with patch('app.Clipboard'), patch('app.copied_selection', return_value='Unfortunately'), \
                patch('app.ask', return_value={'answer': '안타깝게도', 'led_count': 1}) as ask, \
                patch('app.threading.Thread') as thread:
            thread.return_value.start.side_effect = lambda: thread.call_args.kwargs['target']()
            app.submit('test-key', text='ly, making pr', copy_context=(4, (7, 'ly, making pr')))
        self.assertEqual(ask.call_args.kwargs['text'], 'Unfortunately')
        self.assertEqual(app.request_source, 'Unfortunately')

    def test_copy_failure_never_falls_back_to_wrong_uia_input(self):
        app = self.instance()
        with patch('app.Clipboard'), patch('app.copied_selection', side_effect=ValueError('copy failed')), \
                patch('app.ask') as ask, patch('app.threading.Thread') as thread:
            thread.return_value.start.side_effect = lambda: thread.call_args.kwargs['target']()
            app.submit('test-key', text='ly, making pr', copy_context=(4, (7, 'ly, making pr')))
        ask.assert_not_called()
        self.assertIsNone(app.request_source)
        self.assertEqual(app.events.get_nowait(), ('error', 'copy failed'))

    def test_recent_result_uses_existing_settings_window(self):
        app = App.__new__(App)
        app.open_settings = Mock()
        with patch('app.tk.Toplevel') as window:
            app.open_result()
        app.open_settings.assert_called_once()
        window.assert_not_called()


if __name__ == '__main__': unittest.main()
