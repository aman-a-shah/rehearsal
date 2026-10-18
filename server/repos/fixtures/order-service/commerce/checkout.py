from commerce.totals import calculate


def checkout(lines, discount=0, tax_rate='0'):
    rows = calculate(lines, discount, tax_rate)
    return {'lines': rows, 'subtotal': sum(row['subtotal'] for row in rows),
            'discount': discount, 'tax': sum(row['tax'] for row in rows),
            'total': sum(row['net'] + row['tax'] for row in rows)}
