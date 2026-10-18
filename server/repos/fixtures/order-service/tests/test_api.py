import unittest
from commerce.api import submit


class ApiTests(unittest.TestCase):
    def test_coupon_reconciles_through_api(self):
        result = submit({'items': [{'id': k, 'sku': 'tea', 'quantity': 1} for k in 'abc'], 'coupon': 'PENNY'})
        self.assertEqual(result['status'], 201)
        self.assertEqual(result['data']['receipt']['total'], '2.99')
        self.assertTrue(result['data']['audit']['reconciled'])
    def test_normal_order(self): self.assertEqual(submit({'items': [{'id': 'a', 'sku': 'coffee', 'quantity': 2}]})['data']['receipt']['total'], '5.00')
    def test_unknown_product(self): self.assertEqual(submit({'items': [{'id': 'a', 'sku': 'missing', 'quantity': 1}]})['status'], 422)
    def test_invalid_payload(self): self.assertEqual(submit({})['status'], 422)
