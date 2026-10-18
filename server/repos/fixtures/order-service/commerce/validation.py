from commerce.models import Line


def validate_lines(lines):
    if not lines:
        raise ValueError('An order needs at least one line')
    ids = set()
    for line in lines:
        if not isinstance(line, Line) or not line.id or line.id in ids:
            raise ValueError('Line identifiers must be unique')
        if type(line.quantity) is not int or line.quantity <= 0 or line.unit_cents < 0:
            raise ValueError('Invalid quantity or price')
        ids.add(line.id)
    return lines
