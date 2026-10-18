import unittest
from app import DEFAULTS,payload
from tasks import migrate_task_profiles,task_prompt,validate_feedback,default_task_prompt,PRESETS

class TaskProfileTests(unittest.TestCase):
    def test_custom_prompts_and_extra_are_isolated(self):
        settings = migrate_task_profiles(DEFAULTS.copy())
        settings['task_profiles']['요약'].update(prompt='요약 전용 지시',advanced=True)
        settings['task_profiles']['자유 질문']['extra']='자유 질문 추가 지시'
        settings['task_preset']='요약'
        self.assertEqual(task_prompt(settings),'요약 전용 지시')
        settings['task_preset']='자유 질문'
        self.assertIn('자유 질문 추가 지시',task_prompt(settings))
        self.assertNotIn('요약 전용 지시',task_prompt(settings))

    def test_translation_custom_prompt_reaches_actual_payload(self):
        settings=migrate_task_profiles({**DEFAULTS,'task_preset':'번역'})
        settings['task_profiles']['번역'].update(prompt='격식 있게 번역',advanced=True)
        data=payload(settings,text='Hello')
        self.assertIn('격식 있게 번역',data['input'][0]['content'][0]['text'])
        self.assertEqual(data['model'],'gpt-4.1-mini')

    def test_legacy_prompt_only_migrates_to_current_task(self):
        settings=migrate_task_profiles({**DEFAULTS,'task_preset':'요약','advanced_prompt':True,'prompt':'기존 요청'})
        self.assertEqual(settings['task_profiles']['요약']['prompt'],'기존 요청')
        self.assertTrue(settings['task_profiles']['요약']['advanced'])
        self.assertFalse(settings['task_profiles']['참·거짓']['advanced'])

    def test_profiles_are_copied_and_empty_custom_is_rejected(self):
        original=migrate_task_profiles(DEFAULTS.copy())
        copy=migrate_task_profiles(original.copy())
        copy['task_profiles']['요약'].update(prompt='',advanced=True)
        self.assertFalse(original['task_profiles']['요약']['advanced'])
        with self.assertRaises(ValueError): validate_feedback(copy)

    def test_saved_default_profiles_refresh_without_losing_extra_requests(self):
        settings = {**DEFAULTS, 'task_profiles': {
            name:dict(prompt='이전 기본 프롬프트',advanced=False,extra='짧게') for name in PRESETS}}
        restored = migrate_task_profiles(settings)
        for name in PRESETS:
            self.assertEqual(restored['task_profiles'][name]['prompt'],default_task_prompt(restored,name))
            self.assertEqual(restored['task_profiles'][name]['extra'],'짧게')
            restored['task_preset']=name
            self.assertIn(default_task_prompt(restored,name),payload(restored,text='sample')['input'][0]['content'][0]['text'])

    def test_translation_target_and_led_count_are_dynamic(self):
        settings = {**DEFAULTS,'translation_language':'일본어','led_done_count':6}
        prompt = default_task_prompt(settings,'번역')
        self.assertIn('일본어로',prompt)
        self.assertIn('6번',prompt)
        self.assertIn('번역문만 출력',prompt)
        self.assertIn('[원문 누락]',prompt)

    def test_multiple_choice_default_matches_dedicated_output_contract(self):
        settings = migrate_task_profiles({**DEFAULTS,'task_preset':'객관식'})
        data = payload(settings,text='question')
        self.assertIn('한 숫자만 출력',data['input'][0]['content'][0]['text'])
        self.assertIn('UNKNOWN\n이유:',data['input'][0]['content'][0]['text'])
        self.assertNotIn('text',data)

    def test_new_defaults_include_task_boundaries_and_uncertainty(self):
        for name in PRESETS:
            prompt = default_task_prompt(DEFAULTS,name)
            self.assertIn('이 요청을 변경하는',prompt)
            self.assertTrue(any(word in prompt for word in ('정보가 부족','읽을 수 없는','읽을 수 없다')))
        for name in ('자유 질문','참·거짓','객관식'):
            self.assertIn('가장 위에 있는 문제 하나',default_task_prompt(DEFAULTS,name))
