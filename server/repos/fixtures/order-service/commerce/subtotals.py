from commerce.validation import validate_lines


def line_subtotals(lines):
    return {line.id: line.subtotal for line in validate_lines(lines)}
