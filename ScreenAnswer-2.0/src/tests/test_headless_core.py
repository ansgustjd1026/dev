"""Core workflows can run without installed GUI or screenshot dependencies."""
import subprocess
import sys
import unittest
from pathlib import Path


class HeadlessCoreTests(unittest.TestCase):
    def test_settings_and_api_work_without_gui_packages(self):
        script = r'''
import io, json, sys, tempfile
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import api_client, settings_store, credentials, hotkeys
assert not any(name in sys.modules for name in ('tkinter','PIL','pystray','uiautomation'))
with tempfile.TemporaryDirectory() as folder:
    config = Path(folder)/'nested'/'settings.json'
    saved = {**settings_store.DEFAULTS, 'key':'encrypted-placeholder', 'task_preset':'번역', 'led_done_count':7}
    settings_store.save_settings(saved, config=config)
    warnings=[]
    settings = settings_store.load_settings(warnings, config=config)
    assert warnings == []
    assert settings['key'] == 'encrypted-placeholder'
    data = api_client.payload(settings, text='Hello')
    assert data['model'] == 'gpt-4.1-mini'
    assert '7번' in data['input'][0]['content'][0]['text']
    reply = {'status':'completed','output':[{'type':'message','content':[{'type':'output_text','text':'{"answer":"Hello","led_count":7}'}]}]}
    def respond(request, timeout):
        assert json.loads(request.data) == data
        assert request.headers['Authorization'] == 'Bearer fake-test-key'
        return io.BytesIO(json.dumps(reply).encode())
    with patch('urllib.request.urlopen', side_effect=respond):
        assert api_client.ask(settings,None,'fake-test-key',text='Hello') == {'answer':'Hello','led_count':7}
assert hotkeys.parse_hotkey('Ctrl+Alt+Q') == (0x4003,ord('Q'))
assert not any(name in sys.modules for name in ('tkinter','PIL','pystray','uiautomation'))
'''
        result = subprocess.run([sys.executable, '-S', '-c', script,
                                 str(Path(__file__).resolve().parents[1])],
                                capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__': unittest.main()
