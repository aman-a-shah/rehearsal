from commerce.subtotals import line_subtotals
from commerce.discounts import allocate_discount
from commerce.tax import tax_cents


def calculate(lines, discount, tax_rate):
    subtotals = line_subtotals(lines)
    allocations = allocate_discount(subtotals, discount)
    result = []
    for line in lines:
        net = subtotals[line.id] - allocations[line.id]
        result.append({'id': line.id, 'quantity': line.quantity,
                       'subtotal': subtotals[line.id], 'discount': allocations[line.id],
                       'net': net, 'tax': tax_cents(net, tax_rate, line.taxable)})
    return result
