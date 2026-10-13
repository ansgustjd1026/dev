"""Physical Windows monitor bounds, including negative desktop coordinates."""
import ctypes as C
from ctypes import wintypes as W


class MonitorInfo(C.Structure):
    _fields_ = [('cbSize', W.DWORD), ('rcMonitor', W.RECT),
                ('rcWork', W.RECT), ('dwFlags', W.DWORD)]


def monitor_rectangle(monitor, work=False):
    user = C.windll.user32
    user.GetMonitorInfoW.argtypes = [W.HANDLE, C.POINTER(MonitorInfo)]
    info = MonitorInfo()
    info.cbSize = C.sizeof(info)
    if not monitor or not user.GetMonitorInfoW(monitor, C.byref(info)):
        raise C.WinError()
    rect = info.rcWork if work else info.rcMonitor
    if rect.right <= rect.left or rect.bottom <= rect.top:
        raise ValueError('모니터 영역을 확인할 수 없습니다.')
    return rect.left, rect.top, rect.right, rect.bottom


def monitor_at_point(point, work=False):
    user = C.windll.user32
    user.MonitorFromPoint.argtypes = [W.POINT, W.DWORD]
    user.MonitorFromPoint.restype = W.HANDLE
    monitor = user.MonitorFromPoint(W.POINT(int(point[0]), int(point[1])), 2)
    return monitor_rectangle(monitor, work=work)


def monitor_workarea(anchor):
    return monitor_at_point((anchor[0], anchor[3]), work=True)


def capture_bounds(source=None, point=None):
    # Gesture positions matter when one window spans multiple monitors.
    if point is not None:
        return monitor_at_point(point)
    user = C.windll.user32
    user.GetForegroundWindow.restype = W.HWND
    source = source or user.GetForegroundWindow()
    if source:
        user.MonitorFromWindow.argtypes = [W.HWND, W.DWORD]
        user.MonitorFromWindow.restype = W.HANDLE
        return monitor_rectangle(user.MonitorFromWindow(source, 2))
    cursor = W.POINT()
    user.GetCursorPos.argtypes = [C.POINTER(W.POINT)]
    if not user.GetCursorPos(C.byref(cursor)):
        raise C.WinError()
    return monitor_at_point((cursor.x, cursor.y))
