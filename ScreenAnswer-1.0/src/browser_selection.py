"""Copy browser selections once per request, preserving the user's clipboard."""
from contextlib import contextmanager
import ctypes as C
from ctypes import wintypes as W
import os
import time
from blink import Input


def window_pid(user, hwnd):
    user.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
    pid = W.DWORD()
    user.GetWindowThreadProcessId(hwnd, C.byref(pid))
    return pid.value


def is_browser(hwnd):
    user, kernel = C.windll.user32, C.windll.kernel32
    pid = window_pid(user, hwnd)
    kernel.OpenProcess.argtypes = [W.DWORD, W.BOOL, W.DWORD]
    kernel.OpenProcess.restype = W.HANDLE
    process = kernel.OpenProcess(0x1000, False, pid)
    if not process:
        return False
    try:
        path = C.create_unicode_buffer(32768)
        size = W.DWORD(len(path))
        kernel.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, C.POINTER(W.DWORD)]
        return bool(kernel.QueryFullProcessImageNameW(process, 0, path, C.byref(size)) and
                    os.path.basename(path.value).lower() in ('msedge.exe', 'chrome.exe'))
    finally:
        kernel.CloseHandle.argtypes = [W.HANDLE]
        kernel.CloseHandle(process)


class Clipboard:
    def __init__(self, hwnd):
        self.hwnd = hwnd
        self.user, self.kernel, self.ole, self.gdi = (
            C.windll.user32, C.windll.kernel32, C.windll.ole32, C.windll.gdi32)
        for name, args, result in (
            ('OpenClipboard', [W.HWND], W.BOOL), ('GetClipboardData', [W.UINT], W.HANDLE),
            ('SetClipboardData', [W.UINT, W.HANDLE], W.HANDLE),
            ('GetClipboardOwner', [], W.HWND), ('GetClipboardSequenceNumber', [], W.DWORD),
            ('GetForegroundWindow', [], W.HWND), ('EnumClipboardFormats', [W.UINT], W.UINT),
            ('SendInput', [W.UINT, C.POINTER(Input), C.c_int], W.UINT)):
            function = getattr(self.user, name)
            function.argtypes, function.restype = args, result
        for name, args, result in (
            ('GlobalLock', [W.HANDLE], C.c_void_p), ('GlobalUnlock', [W.HANDLE], W.BOOL),
            ('GlobalSize', [W.HANDLE], C.c_size_t), ('GlobalFree', [W.HANDLE], W.HANDLE)):
            function = getattr(self.kernel, name)
            function.argtypes, function.restype = args, result
        self.ole.OleDuplicateData.argtypes = [W.HANDLE, W.WORD, W.UINT]
        self.ole.OleDuplicateData.restype = W.HANDLE
        self.gdi.CopyEnhMetaFileW.argtypes = [W.HANDLE, W.LPCWSTR]
        self.gdi.CopyEnhMetaFileW.restype = W.HANDLE
        for name in ('DeleteObject', 'DeleteMetaFile', 'DeleteEnhMetaFile'):
            getattr(self.gdi, name).argtypes = [W.HANDLE]

    @contextmanager
    def opened(self, timeout=.8):
        # Edge and clipboard listeners may briefly keep the clipboard open,
        # including after its sequence number changes. Wait on the request
        # worker; never resend Ctrl+C or reuse stale text to resolve contention.
        deadline = time.monotonic() + timeout
        while not self.user.OpenClipboard(self.hwnd):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError('클립보드가 계속 사용 중입니다. 잠시 후 원문을 다시 선택해 주세요.')
            time.sleep(min(.02, remaining))
        try:
            yield
        finally:
            self.user.CloseClipboard()

    def sequence(self):
        return self.user.GetClipboardSequenceNumber()

    def foreground(self):
        return self.user.GetForegroundWindow()

    def owner_pid(self):
        return window_pid(self.user, self.user.GetClipboardOwner())

    def copy(self, source):
        if self.foreground() != source or any(self.user.GetAsyncKeyState(key) & 0x8000
                                             for key in (1, 2, 16, 17, 18, 91, 92)):
            raise ValueError('선택이나 창이 변경되었습니다. 키를 놓고 다시 선택해 주세요.')
        inputs = (Input * 4)()
        for item, vk, flags in zip(inputs, (17, 67, 67, 17), (0, 0, 2, 2)):
            item.type, item.keyboard.vk, item.keyboard.flags = 1, vk, flags
        if self.user.SendInput(4, inputs, C.sizeof(Input)) != 4:
            releases = (Input * 2)(inputs[2], inputs[3])
            self.user.SendInput(2, releases, C.sizeof(Input))
            raise ValueError('선택 텍스트를 복사하지 못했습니다. 다시 선택해 주세요.')

    def backup(self):
        snapshot, total = {}, 0
        try:
            with self.opened():
                def next_format(previous):
                    self.kernel.SetLastError(0)
                    value = self.user.EnumClipboardFormats(previous)
                    if not value and self.kernel.GetLastError():
                        raise ValueError('클립보드 형식을 읽지 못했습니다. 다시 시도해 주세요.')
                    return value
                fmt = next_format(0)
                while fmt:
                    if len(snapshot) >= 128 or fmt == 0x80 or 0x200 <= fmt <= 0x3ff:
                        raise ValueError('현재 클립보드 형식을 보관할 수 없습니다. 브라우저 복사 읽기를 꺼 주세요.')
                    handle = self.user.GetClipboardData(fmt)
                    base = {0x82: 2, 0x83: 3, 0x8e: 14}.get(fmt, fmt)
                    # GDI handles are not HGLOBALs. Calling GlobalSize on a
                    # bitmap/palette/metafile handle can terminate the process.
                    if base not in (2, 3, 9, 14):
                        total += self.kernel.GlobalSize(handle)
                    if not handle or total > 64 * 1024 * 1024:
                        raise ValueError('클립보드 내용을 보관할 수 없습니다. 브라우저 복사 읽기를 꺼 주세요.')
                    copied = (self.gdi.CopyEnhMetaFileW(handle, None) if base == 14 else
                              self.ole.OleDuplicateData(handle, base, 0))
                    if not copied:
                        raise ValueError('클립보드 내용을 보관할 수 없습니다. 다시 시도해 주세요.')
                    snapshot[fmt] = copied
                    fmt = next_format(fmt)
                original_sequence = self.sequence()
            return snapshot, original_sequence
        except Exception:
            self.free(snapshot)
            raise

    def text(self):
        handle = self.user.GetClipboardData(13)
        size = self.kernel.GlobalSize(handle) if handle else 0
        if not 2 <= size <= 200004 or size % 2:
            raise ValueError('복사한 텍스트가 없거나 너무 깁니다. 원문을 다시 선택해 주세요.')
        pointer = self.kernel.GlobalLock(handle)
        if not pointer:
            raise ValueError('복사한 텍스트를 읽지 못했습니다. 다시 선택해 주세요.')
        try:
            return C.string_at(pointer, size).decode('utf-16-le').split('\0', 1)[0]
        finally:
            self.kernel.GlobalUnlock(handle)

    def restore(self, snapshot):
        if not self.user.EmptyClipboard():
            raise ValueError('기존 클립보드 내용을 복원하지 못했습니다.')
        for fmt, handle in list(snapshot.items()):
            if not self.user.SetClipboardData(fmt, handle):
                raise ValueError('기존 클립보드 형식을 복원하지 못했습니다.')
            del snapshot[fmt]  # Windows now owns this duplicated handle.

    def free(self, snapshot):
        class MetafilePicture(C.Structure):
            _fields_ = [('mm', W.LONG), ('x', W.LONG), ('y', W.LONG), ('metafile', W.HANDLE)]
        for fmt, handle in snapshot.items():
            base = {0x82: 2, 0x83: 3, 0x8e: 14}.get(fmt, fmt)
            if base in (2, 9):
                self.gdi.DeleteObject(handle)
            elif base == 14:
                self.gdi.DeleteEnhMetaFile(handle)
            else:
                if base == 3:
                    pointer = self.kernel.GlobalLock(handle)
                    if pointer:
                        self.gdi.DeleteMetaFile(C.cast(pointer, C.POINTER(MetafilePicture)).contents.metafile)
                        self.kernel.GlobalUnlock(handle)
                self.kernel.GlobalFree(handle)
        snapshot.clear()


def copied_selection(source, clipboard, valid, timeout=.8):
    if not valid():
        raise ValueError('선택이 변경되었습니다. 원문을 다시 선택해 주세요.')
    snapshot, before = clipboard.backup()
    restored, source_pid = False, 0
    try:
        if not valid() or clipboard.sequence() != before:
            raise ValueError('선택이나 클립보드가 변경되었습니다. 다시 선택해 주세요.')
        source_pid = window_pid(clipboard.user, source)
        clipboard.copy(source)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if clipboard.sequence() != before:
                try:
                    with clipboard.opened():
                        if clipboard.owner_pid() != source_pid:
                            raise ValueError('다른 앱에서 복사한 내용은 전송하지 않습니다. 다시 선택해 주세요.')
                        try:
                            text = clipboard.text()
                        finally:
                            clipboard.restore(snapshot)
                            restored = True
                    if not valid() or clipboard.foreground() != source:
                        raise ValueError('선택이나 창이 변경되었습니다. 원문을 다시 선택해 주세요.')
                    return text
                except ValueError:
                    raise
            time.sleep(.01)
        raise ValueError('브라우저에서 선택 텍스트를 복사하지 못했습니다. 원문을 다시 선택해 주세요.')
    finally:
        try:
            if not restored and source_pid and clipboard.sequence() != before:
                with clipboard.opened():
                    if clipboard.owner_pid() == source_pid:
                        clipboard.restore(snapshot)
        finally:
            clipboard.free(snapshot)
