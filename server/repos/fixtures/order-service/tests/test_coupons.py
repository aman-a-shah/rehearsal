import unittest
from commerce.coupons import coupon_value


class CouponTests(unittest.TestCase):
    def test_welcome(self): self.assertEqual(coupon_value('WELCOME', 300), 100)
    def test_cap(self): self.assertEqual(coupon_value('WELCOME', 40), 40)
    def test_none(self): self.assertEqual(coupon_value('', 300), 0)
    def test_unknown(self):
        with self.assertRaises(ValueError): coupon_value('UNKNOWN', 300)
