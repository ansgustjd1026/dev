import queue
import sys
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS, payload


class FeedbackSettingsTests(unittest.TestCase):
    def test_unknown_keeps_reason_and_answer_in_tooltip_and_full_result(self):
        app = App.__new__(App)
        app.finish_binary = Mock()
        value = 'UNKNOWN\n이유: 참거짓이 아닌 단답형 문제입니다.\n답: 42'
        app.handle_answer(value)
        self.assertEqual(app.result_text, value)
        self.assertEqual(app.finish_binary.call_args.args[0], 3)
        self.assertIn(value, app.finish_binary.call_args.args[1])

    def test_binary_results_stay_one_or_two_and_errors_keep_their_details(self):
        app = App.__new__(App)
        app.finish_binary = Mock()
        app.handle_answer('TRUE')
        app.finish_binary.assert_called_with(1, 'True · 1번')
        app.handle_answer('FALSE')
        app.finish_binary.assert_called_with(2, 'False · 2번')
        app.handle_error('Network timeout')
        self.assertIn('Network timeout', app.result_text)
        self.assertEqual(app.finish_binary.call_args.args[0], 3)

    def test_only_legacy_default_prompt_is_migrated(self):
        import json
        import tempfile
        import app as module
        from blink import LEGACY_BINARY_PROMPT, BINARY_PROMPT
        with tempfile.TemporaryDirectory() as folder:
            config = Path(folder) / 'settings.json'
            with patch.object(module, 'CONFIG', config):
                for value in (LEGACY_BINARY_PROMPT, 'My own prompt'):
                    config.write_text(json.dumps({'prompt': value}), encoding='utf-8')
                    result = module.load_settings()
                    self.assertEqual(result['prompt'], BINARY_PROMPT if value == LEGACY_BINARY_PROMPT else value)

    def test_saved_prompt_reaches_actual_request(self):
        app = App.__new__(App)
        app.settings = {**DEFAULTS, 'prompt': 'My custom evaluation request', 'advanced_prompt': True}
        app.tray = Mock()
        app.events = queue.Queue()
        with patch('app.ask', return_value='TRUE') as ask, patch('app.threading.Thread') as thread:
            thread.return_value.start.side_effect = lambda: thread.call_args.kwargs['target']()
            app.submit('test-key', text='Question')
            sent_settings = ask.call_args.args[0]
            self.assertEqual(payload(sent_settings, text='Question')['input'][0]['content'][0]['text'], app.settings['prompt'])
            self.assertEqual(app.events.get_nowait(), ('answer', 'TRUE'))

    def test_disabled_icon_stays_fixed_through_status_changes_and_reenable(self):
        app = App.__new__(App)
        app.settings = {'tray_icon_changes': False}
        app.tray = Mock()
        with patch('app.make_icon', side_effect=lambda color: color):
            app.publish('Error', '#ff8484')
            self.assertEqual(app.tray.icon, '#72d7f3')
            self.assertEqual(app.tray.title, 'Error')
            app.set_tray_color('#ffc86b')
            self.assertEqual(app.tray.icon, '#72d7f3')
            app.settings['tray_icon_changes'] = True
            app.set_tray_color(app.tray_color)
            self.assertEqual(app.tray.icon, '#ffc86b')

    def test_recent_original_matches_sent_text_and_clears_for_image_request(self):
        app = App.__new__(App)
        app.settings = DEFAULTS.copy()
        app.tray = Mock()
        app.events = queue.Queue()
        source = 'Unfortunately, making predictions\nrequires evidence.'
        with patch('app.ask', return_value={'answer': '번역', 'led_count': 1}) as ask, patch('app.threading.Thread') as thread:
            thread.return_value.start.side_effect = lambda: thread.call_args.kwargs['target']()
            app.submit('test-key', text='  ' + source + '\n')
            self.assertEqual(app.request_source, source)
            self.assertEqual(ask.call_args.kwargs['text'], source)
            self.assertTrue(payload(app.settings, text=app.request_source)['input'][0]['content'][-1]['text'].endswith(source))
            self.assertEqual(app.result_text, 'AI 응답을 기다리는 중입니다.')
            app.submit('test-key', jpeg=b'fake-image')
            self.assertIsNone(app.request_source)
            self.assertIsNone(ask.call_args.kwargs['text'])


if __name__ == '__main__':
    unittest.main()
