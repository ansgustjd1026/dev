"""Recognize explicit browser-document drags when UIA selection text is absent."""
from dataclasses import dataclass
import ctypes
from ctypes import wintypes
import os

from browser_selection import is_browser


@dataclass(frozen=True)
class BrowserCopyRequest:
    serial: int


def document_at_pointer(auto, point, source):
    """Require a document belonging to the foreground browser, excluding inputs."""
    try:
        focused = auto.GetFocusedControl()
        if focused and focused.IsPassword:
            return False
        control = auto.ControlFromPoint(*point)
        document = False
        for _ in range(32):
            if not control or control.ProcessId == os.getpid() or control.IsPassword:
                return False
            if control.ControlTypeName in ('EditControl', 'ComboBoxControl', 'ScrollBarControl'):
                return False
            document |= control.ControlTypeName == 'DocumentControl'
            if control.NativeWindowHandle == source:
                return document and is_browser(source)
            control = control.GetParentControl()
    except Exception:
        pass
    return False


class BrowserDragTracker:
    def __init__(self):
        self.down = False
        self.start = None
        self.active = None
        self.serial = 0

    def update(self, down, point, source, document=False, cancel=False):
        if cancel or (self.active and self.active[0] != source):
            self.active = None
        if cancel or (self.start and self.start[0] != source):
            self.start = None
        if down and not self.down:
            self.active = None
            self.start = (source, point) if document and not cancel else None
        elif not down and self.down:
            if self.start and not cancel:
                hwnd, origin = self.start
                if max(abs(point[0]-origin[0]), abs(point[1]-origin[1])) >= 6:
                    self.serial += 1
                    anchor = (min(origin[0], point[0]), min(origin[1], point[1]),
                              max(origin[0], point[0]), max(origin[1], point[1]))
                    self.active = (hwnd, BrowserCopyRequest(self.serial), anchor)
            self.start = None
        self.down = down
        return self.active

    def poll(self, auto):
        user = ctypes.windll.user32
        user.GetForegroundWindow.restype = wintypes.HWND
        source = user.GetForegroundWindow()
        point = wintypes.POINT()
        if not user.GetCursorPos(ctypes.byref(point)):
            self.start = self.active = None
            return None
        point = (point.x, point.y)
        down = bool(user.GetAsyncKeyState(1) & 0x8000)
        cancel = any(user.GetAsyncKeyState(key) & 0x8000 for key in (16, 27))
        # Ctrl+A changes the selection; the app's own Ctrl+C must not cancel it.
        cancel |= bool(user.GetAsyncKeyState(17) & 0x8000 and
                       user.GetAsyncKeyState(65) & 0x8000)
        document = down and not self.down and not cancel and document_at_pointer(auto, point, source)
        return self.update(down, point, source, document, cancel)
