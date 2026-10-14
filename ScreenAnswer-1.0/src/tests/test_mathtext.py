import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mathtext import readable_math
from app import tooltip


class MathTextTests(unittest.TestCase):
    def test_reported_fraction_in_both_displays(self):
        source = r'② \( \frac{1}{4} \)'
        self.assertEqual(tooltip(source), '② 1/4')
        self.assertEqual(readable_math(source), '② 1/4')

    def test_nested_fraction_preserves_order(self):
        self.assertEqual(readable_math(r'\frac{a+b}{\frac{c}{d}}'), '(a+b)/(c/d)')

    def test_roots_and_powers(self):
        self.assertEqual(readable_math(r'\(x^{2}+\sqrt{a+b}+\sqrt[3]{8}\)'), 'x²+√(a+b)+∛8')
        self.assertEqual(readable_math(r'\(a_{12}+x^{n+1}\)'), 'a₁₂+xⁿ⁺¹')
        self.assertEqual(readable_math(r'$a_{12}$'), 'a₁₂')

    def test_symbols_and_text(self):
        self.assertEqual(readable_math(r'$\alpha \times \pi \leq \infty$'), 'α × π ≤ ∞')
        self.assertEqual(readable_math(r'\[\text{정답}: \left(\frac{1}{2}\right)\]'), '정답: (1/2)')

    def test_unknown_and_malformed_commands_preserved(self):
        for value in (r'\unknown{x}', r'\frac{1}', r'\frac{1}{', r'\sqrt{'):
            self.assertEqual(readable_math(value), value)

    def test_plain_text_unchanged(self):
        for value in ('정답: 42', '가격 $5', 'OPENAI_API_KEY', 'C:\\Users\\aa010', '집합 {1, 2}', '2 + 3 = 5'):
            self.assertEqual(readable_math(value), value)

    def test_tooltip_limits_after_conversion(self):
        result = tooltip(r'\(\frac{1}{4}\)' * 150)
        self.assertLessEqual(len(result.encode('utf-16-le')), 252)
        self.assertNotIn('\\frac', result)


if __name__ == '__main__':
    unittest.main()
