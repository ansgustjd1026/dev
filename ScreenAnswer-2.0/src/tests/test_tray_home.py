import unittest
import threading
from unittest.mock import Mock,patch
import pystray
from app import HomeTrayIcon, make_icon
from tray_hover import icon_bounds

class TrayHomeTests(unittest.TestCase):
    def test_native_registration_accepts_long_title_and_locates_own_icon(self):
        ready = threading.Event()
        icon = HomeTrayIcon('ScreenAnswerHoverTest', make_icon('#72d7f3'),
                            '전체 답변 😀\n' * 1000,
                            home_action=lambda: None, hover_action=lambda: None)
        def setup(tray):
            tray.visible = True
            ready.set()
        thread = threading.Thread(target=lambda: icon.run(setup=setup))
        thread.start()
        try:
            self.assertTrue(ready.wait(5))
            self.assertIsNotNone(icon_bounds(icon))
            text = '마지막 문장까지 보존합니다. 😀\n' * 1000
            icon.title = text
            self.assertEqual(icon.title, text)
        finally:
            icon.stop()
            thread.join(5)
            self.assertFalse(thread.is_alive())

    def test_native_tooltip_is_disabled_for_initial_show_and_updates(self):
        icon = HomeTrayIcon.__new__(HomeTrayIcon)
        icon._running = False
        icon._icon_handle = None
        icon.hover_action = Mock()
        with patch.object(pystray.Icon, '_message') as message:
            for code in (0, 1):  # NIM_ADD / NIM_MODIFY, including Explorer restart.
                icon._message(code, 4, szTip='긴 번역 😀' * 1000)
                message.assert_called_with(code, 4, szTip='')

    def test_hover_events_are_coalesced_and_click_dismisses(self):
        icon = HomeTrayIcon.__new__(HomeTrayIcon)
        icon._running = False
        icon._icon_handle = None
        icon.hover_pending = False
        icon.hover_action = Mock()
        icon.dismiss_action = Mock()
        icon.home_action = Mock()
        for _ in range(100):
            icon._on_notify(0, 0x200)
        icon.hover_action.assert_called_once()
        icon._on_notify(0, 0x202)
        icon.dismiss_action.assert_called_once()
        icon.home_action.assert_called_once()

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
