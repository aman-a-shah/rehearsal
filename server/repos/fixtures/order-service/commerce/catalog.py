from commerce.models import Line
from commerce.money import minor_units


CATALOG = {
    'tea': {'price': '1.00', 'taxable': True},
    'coffee': {'price': '2.50', 'taxable': True},
    'book': {'price': '12.00', 'taxable': False},
}


def make_line(line_id, sku, quantity):
    item = CATALOG[sku]
    return Line(line_id, sku, quantity, minor_units(item['price']), item['taxable'])
