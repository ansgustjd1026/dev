import sys
from pathlib import Path
import unittest
from unittest.mock import Mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blink import Blinker, blink_count, BINARY_PROMPT
from app import App


class Scheduler:
    def __init__(self):
        self.pending = {}
        self.next_id = 0

    def after(self, delay, callback):
        self.next_id += 1
        self.pending[self.next_id] = callback
        return self.next_id

    def after_cancel(self, timer):
        self.pending.pop(timer, None)

    def drain(self):
        while self.pending:
            timer = min(self.pending)
            self.pending.pop(timer)()


class Keyboard:
    def __init__(self, initial=False):
        self.value = initial
        self.transitions = []

    def state(self):
        return self.value

    def set(self, desired):
        if desired != self.value:
            self.transitions.append(desired)
        self.value = desired


class BlinkTests(unittest.TestCase):
    def test_strict_result_mapping(self):
        for value, expected in [('TRUE', 1), (' true\n', 1), ('FALSE', 2), ('Unknown', 3),
                                ('TRUE because...', 3), ('not true', 3), ('', 3), (None, 3)]:
            self.assertEqual(blink_count(value), expected)

    def test_all_counts_restore_both_initial_states(self):
        for initial in (False, True):
            for count in range(1, 10):
                with self.subTest(initial=initial, count=count):
                    scheduler, keyboard, done = Scheduler(), Keyboard(initial), Mock()
                    blinker = Blinker(scheduler, keyboard)
                    blinker.start(count, done)
                    scheduler.drain()
                    self.assertEqual(keyboard.transitions, [not initial, initial] * count)
                    self.assertEqual(keyboard.value, initial)
                    self.assertFalse(blinker.active)
                    done.assert_called_once_with(None)

    def test_exit_mid_blink_restores_and_cancels(self):
        scheduler, keyboard = Scheduler(), Keyboard()
        blinker = Blinker(scheduler, keyboard)
        blinker.start(3, Mock())
        self.assertTrue(keyboard.value)
        blinker.close()
        self.assertFalse(keyboard.value)
        self.assertFalse(scheduler.pending)

    def test_external_state_change_aborts_without_overwrite(self):
        scheduler, keyboard, done = Scheduler(), Keyboard(), Mock()
        blinker = Blinker(scheduler, keyboard)
        blinker.start(2, done)
        keyboard.value = False
        scheduler.drain()
        self.assertEqual(keyboard.transitions, [True])
        self.assertFalse(keyboard.value)
        self.assertIsInstance(done.call_args.args[0], str)

    def test_injection_failure_releases_busy_state(self):
        instance = App.__new__(App)
        instance.root = Scheduler()
        keyboard = Keyboard()
        keyboard.set = Mock(side_effect=RuntimeError('blocked'))
        instance.blinker = Blinker(instance.root, keyboard)
        instance.selection = Mock()
        instance.hide_near = Mock()
        instance.publish = Mock()
        instance.finish_binary(1, 'True')
        self.assertFalse(instance.busy)
        instance.selection.suspended.clear.assert_called_once()
        self.assertIn('LED 알림 실패', instance.publish.call_args.args[0])

    def test_final_state_read_failure_releases_busy_state(self):
        instance = App.__new__(App)
        instance.root = Scheduler()
        keyboard = Keyboard()
        keyboard.state = Mock(side_effect=[False,False,True,False,RuntimeError('state read failed'),False])
        instance.blinker = Blinker(instance.root, keyboard)
        instance.selection = Mock()
        instance.hide_near = instance.display_selection_answer = Mock()
        instance.publish = Mock()
        instance.finish_binary(1, 'True')
        instance.root.drain()
        self.assertFalse(instance.busy)
        self.assertFalse(instance.blinker.active)
        self.assertFalse(instance.root.pending)
        instance.selection.suspended.clear.assert_called_once()
        self.assertIn('LED 알림 실패',instance.publish.call_args.args[0])

    def test_completion_waits_until_blinks_finish(self):
        instance = App.__new__(App)
        instance.root = Scheduler()
        instance.blinker = Blinker(instance.root, Keyboard())
        instance.selection = Mock()
        instance.hide_near = Mock()
        instance.publish = Mock()
        instance.finish_binary(2, 'False')
        self.assertTrue(instance.busy)
        instance.selection.suspended.clear.assert_not_called()
        instance.root.drain()
        self.assertFalse(instance.busy)
        instance.selection.suspended.clear.assert_called_once()


if __name__ == '__main__':
    unittest.main()
