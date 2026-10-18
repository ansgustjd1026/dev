import json,unittest
from unittest.mock import Mock,patch
from app import App,DEFAULTS,payload,ask
from led_response import parse_result,control_instruction

class LedResponseTests(unittest.TestCase):
    def test_strict_schema_sent_for_regular_and_translation_requests(self):
        for task in ('자유 질문','번역'):
            data=payload({**DEFAULTS,'task_preset':task},text='test')
            self.assertTrue(data['text']['format']['strict'])
            self.assertEqual(data['text']['format']['schema']['properties']['led_count']['enum'],list(range(1,10)))
            self.assertIn('led_count',data['instructions'])

    def test_valid_counts_and_bad_packets(self):
        for count in range(1,10):
            self.assertEqual(parse_result(json.dumps(dict(answer='답변',led_count=count)))['led_count'],count)
        for value in ['TRUE','{}','{"answer":"hi","led_count":true}','{"answer":"hi","led_count":"2"}',
                      '{"answer":"hi","led_count":10}','{"answer":"","led_count":1}',
                      '{"answer":"hi","led_count":1,"other":0}']:
            with self.assertRaises(ValueError): parse_result(value)

    def test_answer_display_uses_only_answer_and_model_count(self):
        instance=App.__new__(App)
        instance.settings=DEFAULTS.copy()
        instance.finish_binary=Mock()
        instance.handle_answer(dict(answer='번역 결과',led_count=5))
        self.assertEqual(instance.result_text,'번역 결과')
        instance.finish_binary.assert_called_once_with(5,'번역 결과')

    def test_invalid_count_uses_error_notification(self):
        instance=App.__new__(App)
        instance.settings={**DEFAULTS,'led_error_count':4}
        instance.finish_binary=Mock()
        instance.handle_answer(dict(answer='답변',led_count=100))
        self.assertEqual(instance.finish_binary.call_args.args[0],4)
        self.assertIn('요청 오류',instance.result_text)

    def test_incomplete_response_is_rejected_before_actuation(self):
        import io
        data=dict(status='incomplete',output=[])
        with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(data).encode())):
            with self.assertRaisesRegex(ValueError,'완료되지'):
                ask(DEFAULTS,None,'test',text='test')
