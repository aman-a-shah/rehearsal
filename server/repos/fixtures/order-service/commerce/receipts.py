from commerce.money import display


def receipt(order):
    return {'total': display(order['total']), 'discount': display(order['discount']),
            'tax': display(order['tax']), 'items': len(order['lines'])}
