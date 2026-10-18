from commerce.money import minor_units


def coupon_value(code, subtotal):
    offers = {'WELCOME': minor_units('1.00'), 'PENNY': 1}
    if not code:
        return 0
    if code not in offers:
        raise ValueError('Unknown coupon')
    return min(offers[code], subtotal)
