import unittest
from commerce.discounts import allocate_discount


class AllocationTests(unittest.TestCase):
    def test_exact_shares(self): self.assertEqual(allocate_discount({'a': 100, 'b': 300}, 100), {'a': 25, 'b': 75})
    def test_residual_cent_is_conserved(self):
        self.assertEqual(allocate_discount({'a': 100, 'b': 100, 'c': 100}, 1), {'a': 1, 'b': 0, 'c': 0})
    def test_rounding_cannot_create_discount(self):
        self.assertEqual(allocate_discount({'a': 100, 'b': 100, 'c': 100}, 2), {'a': 1, 'b': 1, 'c': 0})
    def test_tie_break_does_not_follow_input_order(self):
        self.assertEqual(allocate_discount({'c': 100, 'b': 100, 'a': 100}, 1), {'a': 1, 'b': 0, 'c': 0})
    def test_largest_remainder(self):
        self.assertEqual(allocate_discount({'a': 100, 'b': 200, 'c': 300}, 5), {'a': 1, 'b': 2, 'c': 2})
    def test_zero_lines(self): self.assertEqual(allocate_discount({'a': 0, 'b': 100}, 1), {'a': 0, 'b': 1})
    def test_zero_order(self): self.assertEqual(allocate_discount({'a': 0}, 0), {'a': 0})
    def test_full_discount(self): self.assertEqual(allocate_discount({'a': 17, 'b': 23}, 40), {'a': 17, 'b': 23})
    def test_excess_rejected(self):
        with self.assertRaises(ValueError): allocate_discount({'a': 10}, 11)
    def test_negative_rejected(self):
        with self.assertRaises(ValueError): allocate_discount({'a': 10}, -1)
    def test_fractional_cents_rejected(self):
        with self.assertRaises(ValueError): allocate_discount({'a': 10}, 1.5)
