from commerce.catalog import make_line
from commerce.coupons import coupon_value
from commerce.checkout import checkout
from commerce.audit import audit_order
from commerce.receipts import receipt


def place_order(items, coupon='', tax_rate='0'):
    lines = [make_line(item['id'], item['sku'], item['quantity']) for item in items]
    discount = coupon_value(coupon, sum(line.subtotal for line in lines))
    order = checkout(lines, discount, tax_rate)
    return {'order': order, 'receipt': receipt(order), 'audit': audit_order(order)}
