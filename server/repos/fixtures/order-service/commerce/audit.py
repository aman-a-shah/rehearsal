from commerce.ledger import reconciliation


def audit_order(order):
    return {'reconciled': reconciliation(order)['balanced'],
            'discount_allocated': sum(row['discount'] for row in order['lines']),
            'line_count': len(order['lines'])}
