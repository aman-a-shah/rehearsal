import unittest
from commerce.checkout import checkout
from commerce.models import Line
from commerce.notifications import confirmation
from commerce.reporting import daily_report
from commerce.shipping import shipping_quote


class OperationsTests(unittest.TestCase):
    def test_shipping(self): self.assertEqual(shipping_quote(400), 500)
    def test_expedited(self): self.assertEqual(shipping_quote(400, True), 1300)
    def test_digital_shipping(self): self.assertEqual(shipping_quote(0), 0)
    def test_notification(self): self.assertEqual(confirmation(checkout([Line('a', 'tea', 1, 100)]), 'buyer@example.org')['body'], 'Paid 1.00')
    def test_report(self): self.assertEqual(daily_report([checkout([Line('a', 'tea', 1, 100)])]), {'orders': 1, 'revenue': 100, 'unbalanced': 0})
