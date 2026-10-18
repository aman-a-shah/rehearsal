import unittest
from commerce.models import Line
from commerce.checkout import checkout
from commerce.ledger import reconciliation
from commerce.tax import tax_cents


class CheckoutTests(unittest.TestCase):
    def test_three_line_coupon_total(self):
        order = checkout([Line(k, 'tea', 1, 100) for k in 'abc'], 1)
        self.assertEqual(order['total'], 299)
        self.assertTrue(reconciliation(order)['balanced'])
    def test_quantity_weights(self):
        order = checkout([Line('a', 'tea', 2, 100), Line('b', 'tea', 1, 100)], 1)
        self.assertEqual([row['discount'] for row in order['lines']], [1, 0])
    def test_tax_after_discount(self):
        order = checkout([Line('a', 'coffee', 2, 250)], 100, '0.10')
        self.assertEqual((order['total'], order['tax']), (440, 40))
    def test_tax_exempt(self): self.assertEqual(checkout([Line('b', 'book', 1, 1200, False)], 0, '0.13')['tax'], 0)
    def test_invalid_tax(self):
        with self.assertRaises(ValueError): tax_cents(100, '-0.1')
    def test_no_coupon(self): self.assertEqual(checkout([Line('a', 'tea', 3, 100)])['total'], 300)
