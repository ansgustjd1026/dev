import sys
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App


class NoPopupTests(unittest.TestCase):
    def instance(self):
        instance = App.__new__(App)
        instance.busy = False
        instance.dialog = None
        instance.settings = {'key': ''}
        instance.publish = Mock()
        instance.open_settings = Mock()
        return instance

    def test_missing_key_does_not_open_settings_on_input(self):
        instance = self.instance()
        with patch.dict('os.environ', {}, clear=True):
            self.assertIsNone(instance.request_key())
        instance.open_settings.assert_not_called()
        instance.publish.assert_called_once()

    def test_input_does_not_raise_an_existing_settings_window(self):
        instance = self.instance()
        instance.dialog = Mock()
        instance.dialog.winfo_exists.return_value = True
        self.assertIsNone(instance.request_key())
        instance.dialog.lift.assert_not_called()
        instance.open_settings.assert_not_called()


if __name__ == '__main__':
    unittest.main()
