"""Read only the selected UIA text; never copy, type, click, or capture."""
import ctypes
import os
import threading
import time


def parse_delay_ms(value):
    text = str(value).strip()
    if not text.isdecimal() or not 0 <= int(text) <= 30000:
        raise ValueError('선택 대기 시간은 0~30,000ms 사이의 정수로 입력하세요.')
    return int(text)


class SelectionGate:
    def __init__(self, delay=1.1, cooldown=3.0):
        self.delay, self.cooldown = delay, cooldown
        self.initialized = False
        self.candidate = None
        self.since = 0
        self.sent = None
        self.last_send = float('-inf')
        self.selecting = False

    def observe(self, sample, now, selecting=False):
        released = self.selecting and not selecting
        self.selecting = selecting
        # The selection already present when enabling is a baseline, not a request.
        if not self.initialized:
            self.initialized = True
            self.candidate = sample
            self.sent = None if selecting else sample
            self.since = now
            return None
        if selecting or sample != self.candidate:
            self.candidate, self.since = sample, now
            if sample is None:
                self.sent = None
            return None
        if released:
            self.since = now
        if not sample or sample == self.sent:
            return None
        if now - self.since < self.delay or now - self.last_send < self.cooldown:
            return None
        self.sent, self.last_send = sample, now
        return sample


def selected_text(auto, own_pid=None, with_position=False):
    own_pid = os.getpid() if own_pid is None else own_pid
    foreground = auto.GetForegroundControl()
    if not foreground or foreground.ProcessId == own_pid:
        return None
    source_pid = foreground.ProcessId
    hwnd = foreground.NativeWindowHandle
    try:
        focused = auto.GetFocusedControl()
        if focused and (focused.ProcessId == own_pid or focused.IsPassword):
            return None
    except Exception:
        focused = None

    def chain(control):
        controls = []
        for _ in range(24):
            if not control:
                break
            try:
                if control.ProcessId == own_pid or control.IsPassword:
                    return []
                controls.append(control)
                if control.NativeWindowHandle == hwnd:
                    break
                control = control.GetParentControl()
            except Exception:
                break
        return controls

    def read(controls, require_window=False):
        if not controls:
            return None
        # Chromium renderers may use a different PID from their browser window.
        # Verify ancestry instead of rejecting those children by PID alone.
        attached = any(c.NativeWindowHandle == hwnd for c in controls)
        if not attached and (require_window or controls[0].ProcessId != source_pid):
            return None
        for control in controls:
            try:
                pattern = control.GetPattern(auto.PatternId.TextPattern)
                if not pattern:
                    continue
                ranges = pattern.GetSelection() or []
            except Exception:
                continue
            # Refuse excessive multi-selection rather than sending a partial problem.
            if len(ranges) > 16:
                return None
            try:
                chunks, size = [], 0
                for selected in ranges:
                    chunk = selected.GetText(50001 - size)
                    chunks.append(chunk)
                    size += len(chunk) + (1 if len(chunks) > 1 else 0)
                    if size > 50000:
                        return None
                text = '\n'.join(chunks).strip()
            except Exception:
                continue
            if text:
                if len(text) > 50000:
                    return None
                if not with_position:
                    return hwnd, text
                anchor = None
                try:
                    for selected in ranges:
                        for rect in selected.GetBoundingRectangles():
                            if rect.right > rect.left and rect.bottom > rect.top:
                                anchor = (int(rect.left), int(rect.top), int(rect.right), int(rect.bottom))
                except Exception:
                    pass
                if anchor is None:
                    from ctypes import wintypes
                    point = wintypes.POINT()
                    if ctypes.windll.user32.GetCursorPos(ctypes.byref(point)):
                        anchor = (point.x, point.y, point.x, point.y)
                return hwnd, text, anchor
        return None

    result = read(chain(focused))
    if result:
        return result
    # Web page selection often does not focus its Document element. The element
    # beneath the pointer provides an independent route to that document.
    try:
        x, y = auto.GetCursorPos()
        return read(chain(auto.ControlFromPoint(x, y)), require_window=True)
    except Exception:
        pass
    return None


class SelectionWatcher:
    def __init__(self, events, delay_ms=1100):
        self.events = events
        self.enabled = threading.Event()
        self.suspended = threading.Event()
        self.stop = threading.Event()
        self.generation = 0
        self.delay_ms = parse_delay_ms(delay_ms)
        self.current = None
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def set_delay(self, value):
        delay_ms = parse_delay_ms(value)
        if delay_ms != self.delay_ms:
            self.delay_ms = delay_ms
            self.generation += 1

    def set_enabled(self, value):
        self.generation += 1
        self.current = None
        if value:
            self.enabled.set()
        else:
            self.enabled.clear()

    def run(self):
        auto = None
        initializer = None
        generation = -1
        gate = SelectionGate()
        last_state = None
        try:
            while not self.stop.wait(min(0.25, max(0.05, getattr(self, 'delay_ms', 1100) / 2000))):
                if not self.enabled.is_set():
                    self.current = None
                    if gate.candidate is not None or gate.sent is not None:
                        gate = SelectionGate()
                    last_state = None
                    generation = -1
                    continue
                if auto is None:
                    try:
                        import uiautomation as auto
                        initializer = auto.UIAutomationInitializerInThread()
                        # Ensure the COM client can load before reading anything.
                        auto.GetRootControl()
                    except Exception:
                        auto = None
                        if initializer:
                            del initializer
                            initializer = None
                        self.enabled.clear()
                        self.events.put(('selection_error', None))
                        continue
                active_generation = self.generation
                if generation != active_generation:
                    gate = SelectionGate(delay=getattr(self, 'delay_ms', 1100) / 1000, cooldown=0)
                    generation = active_generation
                try:
                    sample = selected_text(auto, with_position=True)
                    signature = sample[:2] if sample else None
                    self.current = signature
                    state = (active_generation, signature)
                    if state != last_state:
                        last_state = state
                        self.events.put(('selection_state', state))
                    selecting = any(ctypes.windll.user32.GetAsyncKeyState(key) & 0x8000 for key in (1, 16))
                    if self.suspended.is_set():
                        generation = -1
                        continue
                    ready = gate.observe(signature, time.monotonic(), selecting)
                    if ready and self.enabled.is_set() and not self.suspended.is_set() and active_generation == self.generation:
                        self.events.put(('selection', (active_generation, sample)))
                except Exception:
                    # A provider can disappear or deny access during a window change.
                    self.current = None
                    state = (active_generation, None)
                    if state != last_state:
                        last_state = state
                        self.events.put(('selection_state', state))
                    gate.observe(None, time.monotonic())
        finally:
            if initializer:
                del initializer

    def close(self):
        self.enabled.clear()
        self.stop.set()
        self.thread.join(timeout=0.5)
