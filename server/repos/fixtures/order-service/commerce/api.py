from commerce.orders import place_order


def submit(payload):
    try:
        result = place_order(payload['items'], payload.get('coupon', ''), payload.get('tax_rate', '0'))
    except (KeyError, ValueError, TypeError) as error:
        return {'status': 422, 'error': str(error)}
    return {'status': 201, 'data': result}
