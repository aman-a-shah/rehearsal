from decimal import Decimal, ROUND_HALF_UP


def minor_units(value):
    amount = Decimal(str(value))
    if not amount.is_finite() or amount < 0:
        raise ValueError('Money must be finite and non-negative')
    return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def display(cents):
    return format(Decimal(cents) / 100, '.2f')
