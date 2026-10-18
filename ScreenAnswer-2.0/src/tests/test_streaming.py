import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api_client import ask
from settings_store import DEFAULTS
from streaming import partial_answer, stream_response


def sse(*events):
    return io.BytesIO(b': keepalive\r\n\r\n' + b''.join(
        b'event: message\r\ndata: ' + json.dumps(value).encode() + b'\r\n\r\n' for value in events))


class StreamingTests(unittest.TestCase):
    def test_every_escape_boundary_preserves_answer_without_json_metadata(self):
        answer = '첫 줄\n둘째 줄 "인용" \\ 🙂 마지막'
        raw = json.dumps({'answer': answer, 'led_count': 2})
        for end in range(len(raw) + 1):
            partial = partial_answer(raw[:end])
            self.assertTrue(answer.startswith(partial), repr(partial))
        self.assertEqual(partial_answer(raw), answer)
        self.assertEqual(partial_answer('{"led_count": 2, "answer": "전체"}'), '전체')

    def test_progress_precedes_completion_and_final_envelope_is_validated(self):
        raw = json.dumps({'answer': '전체 번역\n끝입니다.', 'led_count': 2}, ensure_ascii=False)
        final = {'status': 'completed', 'output': [{'type': 'message', 'content': [
            {'type': 'output_text', 'text': raw}]}]}
        seen = []
        stream = sse({'type': 'response.output_text.delta', 'delta': raw[:20], 'item_id': 'a', 'content_index': 0},
                     {'type': 'response.output_text.delta', 'delta': raw[20:], 'item_id': 'a', 'content_index': 0},
                     {'type': 'response.completed', 'response': final})
        with patch('urllib.request.urlopen', return_value=stream) as urlopen:
            result = ask({**DEFAULTS, 'task_preset': '번역'}, None, 'test-key', text='Hello', on_progress=seen.append)
            request = urlopen.call_args.args[0]
            self.assertIsNone(request.data)
        self.assertEqual(result, {'answer': '전체 번역\n끝입니다.', 'led_count': 2})
        self.assertTrue(seen)
        self.assertNotIn('led_count', seen[0])

    def test_incomplete_or_disconnected_stream_never_becomes_success(self):
        for terminal in ([], [{'type': 'response.incomplete'}], [{'type': 'response.failed'}], [{'type': 'error'}]):
            seen = []
            stream = sse({'type': 'response.output_text.delta', 'delta': '{"answer":"일부'}, *terminal)
            with self.assertRaises(ValueError):
                stream_response(stream, seen.append)
            self.assertEqual(seen, ['일부'])

    def test_stream_request_keeps_model_prompt_and_schema(self):
        settings = {**DEFAULTS, 'task_preset': '번역'}
        captured = []
        def open_request(request, **kwargs):
            captured.append(json.loads(request.data))
            return sse({'type': 'response.completed', 'response': {'status': 'completed', 'output': []}})
        with patch('urllib.request.urlopen', side_effect=open_request):
            with self.assertRaises(ValueError):
                ask(settings, None, 'test-key', text='Hello', on_progress=lambda text: None)
        self.assertTrue(captured[0]['stream'])
        self.assertEqual(captured[0]['model'], 'gpt-4.1-mini')
        self.assertEqual(captured[0]['text']['format']['type'], 'json_schema')


if __name__ == '__main__':
    unittest.main()
