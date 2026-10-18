"""Resource ownership and bounded input regression tests; no real API calls."""
import sys
import queue
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import App, DEFAULTS
from mouse import MouseWatcher


class MemoryTests(unittest.TestCase):
    def test_high_rate_mouse_input_is_sampled_and_bounded(self):
        watcher = MouseWatcher.__new__(MouseWatcher)
        watcher.circle_moves = queue.Queue(maxsize=64)
        watcher.circle_enabled = True
        watcher.last_queued_move = float('-inf')
        watcher.generation = 1
        for i in range(10000):
            watcher.queue_circle((i, 0), 7, i / 10000, False)
        self.assertEqual(watcher.circle_moves.qsize(), 64)
        times = []
        while not watcher.circle_moves.empty():
            times.append(watcher.circle_moves.get_nowait()[3])
        self.assertTrue(all(b-a >= .008 for a, b in zip(times, times[1:])))
        watcher.circle_enabled = False
        watcher.queue_circle((0, 0), 7, 2, True)
        self.assertTrue(watcher.circle_moves.empty())

    def test_capture_releases_image_on_success_and_encoding_failure(self):
        instance = App.__new__(App)
        instance.settings = DEFAULTS.copy()
        instance.submit = Mock()
        instance.selection = Mock()
        instance.publish = Mock()
        for failure in (False, True):
            image = Image.new('RGB', (40, 40))
            with patch('app.capture_bounds', return_value=(0,0,1920,1080)), patch('app.ImageGrab.grab', return_value=image):
                if failure:
                    with patch.object(image, 'save', side_effect=OSError('encoding failed')):
                        instance.capture('fake-key')
                else:
                    instance.capture('fake-key')
            with self.assertRaises(ValueError):
                image.getpixel((0, 0))
        instance.submit.assert_called_once()
        self.assertTrue(instance.submit.call_args.kwargs['jpeg'].startswith(b'\xff\xd8'))
        instance.publish.assert_called_once()


if __name__ == '__main__':
    unittest.main()
