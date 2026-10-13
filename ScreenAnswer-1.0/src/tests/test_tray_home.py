import unittest
from unittest.mock import Mock,patch
import pystray
from app import HomeTrayIcon

class TrayHomeTests(unittest.TestCase):
    def test_single_click_opens_home_and_right_click_preserved(self):
        icon=HomeTrayIcon.__new__(HomeTrayIcon)
        icon.home_action=Mock()
        icon._running=False
        icon._icon_handle=None
        with patch.object(pystray.Icon,'_on_notify') as original:
            icon._on_notify(0,0x202)
            icon.home_action.assert_called_once()
            original.assert_not_called()
            icon._on_notify(0,0x205)
            original.assert_called_once_with(0,0x205)
            icon._on_notify(0,0x203)
            self.assertEqual(icon.home_action.call_count,1)
            icon._on_notify(0,0x202)
            self.assertEqual(icon.home_action.call_count,2)
