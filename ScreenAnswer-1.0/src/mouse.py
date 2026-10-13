"""Count physical left clicks without blocking or synthesizing mouse input."""
import ctypes as C
from ctypes import wintypes as W
import os
import threading
import time
import math
import queue
from collections import deque


def click_number(value, low=3, high=20):
    text = str(value).strip()
    if not text.isdecimal() or not low <= int(text) <= high:
        raise ValueError(f'클릭 횟수는 {low}~{high} 사이의 정수로 입력하세요.')
    return int(text)


def click_interval(value):
    text = str(value).strip()
    if not text.isdecimal() or not 100 <= int(text) <= 2000:
        raise ValueError('클릭 사이 간격은 100~2,000ms 사이로 입력하세요.')
    return int(text)


class ClickGate:
    def __init__(self, count=3, interval_ms=500):
        self.target = click_number(count)
        self.interval = click_interval(interval_ms) / 1000
        self.reset()
        self.serial = 0
        self.last_trigger = float('-inf')
        self.suppress_until = 0

    def reset(self):
        self.pressed = None
        self.count = 0
        self.last = None

    def observe(self, kind, point, window, now):
        if kind == 'down':
            self.pressed = (point, window, now)
            return False
        if kind == 'move':
            if self.pressed and max(abs(point[i]-self.pressed[0][i]) for i in (0,1)) > 8:
                self.reset()
            return False
        if kind != 'up' or not self.pressed:
            return False
        start, source, down_time = self.pressed
        self.pressed = None
        if source != window or now-down_time > 1 or max(abs(point[i]-start[i]) for i in (0,1)) > 8:
            self.reset()
            return False
        if self.last is None or window != self.last[1] or now-self.last[2] > self.interval or max(abs(point[i]-self.last[0][i]) for i in (0,1)) > 8:
            self.count = 0
        self.count += 1
        self.last = (point, window, now)
        self.suppress_until = now + self.interval
        if self.count == self.target:
            self.serial += 1
            self.last_trigger = now
            self.reset()
            return True
        return False


class CircleGate:
    def __init__(self):
        self.points = deque(maxlen=400)
        self.window = None
        self.last_check = float('-inf')
        self.cooldown_until = 0

    def reset(self):
        self.points.clear()
        self.window = None

    def observe(self, point, window, now, buttons=False):
        if buttons or now < self.cooldown_until:
            self.reset()
            return False
        if window != self.window or (self.points and now-self.points[-1][2] > 1.2):
            self.reset()
            self.window = window
        if self.points and (now-self.points[-1][2] < .008 or math.dist(point,self.points[-1][:2]) < 2):
            return False
        self.points.append((point[0],point[1],now))
        while self.points and now-self.points[0][2] > 8:
            self.points.popleft()
        if now-self.last_check < .05 or len(self.points) < 12:
            return False
        self.last_check = now
        points = list(self.points)
        for length in list(range(12,len(points),8)) + [len(points)]:
            curve = points[-length:]
            xs,ys = [p[0] for p in curve], [p[1] for p in curve]
            width,height = max(xs)-min(xs), max(ys)-min(ys)
            if not (35 <= width <= 1000 and 35 <= height <= 1000 and .25 <= width/height <= 4.5):
                continue
            cx,cy = (max(xs)+min(xs))/2, (max(ys)+min(ys))/2
            normalized = [((x-cx)/(width/2), (y-cy)/(height/2)) for x,y,_ in curve]
            if sum(.25 <= math.hypot(x,y) <= 1.7 for x,y in normalized) < .75*length:
                continue
            angles = [math.atan2(y,x) for x,y in normalized]
            turns = [(b-a+math.pi)%(2*math.pi)-math.pi for a,b in zip(angles,angles[1:])]
            total,travel = sum(turns), sum(abs(v) for v in turns)
            radial = travel > 0 and max(abs(v) for v in turns) <= 1.7 and abs(total) >= 3.7*math.pi and abs(total)/travel >= .7
            # Tangent rotation also recognizes loops whose center drifts. Smooth
            # neighboring positions first so tiny hand jitter is not a turn.
            smooth = [(sum(p[0] for p in curve[i:i+3])/3, sum(p[1] for p in curve[i:i+3])/3) for i in range(length-2)]
            headings = [math.atan2(b[1]-a[1],b[0]-a[0]) for a,b in zip(smooth,smooth[1:]) if math.dist(a,b) >= 1]
            bends = [(b-a+math.pi)%(2*math.pi)-math.pi for a,b in zip(headings,headings[1:])]
            bend_total,bend_travel = sum(bends),sum(abs(v) for v in bends)
            tangent = bend_travel > 0 and max(abs(v) for v in bends) <= 1.7 and abs(bend_total) >= 3.7*math.pi and abs(bend_total)/bend_travel >= .7
            if radial or tangent:
                self.reset()
                self.cooldown_until = now + 2
                return True
        return False


class MouseWatcher:
    def __init__(self, events):
        self.events = events
        self.lock = threading.Lock()
        self.gate = ClickGate()
        self.enabled = False
        self.click_enabled = False
        self.circle_enabled = False
        self.circle = CircleGate()
        self.generation = 0
        self.stop = threading.Event()
        self.ready = threading.Event()
        self.installed = False
        self.thread_id = 0
        self.circle_moves = queue.Queue(maxsize=64)
        self.last_queued_move = float('-inf')
        self.circle_thread = threading.Thread(target=self.run_circles, daemon=True)
        self.circle_thread.start()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def configure(self, enabled, count, interval_ms, circle_enabled=False):
        gate = ClickGate(count, interval_ms)
        with self.lock:
            self.generation += 1
            self.enabled = bool(enabled or circle_enabled)
            self.click_enabled = bool(enabled)
            self.circle_enabled = bool(circle_enabled)
            self.gate = gate
            self.circle = CircleGate()

    def selection_pause(self):
        with self.lock:
            now = time.monotonic()
            return (max(0, self.gate.suppress_until-now) if self.enabled else 0,
                    self.gate.serial,
                    self.enabled and now-self.gate.last_trigger < self.gate.interval + .2)

    def queue_circle(self, point, window, now, buttons):
        if not self.circle_enabled:
            return
        # Sample before queueing: high polling-rate mice otherwise fill the queue
        # with points the recognizer will immediately discard.
        if not buttons and now - self.last_queued_move < .008:
            return
        self.last_queued_move = now
        item = (self.generation, point, window, now, buttons)
        try:
            self.circle_moves.put_nowait(item)
        except queue.Full:
            try:
                self.circle_moves.get_nowait()
                self.circle_moves.put_nowait(item)
            except (queue.Empty, queue.Full):
                pass

    def run_circles(self):
        while not self.stop.is_set():
            try:
                generation, point, window, now, buttons = self.circle_moves.get(timeout=.2)
            except queue.Empty:
                if self.circle.points and time.monotonic() - self.circle.points[-1][2] > 1.2:
                    self.circle.reset()
                continue
            with self.lock:
                if generation != self.generation or not self.circle_enabled:
                    continue
                circle = self.circle
            # Shape analysis must not delay the system's mouse hook callback.
            triggered = circle.observe(point, window, now, buttons)
            if triggered:
                with self.lock:
                    if generation != self.generation or circle is not self.circle or not self.circle_enabled:
                        continue
                    self.gate.serial += 1
                    self.gate.last_trigger = time.monotonic()
                    self.gate.suppress_until = self.gate.last_trigger + self.gate.interval
                    self.events.put(('mouse_scan', (generation, window, 'circle', point)))

    def run(self):
        user = C.WinDLL('user32', use_last_error=True)
        kernel = C.WinDLL('kernel32', use_last_error=True)
        result_type = C.c_ssize_t
        callback_type = C.WINFUNCTYPE(result_type, C.c_int, W.WPARAM, W.LPARAM)
        class MouseData(C.Structure):
            _fields_ = [('pt', W.POINT), ('mouseData', W.DWORD), ('flags', W.DWORD),
                        ('time', W.DWORD), ('extra', C.c_size_t)]
        user.SetWindowsHookExW.argtypes = [C.c_int, callback_type, W.HANDLE, W.DWORD]
        user.SetWindowsHookExW.restype = W.HANDLE
        user.CallNextHookEx.argtypes = [W.HANDLE, C.c_int, W.WPARAM, W.LPARAM]
        user.CallNextHookEx.restype = result_type
        user.UnhookWindowsHookEx.argtypes = [W.HANDLE]
        user.WindowFromPoint.argtypes = [W.POINT]
        user.WindowFromPoint.restype = W.HWND
        user.GetAncestor.argtypes = [W.HWND, W.UINT]
        user.GetAncestor.restype = W.HWND
        user.GetWindowThreadProcessId.argtypes = [W.HWND, C.POINTER(W.DWORD)]
        user.GetMessageW.argtypes = [C.POINTER(W.MSG), W.HWND, W.UINT, W.UINT]
        user.PeekMessageW.argtypes = [C.POINTER(W.MSG), W.HWND, W.UINT, W.UINT, W.UINT]
        kernel.GetModuleHandleW.argtypes = [W.LPCWSTR]
        kernel.GetModuleHandleW.restype = W.HANDLE
        self.thread_id = kernel.GetCurrentThreadId()
        hook = None
        def callback(code, message, pointer):
            try:
                if code >= 0 and message in (0x200, 0x201, 0x202) and self.enabled:
                    data = C.cast(pointer, C.POINTER(MouseData)).contents
                    if not data.flags & 1:
                        kind = {0x200:'move', 0x201:'down', 0x202:'up'}[message]
                        if kind == 'move' and not self.gate.pressed and not self.circle_enabled:
                            return user.CallNextHookEx(hook, code, message, pointer)
                        hwnd = user.GetAncestor(user.WindowFromPoint(data.pt), 2)
                        pid = W.DWORD()
                        user.GetWindowThreadProcessId(hwnd, C.byref(pid))
                        with self.lock:
                            if not hwnd or pid.value == os.getpid():
                                self.gate.reset()
                                self.queue_circle((data.pt.x, data.pt.y), hwnd, time.monotonic(), True)
                            else:
                                now = time.monotonic()
                                point = (data.pt.x, data.pt.y)
                                if kind == 'down':
                                    self.queue_circle(point, hwnd, now, True)
                                if self.click_enabled and self.gate.observe(kind, point, hwnd, now):
                                    self.events.put(('mouse_scan', (self.generation, hwnd, 'click', point)))
                                if self.circle_enabled and kind == 'move':
                                    buttons = any(user.GetAsyncKeyState(key) & 0x8000 for key in (1,2,4))
                                    self.queue_circle(point, hwnd, now, buttons)
            except Exception:
                pass
            return user.CallNextHookEx(hook, code, message, pointer)
        self.callback = callback_type(callback)
        try:
            hook = user.SetWindowsHookExW(14, self.callback, kernel.GetModuleHandleW(None), 0)
            self.installed = bool(hook)
            message = W.MSG()
            user.PeekMessageW(C.byref(message), None, 0, 0, 0)
            self.ready.set()
            if not hook:
                self.events.put(('mouse_error', None))
                return
            while not self.stop.is_set() and user.GetMessageW(C.byref(message), None, 0, 0) > 0:
                user.TranslateMessage(C.byref(message))
                user.DispatchMessageW(C.byref(message))
        finally:
            if hook:
                user.UnhookWindowsHookEx(hook)
            self.installed = False
            self.ready.set()

    def close(self):
        self.enabled = False
        self.stop.set()
        self.ready.wait(2)
        if self.thread_id:
            C.windll.user32.PostThreadMessageW(self.thread_id, 0x12, 0, 0)
        self.thread.join(2)
        self.circle_thread.join(2)
        self.circle.reset()
        while not self.circle_moves.empty():
            try:
                self.circle_moves.get_nowait()
            except queue.Empty:
                break
