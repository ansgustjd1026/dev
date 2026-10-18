import base64
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import DEFAULTS, ask, payload
from references import reference_inputs
from request_body import encode_request


class RequestMemoryTests(unittest.TestCase):
    def test_json_roundtrip_across_escape_and_unicode_boundaries(self):
        data = {'text': '한글🙂"\\\n\t\r\b\f\u0000\ud800' * 30,
                'empty': '', 'key"\\': {'array': [None, True, False, 12, -7, 1.25, {}, []]},
                'tuple': ('a', 'b')}
        with patch('request_body.STRING_CHUNK_SIZE',3):
            actual = encode_request(data)
        self.assertEqual(json.loads(actual), json.loads(json.dumps(data)))

    def test_large_request_retains_image_and_reference_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / '자료.txt'
            raw = bytes(range(256)) * 1000
            path.write_bytes(raw)
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': [str(path)]}
            data = payload(settings, b'jpeg-example')
            self.assertEqual(json.loads(encode_request(data)), data)
            file_data = next(item['file_data'] for item in data['input'][0]['content'] if item['type']=='input_file')
            self.assertEqual(base64.b64decode(file_data.split(',')[1],validate=True),raw)

    def test_short_reads_preserve_base64_without_internal_padding(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'reference.txt'
            path.write_bytes(b'placeholder')
            raw = bytes(range(31))
            class ShortReader(io.BytesIO):
                def read(self, size=-1):
                    self.asserted_sizes.append(size)
                    return super().read(min(size,2))
            stream = ShortReader(raw)
            stream.asserted_sizes = []
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': [str(path)]}
            with patch('references.READ_CHUNK_BYTES',7), patch('references.Path.open',return_value=stream):
                parts = reference_inputs(settings)
            self.assertEqual(base64.b64decode(parts[0]['file_data'].split(',')[1],validate=True),raw)
            self.assertTrue(all(0 < size <= 7 for size in stream.asserted_sizes))
            self.assertTrue(stream.closed)

    def test_file_growth_and_empty_file_are_rejected_before_network(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'reference.txt'
            path.write_bytes(b'x')
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': [str(path)]}
            for raw in (b'123456', b''):
                with self.subTest(raw=raw), patch('references.MAX_BYTES',5), \
                        patch('references.Path.open',return_value=io.BytesIO(raw)), patch('urllib.request.urlopen') as network:
                    with self.assertRaises(ValueError): ask(settings,None,'fake-test-key',text='question')
                    network.assert_not_called()

    def test_actual_total_limit_is_enforced_after_files_grow(self):
        with tempfile.TemporaryDirectory() as folder:
            paths = [Path(folder)/'a.txt', Path(folder)/'b.txt']
            for path in paths: path.write_bytes(b'x')
            settings = {**DEFAULTS, 'reference_files_enabled': True, 'reference_files': list(map(str,paths))}
            streams = [io.BytesIO(b'1234'),io.BytesIO(b'5678')]
            with patch('references.MAX_BYTES',7),patch('references.Path.open',side_effect=streams):
                with self.assertRaises(ValueError): reference_inputs(settings)
            self.assertTrue(all(stream.closed for stream in streams))

    def test_request_bytes_are_valid_and_released_after_upload(self):
        reply = {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'{"answer":"ok","led_count":1}'}]}]}
        requests = []
        def respond(request, timeout):
            self.assertIsInstance(request.data,bytes)
            self.assertEqual(json.loads(request.data),payload(DEFAULTS,text='question'))
            requests.append(request)
            return io.BytesIO(json.dumps(reply).encode())
        with patch('urllib.request.urlopen',side_effect=respond):
            self.assertEqual(ask(DEFAULTS,None,'fake-test-key',text='question'),{'answer':'ok','led_count':1})
        self.assertIsNone(requests[0].data)


if __name__ == '__main__': unittest.main()
