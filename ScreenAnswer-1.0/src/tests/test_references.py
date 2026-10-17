import base64
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import DEFAULTS, payload, ask
from references import reference_inputs, validate_reference_paths, validate_vector_store_id


class ReferenceTests(unittest.TestCase):
    def test_server_search_replaces_local_attachment_for_both_inputs(self):
        settings = {**DEFAULTS, 'file_search_enabled': True, 'vector_store_id': 'vs_test123',
                    'reference_files_enabled': True, 'reference_files': ['missing.pdf']}
        for question in ({'text': 'Question'}, {'jpeg': b'fake-jpeg'}):
            data = payload(settings, **question)
            self.assertEqual(data['tools'][0]['vector_store_ids'], ['vs_test123'])
            self.assertEqual(data['tool_choice'], 'required')
            self.assertFalse(any(part['type'] == 'input_file' for part in data['input'][0]['content']))

    def test_server_search_can_be_disabled_and_rejects_invalid_id_before_request(self):
        self.assertNotIn('tools', payload(DEFAULTS, text='Question'))
        for value in ('', 'file-abc', 'vs_abc/other', 'vs_a b'):
            with self.assertRaises(ValueError):
                validate_vector_store_id(value)
        settings = {**DEFAULTS, 'file_search_enabled': True, 'vector_store_id': 'invalid'}
        with patch('urllib.request.urlopen') as network:
            with self.assertRaises(ValueError):
                ask(settings, None, 'fake-key', text='Question')
            network.assert_not_called()

    def test_text_and_screen_requests_include_exact_file_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '배경.txt'
            raw = '참고 자료: 테스트 문서입니다.'.encode('utf-8')
            path.write_bytes(raw)
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': [str(path)]}
            for question in ({'text': 'Question'}, {'jpeg': b'fake-jpeg'}):
                data = payload(settings, **question)
                files = [part for part in data['input'][0]['content'] if part['type'] == 'input_file']
                self.assertEqual(len(files), 1)
                self.assertEqual(files[0]['filename'], path.name)
                self.assertEqual(files[0]['file_data'].split(',')[0], 'data:text/plain;base64')
                self.assertEqual(base64.b64decode(files[0]['file_data'].split(',')[1]), raw)
                self.assertTrue(data['store'])

    def test_disabled_files_are_not_read_even_when_missing(self):
        settings = {**DEFAULTS, 'reference_files_enabled': False, 'reference_files': ['missing.pdf']}
        with patch('references.Path.open', side_effect=AssertionError('must not read')):
            self.assertEqual(reference_inputs(settings), [])
            self.assertFalse(any(part['type'] == 'input_file' for part in payload(settings, text='Question')['input'][0]['content']))

    def test_invalid_attachment_prevents_network_request(self):
        settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': ['missing.pdf']}
        with patch('urllib.request.urlopen') as network:
            with self.assertRaises(ValueError):
                ask(settings, None, 'fake-key', text='Question')
            network.assert_not_called()

    def test_empty_unsupported_and_oversize_are_rejected_and_paths_deduplicated(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'reference.txt'
            path.write_bytes(b'1234')
            self.assertEqual(validate_reference_paths([str(path), str(path)]), [str(path.resolve())])
            with patch('references.MAX_BYTES', 4):
                with self.assertRaises(ValueError):
                    validate_reference_paths([str(path)])
            second = Path(folder) / 'second.txt'
            second.write_bytes(b'5678')
            with patch('references.MAX_BYTES', 7):
                with self.assertRaises(ValueError):
                    validate_reference_paths([str(path), str(second)])
            path.write_bytes(b'')
            with self.assertRaises(ValueError):
                validate_reference_paths([str(path)])
            unsupported = Path(folder) / 'app.exe'
            unsupported.write_bytes(b'test')
            with self.assertRaises(ValueError):
                validate_reference_paths([str(unsupported)])

    def test_config_roundtrip_keeps_paths_and_toggle_without_copying_content(self):
        import app
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            path = root / 'reference.txt'
            path.write_text('unique reference contents', encoding='utf-8')
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': [str(path)]}
            with patch.object(app, 'APP_DIR', root), patch.object(app, 'CONFIG', root / 'settings.json'):
                app.save_settings(settings)
                restored = app.load_settings()
                self.assertEqual(restored['reference_files'], [str(path)])
                self.assertTrue(restored['reference_files_enabled'])
                self.assertNotIn('unique reference contents', app.CONFIG.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
