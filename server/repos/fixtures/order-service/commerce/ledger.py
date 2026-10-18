from commerce.money import display


def entries(order):
    return [{'account': 'cash', 'cents': order['total']},
            {'account': 'sales', 'cents': -(order['subtotal'] - order['discount'])},
            {'account': 'tax', 'cents': -order['tax']}]


def reconciliation(order):
    balance = sum(row['cents'] for row in entries(order))
    return {'balanced': balance == 0, 'difference': display(balance)}
