import unittest
from commerce.catalog import make_line
from commerce.validation import validate_lines


class CatalogTests(unittest.TestCase):
    def test_price_and_quantity(self): self.assertEqual(make_line('a', 'coffee', 3).subtotal, 750)
    def test_book_is_exempt(self): self.assertFalse(make_line('a', 'book', 1).taxable)
    def test_duplicate_id(self):
        with self.assertRaises(ValueError): validate_lines([make_line('a', 'tea', 1)] * 2)
    def test_zero_quantity(self):
        with self.assertRaises(ValueError): validate_lines([make_line('a', 'tea', 0)])
    def test_empty_order(self):
        with self.assertRaises(ValueError): validate_lines([])
