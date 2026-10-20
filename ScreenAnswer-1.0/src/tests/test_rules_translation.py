import unittest
from unittest.mock import patch
from app import DEFAULTS, payload
from tasks import feedback, rule_preset, migrate_rules, task_prompt, validate_feedback

class GeneralRulesTests(unittest.TestCase):
    def test_rules_independent_of_task_and_fallback(self):
        settings = {**DEFAULTS,'task_preset':'요약','answer_rules_enabled':True,
                    'led_done_count':4,'led_rules':[dict(match='첫 줄 일치',value='APPROVED',count=2)]}
        self.assertEqual(feedback(settings,'approved\n설명')[0],2)
        self.assertEqual(feedback(settings,'Unapproved')[0],4)
        self.assertEqual(feedback(settings,'설명에 APPROVED 포함')[0],4)
        self.assertEqual(feedback(settings,'오류',error=True)[0],3)
        settings['answer_rules_enabled']=False
        self.assertEqual(feedback(settings,'APPROVED')[0],4)

    def test_first_matching_rule_full_text_and_numbers(self):
        settings = {**DEFAULTS,'answer_rules_enabled':True,'led_rules':[
            dict(match='답변 전체 일치',value='OK',count=2),
            dict(match='첫 줄 일치',value='OK',count=5),
            dict(match='첫 줄 숫자',value='',count=1)]}
        self.assertEqual(feedback(settings,'OK')[0],2)
        self.assertEqual(feedback(settings,'OK\n설명')[0],5)
        self.assertEqual(feedback(settings,'9\n설명')[0],9)
        self.assertEqual(feedback(settings,'19\n설명')[0],1)

    def test_legacy_migration_preserves_choices(self):
        settings = migrate_rules(dict(task_preset='참·거짓',led_mode='답에 따라 알림',led_false_count=5))
        self.assertEqual(feedback(settings,'FALSE')[0],5)
        self.assertFalse(migrate_rules(dict(task_preset='참·거짓',led_mode='완료 알림'))['answer_rules_enabled'])
        existing = dict(led_rules=[],answer_rules_enabled=False)
        self.assertEqual(migrate_rules(existing),existing)

    def test_invalid_rules_rejected(self):
        for rule in [dict(match='첫 줄 일치',value='',count=1),dict(match='첫 줄 일치',value='OK',count=10),dict(match='unknown',value='OK',count=1)]:
            with self.assertRaises(ValueError):
                validate_feedback({**DEFAULTS,'led_rules':[rule]})

class TranslationTests(unittest.TestCase):
    def test_translation_routes_model_and_skips_references(self):
        settings = {**DEFAULTS,'task_preset':'번역','advanced_prompt':True,'prompt':'문제를 풀어라',
                    'file_search_enabled':True,'vector_store_id':'bad',
                    'reference_files_enabled':True,'reference_files':['missing.pdf']}
        with patch('app.reference_inputs',return_value=[]) as refs:
            data = payload(settings,text='Translate this question.')
        self.assertEqual(data['model'],'gpt-4.1-mini')
        self.assertNotIn('reasoning',data)
        self.assertNotIn('tools',data)
        self.assertFalse(refs.call_args.args[0]['reference_files_enabled'])
        self.assertNotIn('문제를 풀어라',data['input'][0]['content'][0]['text'])
        self.assertIn('번역문만 출력',data['input'][0]['content'][0]['text'])
        self.assertTrue(settings['file_search_enabled'])

    def test_translation_can_use_general_model_and_references(self):
        settings = {**DEFAULTS,'task_preset':'번역','translation_fast':False,'translation_references':True,
                    'file_search_enabled':True,'vector_store_id':'vs_test','translation_language':'일본어'}
        data = payload(settings,text='Hello')
        self.assertEqual(data['model'],settings['model'])
        self.assertIn('tools',data)
        self.assertIn('일본어',task_prompt(settings))

    def test_other_tasks_keep_existing_model(self):
        self.assertEqual(payload(DEFAULTS,text='Hello')['model'],DEFAULTS['model'])
