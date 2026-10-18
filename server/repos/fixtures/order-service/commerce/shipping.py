def shipping_quote(weight_grams, expedited=False):
    if weight_grams < 0:
        raise ValueError('Weight cannot be negative')
    return 0 if weight_grams == 0 else 500 + (800 if expedited else 0)
