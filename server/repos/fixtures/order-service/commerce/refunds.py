from commerce.checkout import checkout


def refund_lines(lines, returned_ids, discount=0, tax_rate='0'):
    order = checkout(lines, discount, tax_rate)
    selected = set(returned_ids)
    if len(selected) != len(returned_ids):
        raise ValueError('Cannot refund a line twice')
    if not selected <= {row['id'] for row in order['lines']}:
        raise ValueError('Unknown refund line')
    return sum(row['net'] + row['tax'] for row in order['lines'] if row['id'] in selected)
