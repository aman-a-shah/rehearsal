from commerce.receipts import receipt


def confirmation(order, recipient):
    if '@' not in recipient:
        raise ValueError('Invalid recipient')
    summary = receipt(order)
    return {'to': recipient, 'subject': 'Order confirmed', 'body': 'Paid ' + summary['total']}
