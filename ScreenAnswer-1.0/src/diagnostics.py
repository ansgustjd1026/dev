"""Bounded error metadata only; never log messages, payloads or traceback locals."""
from collections import deque
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import threading

LOG_FILE = Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'ScreenAnswer' / 'diagnostics.log'
MAX_LOG_BYTES = 128 * 1024
BACKUP_COUNT = 2
STAGES = {'settings', 'key', 'capture', 'api', 'request', 'event', 'bubble', 'tray_bubble', 'led', 'hotkey', 'history'}
SOURCE_FILES = {'app.py', 'selection.py', 'mouse.py', 'blink.py', 'tasks.py',
                'references.py', 'led_response.py', 'mathtext.py', 'monitors.py', 'request_body.py',
                'api_client.py', 'settings_store.py', 'credentials.py', 'hotkeys.py',
                'browser_selection.py', 'browser_drag.py', 'streaming.py', 'tray_hover.py'}
_lock = threading.Lock()
_handler = None
_path = None


def record_error(stage, error):
    global _handler, _path
    try:
        name = type(error).__name__
        packet = {'stage': stage if stage in STAGES else 'unknown',
                  'type': name if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', name) else 'Exception'}
        for attribute in ('code', 'winerror', 'errno'):
            value = getattr(error, attribute, None)
            if type(value) is int and 0 <= value <= 65535:
                packet[attribute] = value
        frames = deque(maxlen=12)
        trace = error.__traceback__
        while trace:
            filename = Path(trace.tb_frame.f_code.co_filename).name
            if filename in SOURCE_FILES:
                frames.append(f'{filename}:{trace.tb_lineno}')
            trace = trace.tb_next
        packet['frames'] = list(frames)
        with _lock:
            if _handler is None or _path != LOG_FILE:
                if _handler is not None:
                    _handler.close()
                    _handler = None
                LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
                _handler = RotatingFileHandler(LOG_FILE, maxBytes=MAX_LOG_BYTES,
                                              backupCount=BACKUP_COUNT, encoding='utf-8')
                _handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
                _path = LOG_FILE
            record = logging.LogRecord('ScreenAnswer', logging.ERROR, '', 0,
                                       json.dumps(packet), (), None)
            _handler.emit(record)
    except Exception:
        # Logging failure must never break capture, requests or event recovery.
        pass
