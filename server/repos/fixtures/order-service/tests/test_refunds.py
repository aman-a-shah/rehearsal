import unittest
from commerce.models import Line
from commerce.refunds import refund_lines


class RefundTests(unittest.TestCase):
    def setUp(self): self.lines = [Line(k, 'tea', 1, 100) for k in 'abc']
    def test_refund_uses_original_allocation(self): self.assertEqual(refund_lines(self.lines, ['a'], 1), 99)
    def test_all_refunds_match_charge(self):
        self.assertEqual(sum(refund_lines(self.lines, [key], 1) for key in 'abc'), 299)
    def test_reordered_cart_keeps_refund(self): self.assertEqual(refund_lines(self.lines[::-1], ['a'], 1), 99)
    def test_empty_refund(self): self.assertEqual(refund_lines(self.lines, [], 1), 0)
    def test_unknown_line(self):
        with self.assertRaises(ValueError): refund_lines(self.lines, ['x'])
    def test_double_refund(self):
        with self.assertRaises(ValueError): refund_lines(self.lines, ['a', 'a'])
