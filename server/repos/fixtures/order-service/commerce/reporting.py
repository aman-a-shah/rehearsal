from commerce.ledger import reconciliation


def daily_report(orders):
    return {'orders': len(orders), 'revenue': sum(order['total'] for order in orders),
            'unbalanced': sum(not reconciliation(order)['balanced'] for order in orders)}
