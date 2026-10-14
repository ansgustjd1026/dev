import sys
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
import queue
import io
import json
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from selection import SelectionGate, selected_text, parse_delay_ms, SelectionWatcher
from app import App, DEFAULTS


class SelectionTests(unittest.TestCase):
    def test_custom_delay_and_release(self):
        for milliseconds in (0, 100, 500, 1100, 30000):
            gate = SelectionGate(delay=milliseconds / 1000, cooldown=0)
            gate.observe(None, 0)
            sample = (7, 'problem')
            self.assertIsNone(gate.observe(sample, 1, selecting=True))
            self.assertIsNone(gate.observe(sample, 10, selecting=True))
            released = gate.observe(sample, 11, selecting=False)
            if milliseconds:
                self.assertIsNone(released)
                self.assertIsNone(gate.observe(sample, 11 + milliseconds / 2000))
                self.assertEqual(gate.observe(sample, 11 + milliseconds / 1000 + 0.001), sample)
            else:
                self.assertEqual(released, sample)
            self.assertIsNone(gate.observe(sample, 40))

    def test_delay_validation_and_runtime_change(self):
        for value in ('0', ' 500 ', 1100, 30000):
            self.assertEqual(parse_delay_ms(value), int(value))
        for value in ('', '-1', '30001', '1.5', 1.5, True, 'abc'):
            with self.assertRaises(ValueError): parse_delay_ms(value)
        watcher = SelectionWatcher.__new__(SelectionWatcher)
        watcher.delay_ms, watcher.generation = 1100, 4
        watcher.set_delay('200')
        self.assertEqual((watcher.delay_ms, watcher.generation), (200, 5))
        watcher.set_delay(200)
        self.assertEqual(watcher.generation, 5)

    def test_first_drag_after_settings_is_not_an_existing_selection(self):
        gate = SelectionGate(delay=.1, cooldown=0)
        sample = (7, 'new problem')
        self.assertIsNone(gate.observe(sample, 0, selecting=True))
        self.assertIsNone(gate.observe(sample, 1, selecting=True))
        self.assertIsNone(gate.observe(sample, 2, selecting=False))
        self.assertEqual(gate.observe(sample, 2.11), sample)

    def test_same_problem_can_be_selected_again_after_clearing(self):
        gate = SelectionGate(delay=.1, cooldown=0)
        sample = (7, 'problem')
        gate.observe(None, 0)
        gate.observe(sample, 1)
        self.assertEqual(gate.observe(sample, 1.11), sample)
        gate.observe(None, 2)
        gate.observe(sample, 3)
        self.assertEqual(gate.observe(sample, 3.11), sample)

    def test_web_selection_from_pointer_and_renderer_process(self):
        auto = Mock()
        foreground = Mock(ProcessId=222, NativeWindowHandle=7, IsPassword=False)
        foreground.GetParentControl.return_value = None
        foreground.GetPattern.return_value = None
        focus = Mock(ProcessId=222, NativeWindowHandle=0, IsPassword=False)
        focus.GetPattern.side_effect = RuntimeError('unsupported focus pattern')
        focus.GetParentControl.return_value = foreground
        document = Mock(ProcessId=333, NativeWindowHandle=0, IsPassword=False)
        document.GetParentControl.return_value = foreground
        selected = Mock()
        selected.GetText.return_value = 'web question'
        document.GetPattern.return_value.GetSelection.return_value = [selected]
        auto.GetForegroundControl.return_value = foreground
        auto.GetFocusedControl.return_value = focus
        auto.GetCursorPos.return_value = (100, 200)
        auto.ControlFromPoint.return_value = document
        self.assertEqual(selected_text(auto, own_pid=111), (7, 'web question'))
        document.GetPattern.return_value.DocumentRange.GetText.assert_not_called()
        # A selection in another browser window must not be sent.
        other = Mock(ProcessId=222, NativeWindowHandle=88, IsPassword=False)
        other.GetParentControl.return_value = None
        document.GetParentControl.return_value = other
        self.assertIsNone(selected_text(auto, own_pid=111))

    def test_focused_renderer_is_accepted_by_window_ancestry(self):
        auto, focused = self.provider(pid=222)
        foreground = auto.GetForegroundControl.return_value
        foreground.IsPassword = False
        focused.ProcessId = 333
        focused.NativeWindowHandle = 0
        focused.GetParentControl.return_value = foreground
        self.assertEqual(selected_text(auto, own_pid=111), (7, '선택한 문제'))

    def test_pdf_document_selection_wins_over_a_focused_text_fragment(self):
        auto, focused = self.provider(text='e')
        auto.GetForegroundControl.return_value.IsPassword = False
        document = Mock(ProcessId=222, NativeWindowHandle=0, IsPassword=False,
                        ControlTypeName='DocumentControl')
        document.GetParentControl.return_value = auto.GetForegroundControl.return_value
        focused.GetParentControl.return_value = document
        selected = Mock()
        selected.GetText.return_value = 'Knowledge distillation transfers knowledge from a larger model.'
        selected.CompareEndpoints.return_value = -1
        document.GetPattern.return_value.GetSelection.return_value = [selected]
        self.assertEqual(selected_text(auto, own_pid=111),
                         (7, 'Knowledge distillation transfers knowledge from a larger model.'))
        focused.GetPattern.assert_not_called()
        document.GetPattern.return_value.DocumentRange.GetText.assert_not_called()

    def test_collapsed_pdf_caret_does_not_send_an_unselected_character(self):
        auto, focused = self.provider(text='e')
        selected = focused.GetPattern.return_value.GetSelection.return_value[0]
        selected.CompareEndpoints.return_value = 0
        self.assertIsNone(selected_text(auto, own_pid=111))
        selected.GetText.assert_not_called()

    def test_document_without_selection_falls_back_to_real_child_selection(self):
        auto, focused = self.provider(text='transfers')
        auto.GetForegroundControl.return_value.IsPassword = False
        document = Mock(ProcessId=222, NativeWindowHandle=0, IsPassword=False,
                        ControlTypeName='DocumentControl')
        document.GetParentControl.return_value = auto.GetForegroundControl.return_value
        document.GetPattern.return_value.GetSelection.return_value = []
        focused.GetParentControl.return_value = document
        self.assertEqual(selected_text(auto, own_pid=111), (7, 'transfers'))

    def test_baseline_drag_debounce_and_duplicate(self):
        gate = SelectionGate()
        a, b = (10, 'old selection'), (10, 'new problem')
        self.assertIsNone(gate.observe(a, 0))
        self.assertIsNone(gate.observe(a, 2))
        self.assertIsNone(gate.observe(b, 3, selecting=True))
        self.assertIsNone(gate.observe(b, 4, selecting=True))
        self.assertIsNone(gate.observe(b, 4.5))
        self.assertIsNone(gate.observe(b, 5.2))
        self.assertEqual(gate.observe(b, 5.7), b)
        self.assertIsNone(gate.observe(b, 8))

    def test_cooldown(self):
        gate = SelectionGate()
        gate.observe(None, 0)
        gate.observe((1, 'a'), 1)
        self.assertEqual(gate.observe((1, 'a'), 2.2), (1, 'a'))
        gate.observe((1, 'b'), 2.3)
        self.assertIsNone(gate.observe((1, 'b'), 3.5))
        self.assertEqual(gate.observe((1, 'b'), 5.3), (1, 'b'))

    def provider(self, text='선택한 문제', password=False, pid=222):
        auto = Mock()
        foreground = Mock(ProcessId=pid, NativeWindowHandle=7)
        focused = Mock(ProcessId=pid, IsPassword=password)
        focused.GetParentControl.return_value = None
        selected = Mock()
        selected.GetText.return_value = text
        focused.GetPattern.return_value.GetSelection.return_value = [selected]
        auto.GetForegroundControl.return_value = foreground
        auto.GetFocusedControl.return_value = focused
        return auto, focused

    def test_only_selected_text(self):
        auto, focused = self.provider()
        self.assertEqual(selected_text(auto, own_pid=111), (7, '선택한 문제'))
        focused.GetPattern.return_value.DocumentRange.GetText.assert_not_called()

    def test_password_own_app_and_unsupported_are_skipped(self):
        auto, focused = self.provider(password=True)
        self.assertIsNone(selected_text(auto, own_pid=111))
        focused.GetPattern.assert_not_called()
        auto, focused = self.provider(pid=111)
        self.assertIsNone(selected_text(auto, own_pid=111))
        auto.GetFocusedControl.assert_not_called()
        auto, focused = self.provider()
        focused.GetPattern.return_value = None
        self.assertIsNone(selected_text(auto, own_pid=111))

    def test_automatic_text_request_no_capture_no_popup_and_pause(self):
        instance = App.__new__(App)
        instance.blinker = Mock()
        instance.blinker.start.side_effect = lambda count, done: done(None)
        instance.root = Mock()
        instance.dialog = instance.popup = instance.last_auto_selection = None
        instance.busy = False
        instance.settings = {**DEFAULTS, 'task_preset':'참·거짓'}
        instance.tray = Mock()
        instance.selection = Mock(generation=3)
        instance.selection.current = (7, '2 + 3은?')
        instance.selection.enabled.is_set.return_value = True
        instance.events = queue.Queue()
        reply = {'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': 'UNKNOWN\n정답: 5'}]}]}
        with patch.dict('os.environ', {'OPENAI_API_KEY': 'fake-test-key'}), patch('app.C.windll.user32.GetForegroundWindow', return_value=7), patch('app.ImageGrab.grab') as capture, patch('urllib.request.urlopen', return_value=io.BytesIO(json.dumps(reply).encode())) as request:
            instance.answer_selection((2, (7, 'stale event')))
            request.assert_not_called()
            instance.answer_selection((3, (7, '2 + 3은?')))
            event = instance.events.get(timeout=3)
            self.assertEqual(event, ('answer', {'answer':'UNKNOWN\n정답: 5','led_count':3}))
            instance.events.put(event)
            instance.poll()
            self.assertEqual(instance.last, 'UNKNOWN\n정답: 5')
            self.assertEqual(instance.result_text, 'UNKNOWN\n정답: 5')
            self.assertEqual(instance.blinker.start.call_args.args[0], 3)
            self.assertIsNone(instance.popup)
            instance.answer_selection((3, (7, '2 + 3은?')))
            self.assertEqual(request.call_count, 1)
            instance.selection.enabled.is_set.return_value = False
            instance.answer_selection((3, (7, 'another problem')))
            self.assertEqual(request.call_count, 1)
            capture.assert_not_called()

if __name__ == '__main__': unittest.main()
