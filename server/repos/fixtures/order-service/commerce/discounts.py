from decimal import Decimal, ROUND_HALF_UP


def allocate_discount(subtotals, discount_cents):
    """Apportion a fixed coupon to line IDs, conserving every cent.

    Shares are proportional to subtotal. Largest fractional remainders get
    spare cents; ties are resolved by ascending line ID. Reordering an order
    must not change a line's allocation. Zero-value lines receive no discount.
    """
    if type(discount_cents) is not int or discount_cents < 0:
        raise ValueError('Discount must be non-negative integer cents')
    if any(type(amount) is not int or amount < 0 for amount in subtotals.values()):
        raise ValueError('Subtotals must be non-negative integer cents')
    total = sum(subtotals.values())
    if discount_cents > total:
        raise ValueError('Discount exceeds the order subtotal')
    if total == 0:
        return {key: 0 for key in subtotals}
    return {
        key: int((Decimal(amount) * discount_cents / total).quantize(
            Decimal('1'), rounding=ROUND_HALF_UP))
        for key, amount in subtotals.items()
    }
