import ctypes as C
import io
import json
import queue
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import diagnostics
import monitors
from app import App, DEFAULTS, ask


class MonitorTests(unittest.TestCase):
    def test_gesture_point_takes_precedence_over_spanning_window(self):
        with patch('monitors.monitor_at_point', return_value=(-1920,0,0,1080)) as at_point:
            self.assertEqual(monitors.capture_bounds(77, (-1500,500)), (-1920,0,0,1080))
            at_point.assert_called_once_with((-1500,500))

    def test_hotkey_uses_foreground_window_and_explicit_source_is_preserved(self):
        with patch('monitors.C.windll.user32.GetForegroundWindow', return_value=77), \
                patch('monitors.C.windll.user32.MonitorFromWindow', return_value=99) as from_window, \
                patch('monitors.monitor_rectangle', return_value=(1920,0,3840,1080)):
            self.assertEqual(monitors.capture_bounds(), (1920,0,3840,1080))
            from_window.assert_called_with(77,2)
            monitors.capture_bounds(88)
            from_window.assert_called_with(88,2)

    def test_full_monitor_and_work_area_are_distinct_with_negative_coordinates(self):
        def fill_info(handle, pointer):
            info = C.cast(pointer, C.POINTER(monitors.MonitorInfo)).contents
            info.rcMonitor = monitors.W.RECT(-1920,-200,0,880)
            info.rcWork = monitors.W.RECT(-1920,-200,0,840)
            return 1
        with patch('monitors.C.windll.user32.GetMonitorInfoW', side_effect=fill_info):
            self.assertEqual(monitors.monitor_rectangle(99), (-1920,-200,0,880))
            self.assertEqual(monitors.monitor_rectangle(99, work=True), (-1920,-200,0,840))

    def instance(self):
        app = App.__new__(App)
        app.settings = DEFAULTS.copy()
        app.root, app.tray, app.selection = Mock(), Mock(), Mock()
        app.busy = False
        app.request_key = Mock(return_value='fake-test-key')
        app.hide_near = app.set_tray_color = Mock()
        app.publish = Mock()
        return app

    def test_monitor_is_pinned_before_delayed_capture(self):
        app = self.instance()
        app.capture = Mock()
        with patch('app.capture_bounds', return_value=(-1920,0,0,1080)) as bounds:
            app.scan(source=77, point=(-100,500))
            bounds.assert_called_once_with(77, (-100,500))
        app.root.after.call_args.args[1]()
        app.capture.assert_called_once_with('fake-test-key', (-1920,0,0,1080))

    def test_monitor_failure_does_not_capture_another_screen(self):
        app = self.instance()
        with patch('app.capture_bounds', side_effect=OSError('no monitor')), patch('app.record_error') as log:
            app.scan()
        self.assertFalse(app.busy)
        app.root.after.assert_not_called()
        app.publish.assert_called_once()
        log.assert_called_once()

    def test_jpeg_contains_only_selected_monitor_image(self):
        app = self.instance()
        app.submit = Mock()
        selected = Image.new('RGB', (100,80), 'red')
        with patch('app.ImageGrab.grab', return_value=selected) as grab:
            app.capture('fake-test-key', (-1920,0,0,1080))
        grab.assert_called_once_with(bbox=(-1920,0,0,1080), all_screens=True)
        with Image.open(io.BytesIO(app.submit.call_args.kwargs['jpeg'])) as encoded:
            self.assertEqual(encoded.size, (100,80))
            self.assertGreater(encoded.getpixel((50,40))[0], 240)
        with self.assertRaises(ValueError): selected.getpixel((0,0))

    def test_mouse_scan_passes_original_gesture_point(self):
        app = self.instance()
        app.mouse = Mock(generation=4)
        app.scan = Mock()
        app.mouse_scan((4,77,'circle',(-1500,400)))
        app.scan.assert_called_once_with(source=77, point=(-1500,400))


class DiagnosticTests(unittest.TestCase):
    def tearDown(self):
        with diagnostics._lock:
            if diagnostics._handler is not None:
                diagnostics._handler.close()
            diagnostics._handler = diagnostics._path = None

    def test_log_excludes_exception_message_path_and_local_values(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'diagnostics.log'
            secret = 'sk-test-secret-question-answer-file-content'
            try:
                exec(compile('raise ValueError(secret)', '/private/user/app.py', 'exec'))
            except ValueError as error:
                with patch('diagnostics.LOG_FILE', log):
                    diagnostics.record_error('request', error)
            contents = log.read_text(encoding='utf-8')
            self.assertNotIn(secret, contents)
            self.assertNotIn('/private/user', contents)
            self.assertIn('ValueError', contents)
            self.assertIn('app.py:1', contents)
            self.tearDown()

    def test_http_status_survives_without_url_headers_or_response_body(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'diagnostics.log'
            error = urllib.error.HTTPError('https://secret.example',429,'private-message',{'Authorization':'secret-key'},None)
            with patch('diagnostics.LOG_FILE', log): diagnostics.record_error('api', error)
            contents = log.read_text(encoding='utf-8')
            self.assertIn('429', contents)
            for secret in ('secret.example','private-message','Authorization','secret-key'):
                self.assertNotIn(secret, contents)
            self.tearDown()

    def test_rotating_log_is_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            log = Path(folder) / 'diagnostics.log'
            with patch('diagnostics.LOG_FILE', log), patch('diagnostics.MAX_LOG_BYTES',1024):
                for _ in range(100): diagnostics.record_error('event',RuntimeError('private'))
            files = list(Path(folder).glob('diagnostics.log*'))
            self.assertEqual(len(files),3)
            self.assertTrue(all(file.stat().st_size <= 1024 for file in files))
            self.tearDown()

    def test_logging_failure_does_not_escape(self):
        with patch('diagnostics.LOG_FILE', Path('unused/diagnostics.log')), \
                patch.object(Path,'mkdir',side_effect=PermissionError('blocked')):
            diagnostics.record_error('capture',OSError('private'))

    def test_api_errors_are_logged_and_still_reported_to_user(self):
        error = urllib.error.HTTPError('url',429,'private',{},None)
        with patch('app.record_error') as log, patch('urllib.request.urlopen',side_effect=error):
            with self.assertRaisesRegex(ValueError,'使用|사용 한도'):
                ask(DEFAULTS,None,'fake-test-key',text='question')
        log.assert_called_once_with('api',error)


if __name__ == '__main__': unittest.main()
