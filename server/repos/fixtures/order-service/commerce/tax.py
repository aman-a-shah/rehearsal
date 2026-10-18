from decimal import Decimal, ROUND_HALF_UP


def tax_cents(net, rate, taxable=True):
    rate = Decimal(str(rate))
    if net < 0 or rate < 0 or rate > 1:
        raise ValueError('Invalid taxable amount or rate')
    return int((Decimal(net) * rate).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) if taxable else 0
