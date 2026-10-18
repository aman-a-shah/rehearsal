import unittest
from commerce.money import minor_units, display


class MoneyTests(unittest.TestCase):
    def test_decimal_input(self): self.assertEqual(minor_units('12.34'), 1234)
    def test_half_up(self): self.assertEqual(minor_units('1.005'), 101)
    def test_display(self): self.assertEqual(display(9), '0.09')
    def test_negative(self):
        with self.assertRaises(ValueError): minor_units('-1')
    def test_infinite(self):
        with self.assertRaises(ValueError): minor_units('Infinity')
