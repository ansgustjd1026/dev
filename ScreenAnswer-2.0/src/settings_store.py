"""Settings defaults, migration, validation and atomic storage without GUI code."""
from datetime import datetime
import json
import os
from pathlib import Path
from blink import BINARY_PROMPT, LEGACY_BINARY_PROMPT
from diagnostics import record_error
from hotkeys import parse_hotkey
from mouse import click_number, click_interval
from selection import parse_delay_ms
from tasks import PRESETS, migrate_task_profiles, validate_feedback

APP_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'ScreenAnswer'

CONFIG = APP_DIR / 'settings.json'

DEFAULTS = dict(settings_version=4, auto_selection=True, screen_enabled=True,
    bubble_enabled=False, tray_icon_changes=True, selection_delay_ms=1100, answer_transparency=0,
    browser_selection_copy=True,
    mouse_circle_enabled=True, mouse_click_enabled=True, mouse_click_count=3, mouse_click_interval_ms=500,
    hotkey='Ctrl+Alt+Q', manual_input_enabled=True, manual_input_show_panel=True, manual_input_hotkey='Ctrl+Alt+Space', model='gpt-6.1-sol',
    prompt=PRESETS['자유 질문'], task_preset='자유 질문', advanced_prompt=False, extra_request='',
    led_enabled=True, advanced_feedback=False, led_mode='자동', led_done_count=1, led_error_count=3,
    led_true_count=1, led_false_count=2, led_unknown_count=3, led_interval_ms=200,
    translation_fast=True, translation_model='gpt-4.1-mini', translation_language='한국어', translation_references=False,
    reference_files_enabled=False, reference_files=(), file_search_enabled=False, vector_store_id='', key='', timeout=180)

def load_settings(warnings=None, config=None):
    config = CONFIG if config is None else config
    try:
        return _load_settings(config)
    except (OSError, UnicodeError, ValueError, TypeError, AttributeError) as error:
        record_error('settings', error)
        # Preserve the original bytes, including an encrypted key, before a save
        # can replace the damaged configuration. Never put its contents in errors.
        message = '설정을 읽을 수 없어 기본 설정으로 시작했습니다.'
        try:
            backup = config.with_name('settings.recovery-' + datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '.json')
            backup.write_bytes(config.read_bytes())
            message += ' 기존 설정은 ' + backup.name + '에 보관했습니다.'
        except OSError:
            message += ' 기존 설정을 백업하지 못했습니다. 설정 파일을 확인하세요.'
        if warnings is not None:
            warnings.append(message)
        return migrate_task_profiles(DEFAULTS.copy())

def _load_settings(config):
    if not config.exists():
        return migrate_task_profiles(DEFAULTS.copy())
    data = json.loads(config.read_text(encoding='utf-8'))
    if not isinstance(data, dict):
        raise ValueError('설정은 객체여야 합니다.')
    for name, default in DEFAULTS.items():
        if name not in data or name == 'reference_files':
            continue
        if type(data[name]) is not type(default):
            raise ValueError('설정 값의 형식이 올바르지 않습니다.')
    if data.get('prompt') == LEGACY_BINARY_PROMPT:
        data['prompt'] = BINARY_PROMPT
    if 'task_preset' not in data:
        data.update(task_preset='자유 질문', advanced_prompt=data.get('prompt') not in (None, BINARY_PROMPT), led_mode='자동')
    data.pop('full_answer_enabled', None)
    data.pop('clipboard_enabled', None)
    data.pop('clipboard_hotkey', None)
    previous_display = data.pop('selection_display', None)
    if 'bubble_enabled' not in data and previous_display is not None:
        data['bubble_enabled'] = previous_display == 'near'
    # Migrate earlier defaults once; preserve choices saved by this version.
    if data.get('settings_version', 1) < 4 and data.get('model') in ('gpt-4.1-mini', 'gpt-6-astra'):
        data['model'] = DEFAULTS['model']
    data['settings_version'] = 4
    if data.get('timeout') == 90:
        data['timeout'] = DEFAULTS['timeout']
    data.pop('led_rules', None)
    data.pop('answer_rules_enabled', None)
    settings = migrate_task_profiles({**DEFAULTS, **data})
    parse_hotkey(settings['hotkey'])
    parse_hotkey(settings['manual_input_hotkey'])
    parse_delay_ms(settings['selection_delay_ms'])
    parse_transparency(settings['answer_transparency'])
    click_number(settings['mouse_click_count'])
    click_interval(settings['mouse_click_interval_ms'])
    if settings['timeout'] <= 0 or not settings['model'].strip() or not settings['translation_language'].strip():
        raise ValueError('모델, 언어와 제한 시간을 확인하세요.')
    if not isinstance(settings['reference_files'], (list, tuple)) or not all(isinstance(path, str) for path in settings['reference_files']):
        raise ValueError('참고 파일 목록이 올바르지 않습니다.')
    for profile in settings['task_profiles'].values():
        if (type(profile.get('advanced', False)) is not bool or
                not isinstance(profile.get('prompt', ''), str) or
                not isinstance(profile.get('extra', ''), str)):
            raise ValueError('작업 프롬프트 형식이 올바르지 않습니다.')
    validate_feedback(settings)
    return settings

def save_settings(data, config=None):
    config = CONFIG if config is None else config
    config.parent.mkdir(parents=True, exist_ok=True)
    temp = config.with_suffix('.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    temp.replace(config)

def parse_transparency(value):
    text = str(value).strip()
    if not text.isdecimal() or not 0 <= int(text) <= 90:
        raise ValueError('답변창 투명도는 0~90% 사이의 정수로 입력하세요.')
    return int(text)
