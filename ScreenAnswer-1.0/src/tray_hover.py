"""Locate this application's own notification icon without taking focus."""
import ctypes as C
from ctypes import wintypes as W


class IconIdentifier(C.Structure):
    _fields_ = [('cbSize', W.DWORD), ('hWnd', W.HWND), ('uID', W.UINT),
                ('guidItem', C.c_ubyte * 16)]


def icon_bounds(icon):
    if not icon._hwnd:
        return None
    # pystray 0.19.5 supplies hID (not the structure field uID) when
    # registering the icon, so its actual native uID remains zero.
    identity = IconIdentifier(C.sizeof(IconIdentifier), icon._hwnd, 0)
    rect = W.RECT()
    get_rect = C.windll.shell32.Shell_NotifyIconGetRect
    get_rect.argtypes = [C.POINTER(IconIdentifier), C.POINTER(W.RECT)]
    get_rect.restype = C.c_long
    if get_rect(C.byref(identity), C.byref(rect)) != 0:
        return None
    return rect.left, rect.top, rect.right, rect.bottom


def cursor_position():
    point = W.POINT()
    if not C.windll.user32.GetCursorPos(C.byref(point)):
        return None
    return point.x, point.y


def contains(rect, point, margin=0):
    return bool(rect and point and rect[0] - margin <= point[0] < rect[2] + margin
                and rect[1] - margin <= point[1] < rect[3] + margin)
