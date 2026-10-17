import io
import json
from datetime import datetime
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from history import HistoryIndex, SOURCE_PREFIX, retrieve, get_json
import api_client
from settings_store import DEFAULTS


def response(identity='resp_test', answer='번역 답변'):
    return {'id': identity, 'created_at': 1792281600, 'status': 'completed',
            'output': [{'type': 'message', 'content': [{'type': 'output_text',
            'text': json.dumps({'answer': answer, 'led_count': 1})}]}]}


class HistoryTests(unittest.TestCase):
    def test_index_survives_reopen_groups_dates_and_stores_no_content(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'index.sqlite3'
            index = HistoryIndex(path)
            older = datetime(2026, 10, 17, 23, 59).timestamp()
            newer = datetime(2026, 10, 18, 0, 1).timestamp()
            secret = 'private-source-and-answer-secret'
            for identity, created in (('resp_old', older), ('resp_new', newer), ('resp_new', newer)):
                index.add({'id': identity, 'created_at': created, 'output': secret}, '번역', 'text')
            reopened = HistoryIndex(path)
            self.assertEqual(reopened.days(), ['2026-10-18', '2026-10-17'])
            self.assertEqual(len(reopened.entries('2026-10-18')), 1)
            self.assertEqual(reopened.entries('2026-10-17')[0]['id'], 'resp_old')
            self.assertNotIn(secret.encode(), path.read_bytes())
            self.assertEqual(reopened.entries("' OR 1=1 --"), [])

    def test_retrieve_uses_get_and_paginates_original_without_prompt(self):
        pages = [response(), {'data': [{'role': 'user', 'content': [
                    {'type': 'input_text', 'text': 'task prompt'}]}], 'has_more': True, 'last_id': 'msg/1'},
                 {'data': [{'role': 'user', 'content': [
                    {'type': 'input_text', 'text': SOURCE_PREFIX+'original text'}]}], 'has_more': False}]
        with patch('history.urllib.request.urlopen', side_effect=[
                io.BytesIO(json.dumps(page).encode()) for page in pages]) as opened:
            self.assertEqual(retrieve('resp_test', 'fake-key', 'text'), ('original text', '번역 답변'))
        requests = [call.args[0] for call in opened.call_args_list]
        self.assertTrue(all(req.method == 'GET' and req.data is None for req in requests))
        self.assertIn('after=msg%2F1', requests[-1].full_url)
        self.assertEqual(requests[0].full_url, 'https://api.openai.com/v1/responses/resp_test')

    def test_screen_does_not_download_original_image(self):
        with patch('history.get_json', return_value=response()) as fetch:
            source, answer = retrieve('resp_test', 'fake-key', 'screen')
        self.assertIn('화면 캡처', source)
        self.assertEqual(answer, '번역 답변')
        fetch.assert_called_once()

    def test_invalid_ids_never_make_network_request(self):
        with patch('history.get_json') as fetch:
            for identity in ('../secret', 'https://other.example', 'resp_bad?x=1', ''):
                with self.assertRaises(ValueError):
                    retrieve(identity, 'fake-key', 'text')
        fetch.assert_not_called()

    def test_missing_permission_expired_and_network_failures_are_friendly(self):
        for code in (401, 403, 404, 429, 500):
            error = urllib.error.HTTPError('secret-url', code, 'secret-body', {}, None)
            with patch('history.urllib.request.urlopen', side_effect=error):
                with self.assertRaises(ValueError) as caught:
                    get_json('responses/resp_test', 'fake-key')
            self.assertNotIn('secret', str(caught.exception))

    def test_completed_response_is_indexed_for_streaming_and_regular_requests(self):
        for streamed in (False, True):
            saved = Mock()
            with patch('api_client.urllib.request.urlopen', return_value=io.BytesIO(json.dumps(response()).encode())), \
                 patch('api_client.stream_response', return_value=response()):
                result = api_client.ask({**DEFAULTS, 'task_preset': '번역'}, None, 'fake-key',
                                         text='original', on_saved=saved,
                                         on_progress=Mock() if streamed else None)
            self.assertEqual(result['answer'], '번역 답변')
            saved.assert_called_once_with(response())

    def test_index_write_failure_preserves_successful_answer(self):
        saved, logger = Mock(side_effect=OSError('disk failure')), Mock()
        with patch('api_client.urllib.request.urlopen', return_value=io.BytesIO(json.dumps(response()).encode())):
            result = api_client.ask({**DEFAULTS, 'task_preset': '번역'}, None, 'fake-key',
                                    text='original', on_saved=saved, error_logger=logger)
        self.assertEqual(result['answer'], '번역 답변')
        self.assertEqual(logger.call_args.args[0], 'history')


if __name__ == '__main__':
    unittest.main()
