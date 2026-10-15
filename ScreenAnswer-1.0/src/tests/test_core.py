import base64
import sys
from pathlib import Path
import unittest
import tempfile
import json
import queue
import io
from unittest.mock import patch, Mock
import urllib.error
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import parse_hotkey, payload, response_text, protect, ask, DEFAULTS, tooltip, load_settings, validate_text, App

class CoreTests(unittest.TestCase):
    def test_text_only_payload_and_validation(self):
        data = payload(DEFAULTS, text='  2 + 3은?\n선택지: 4, 5  ')
        content = data['input'][0]['content']
        self.assertTrue(all(item['type'] == 'input_text' for item in content))
        self.assertIn('2 + 3은?\n선택지: 4, 5', content[1]['text'])
        for text in ['', '  ', 'x' * 50001, 'sk-fake-key-example']:
            with self.assertRaises(ValueError): validate_text(text)
        with self.assertRaises(ValueError): payload(DEFAULTS, b'image', text='question')

    def test_removed_clipboard_settings_are_migrated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            path.write_text(json.dumps({'clipboard_enabled': True, 'clipboard_hotkey': 'Ctrl+Alt+C', 'key': 'preserved'}), encoding='utf-8')
            with patch('app.CONFIG', path):
                settings = load_settings()
            self.assertNotIn('clipboard_enabled', settings)
            self.assertNotIn('clipboard_hotkey', settings)
            self.assertEqual(settings['key'], 'preserved')

    def test_tooltip_preserves_full_text_and_emoji(self):
        for value in ['정답: 42', '한글' * 100, '😀' * 100, 'hello\x00world']:
            result = tooltip(value)
            self.assertEqual(result, value.replace('\x00', ''))
            self.assertNotIn('\x00', result)
        self.assertEqual(tooltip('정답: 42'), '정답: 42')

    def test_hotkeys(self):
        self.assertEqual(parse_hotkey('Ctrl+Alt+Q'), (0x4003, ord('Q')))
        self.assertEqual(parse_hotkey('Ctrl+Shift+F8'), (0x4006, 0x77))
        for value in ['Q', 'Ctrl+Ctrl+Q', 'Ctrl+F25', 'Ctrl+Space', 'Ctrl+한']:
            with self.assertRaises(ValueError): parse_hotkey(value)

    def test_payload(self):
        data = payload(DEFAULTS, b'jpeg-example')
        self.assertFalse(data['store'])
        content = data['input'][0]['content']
        self.assertEqual(base64.b64decode(content[1]['image_url'].split(',')[1]), b'jpeg-example')

    def test_flagship_reasoning_budget(self):
        data = payload(DEFAULTS, b'test')
        self.assertEqual(data['model'], 'gpt-6.1-sol')
        self.assertEqual(data['reasoning']['effort'], 'medium')
        self.assertEqual(data['max_output_tokens'], 8192)
        for model in ('gpt-6.1-sol', 'gpt-6.1-sol-2026-09-29', 'gpt-6-astra'):
            selected = payload({**DEFAULTS, 'model': model}, text='question')
            self.assertEqual(selected['model'], model)
            self.assertEqual(selected['reasoning']['effort'], 'medium')
            self.assertEqual(selected['max_output_tokens'], 8192)
        legacy = payload({**DEFAULTS, 'model': 'gpt-4.1'}, b'test')
        self.assertNotIn('reasoning', legacy)

    def test_saved_settings_model_upgrade_preserves_key_and_hotkey(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'settings.json'
            for previous, expected in [('gpt-4.1-mini', 'gpt-6.1-sol'), ('gpt-6-astra', 'gpt-6.1-sol'), ('custom-model', 'custom-model')]:
                path.write_text(json.dumps({'model': previous, 'key': 'encrypted-placeholder', 'hotkey': 'Ctrl+Shift+F8', 'timeout': 90, 'full_answer_enabled': True}), encoding='utf-8')
                with patch('app.CONFIG', path):
                    settings = load_settings()
                self.assertEqual(settings['model'], expected)
                self.assertEqual(settings['key'], 'encrypted-placeholder')
                self.assertNotIn('full_answer_enabled', settings)
                self.assertEqual(settings['hotkey'], 'Ctrl+Shift+F8')
                self.assertEqual(settings['timeout'], 180)
                self.assertEqual(settings['settings_version'], 4)
            path.write_text(json.dumps({**DEFAULTS, 'model': 'gpt-6-astra'}), encoding='utf-8')
            with patch('app.CONFIG', path):
                self.assertEqual(load_settings()['model'], 'gpt-6-astra')

    def test_output_with_reasoning_and_incomplete(self):
        data = {'status': 'incomplete', 'output': [{'type': 'reasoning'}, {'type': 'message', 'content': [{'type': 'output_text', 'text': '정답'}]}]}
        self.assertIn('정답', response_text(data))
        self.assertIn('출력 제한', response_text(data))
        with self.assertRaises(ValueError): response_text({'output': []})

    def test_key_encryption_roundtrip(self):
        value = b'test-key-not-a-real-secret'
        encrypted = protect(value)
        self.assertNotIn(value, encrypted)
        self.assertEqual(protect(encrypted, True), value)

    def test_http_error(self):
        with patch('urllib.request.urlopen', side_effect=urllib.error.HTTPError('url', 429, 'limit', {}, None)):
            with self.assertRaisesRegex(ValueError, '사용 한도'):
                ask(DEFAULTS, b'test', 'fake-key')

if __name__ == '__main__': unittest.main()
