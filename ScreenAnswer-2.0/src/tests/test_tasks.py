import unittest
from unittest.mock import Mock
from app import App, DEFAULTS
from tasks import task_prompt, feedback, validate_feedback, PRESETS

class TaskTests(unittest.TestCase):
    def test_presets_extra_and_custom_prompt(self):
        for name, prompt in PRESETS.items():
            settings = {**DEFAULTS, 'task_preset':name, 'extra_request':'두 문장으로'}
            if name == '번역':
                self.assertIn('번역문만 출력', task_prompt(settings))
            else:
                self.assertIn(prompt, task_prompt(settings))
            self.assertIn('두 문장으로', task_prompt(settings))
            settings.update(advanced_prompt=True, prompt='직접 작성한 요청')
            if name != '번역':
                self.assertEqual(task_prompt(settings), '직접 작성한 요청')

    def test_auto_completion_and_binary_and_multiple_choice(self):
        self.assertEqual(feedback(DEFAULTS, '설명입니다'), (1,'설명입니다'))
        self.assertEqual(feedback({**DEFAULTS,'task_preset':'참·거짓'}, 'FALSE')[0], 2)
        self.assertEqual(feedback({**DEFAULTS,'task_preset':'객관식'}, '9\n설명')[0], 9)
        self.assertEqual(feedback({**DEFAULTS,'task_preset':'객관식'}, '설명에 2가 있음')[0], 3)
        self.assertEqual(feedback({**DEFAULTS,'task_preset':'참·거짓','led_mode':'완료 알림'}, 'FALSE')[0], 1)
        self.assertEqual(feedback({**DEFAULTS,'led_error_count':5}, '오류', error=True)[0], 5)

    def test_disabled_led_still_publishes_and_resumes_selection(self):
        app = App.__new__(App)
        app.settings = {**DEFAULTS, 'led_enabled':False}
        app.hide_near = app.display_selection_answer = app.publish = Mock()
        app.selection = app.blinker = Mock()
        app.finish_binary(1, '답변')
        app.blinker.start.assert_not_called()
        self.assertFalse(app.busy)
        app.selection.suspended.clear.assert_called_once()

    def test_bounds(self):
        for key, value in [('led_done_count',0),('led_error_count',10),('led_interval_ms',99),('led_interval_ms',1001)]:
            with self.assertRaises(ValueError):
                validate_feedback({**DEFAULTS,key:value})
