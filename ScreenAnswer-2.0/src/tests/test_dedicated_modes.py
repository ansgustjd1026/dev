import unittest
from app import payload,DEFAULTS
from led_response import classification_result

class DedicatedModeTests(unittest.TestCase):
    def test_classifiers_skip_structured_led_but_other_tasks_keep_it(self):
        for task in ('참·거짓','객관식'):
            data=payload({**DEFAULTS,'task_preset':task},text='test')
            self.assertNotIn('text',data)
            self.assertIn('dedicated',data['instructions'])
        self.assertIn('text',payload(DEFAULTS,text='test'))

    def test_binary_and_choice_mapping(self):
        for text,count in [('TRUE',1),('FALSE',2),('UNKNOWN\n이유',3)]:
            self.assertEqual(classification_result({'task_preset':'참·거짓'},text)['led_count'],count)
        for number in range(1,10):
            self.assertEqual(classification_result({'task_preset':'객관식'},str(number))['led_count'],number)
        for text in ('0','10','LED 2번'):
            with self.assertRaises(ValueError):classification_result({'task_preset':'객관식'},text)
