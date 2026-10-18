"""Small, real codebases with ordinary tests. Repairs are generated, never preloaded."""

from pathlib import Path


def fixture(name):
    root = Path(__file__).parent / "fixtures" / name
    return {path.relative_to(root).as_posix(): path.read_text()
            for path in sorted(root.rglob("*"))
            if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"}


EXAMPLES = {
    "python-orders": {
        "name": "Harbor / order-service", "runtime": "python", "featured": True,
        "description": "Trace lost discount cents through checkout, refunds, and the accounting ledger.",
        "challenge": "Exact allocation · multi-layer failures",
        "incident": "A one-cent coupon on three equal $1 lines is charged as $3.00 instead of $2.99. A two-cent coupon sometimes discounts three cents. Refunds for separate lines no longer add up to the expected charge, and the ledger fails reconciliation. Trace this across the order service and fix the root cause. Allocate integer discount cents proportionally to each line's subtotal using largest fractional remainders; ties use ascending line ID so reordering the cart cannot change refunds. Preserve tax-after-discount, zero-value lines, validation, and existing API behavior.",
        "files": fixture("order-service"),
    },
    "node-events": {
        "name": "Atlas / event-service", "runtime": "node", "featured": True,
        "description": "Repair cursor continuation and 64-bit ordering across feeds, exports, and credit replay.",
        "challenge": "Composite cursors · precision · tenant isolation",
        "incident": "After a batch ingest, several events share a timestamp. The next feed page repeats prior events, exports report that the cursor stopped advancing, and credit replay fails. Decimal-string IDs above 9007199254740991 sometimes come back in the wrong order too. The service orders by occurredAt ascending, then exact numeric ID ascending, and a cursor must be strictly exclusive on that composite position. Fix the root causes across the query path. Preserve tenant isolation, cursor scope validation, kind filters, retention, non-mutation of input, and existing limit validation.",
        "files": fixture("event-service"),
    },
    "python-pricing": {
        "name": "Harbor / pricing-service", "runtime": "python",
        "description": "A discount rounds too early and overcharges small orders.",
        "incident": "Customers are overcharged for small orders. discounted_total should round the final discounted subtotal once to the nearest cent using ROUND_HALF_UP. An order of three items at $0.05 each with a 10% discount should cost $0.14, but it costs $0.15. Preserve validation of negative quantities and invalid discounts.",
        "files": {
            "pricing.py": "from decimal import Decimal, ROUND_HALF_UP\n\n\ndef discounted_total(unit_price, quantity, discount):\n    price = Decimal(str(unit_price))\n    rate = Decimal(str(discount))\n    if quantity < 0 or not 0 <= rate <= 1:\n        raise ValueError('Invalid quantity or discount')\n    discounted_unit = (price * (1 - rate)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)\n    return discounted_unit * quantity\n",
            "tests/test_pricing.py": "import unittest\nfrom decimal import Decimal\nfrom pricing import discounted_total\n\n\nclass PricingTests(unittest.TestCase):\n    def test_small_order_rounds_once(self):\n        self.assertEqual(discounted_total('0.05', 3, '0.10'), Decimal('0.14'))\n\n    def test_regular_order(self):\n        self.assertEqual(discounted_total('20', 2, '0.25'), Decimal('30.00'))\n\n    def test_negative_quantity_rejected(self):\n        with self.assertRaises(ValueError):\n            discounted_total('20', -1, '0.25')\n\n    def test_invalid_discount_rejected(self):\n        with self.assertRaises(ValueError):\n            discounted_total('20', 2, '1.25')\n\n    def test_no_discount(self):\n        self.assertEqual(discounted_total('1.29', 3, '0'), Decimal('3.87'))\n",
            "checkout.py": "from pricing import discounted_total\n\ndef invoice_line(unit_price, quantity, discount):\n    return {'total': str(discounted_total(unit_price, quantity, discount)), 'quantity': quantity}\n",
            "tests/test_checkout.py": "import unittest\nfrom checkout import invoice_line\n\nclass CheckoutTests(unittest.TestCase):\n    def test_invoice_contract(self):\n        self.assertEqual(invoice_line('20', 2, '0.25'), {'total': '30.00', 'quantity': 2})\n",
            "CODEOWNERS": "pricing.py @payments\ncheckout.py @checkout\n",
            "README.md": "# Pricing service\nRun `python -m unittest discover -s tests -v`. Final discounted subtotals must use decimal arithmetic and round once with ROUND_HALF_UP.\n",
        },
    },
    "node-pagination": {
        "name": "Atlas / event-feed", "runtime": "node",
        "description": "An inclusive cursor repeats the last event on the next page.",
        "incident": "The event feed repeats the final event of the previous page. pageAfter(events, cursor, limit) should return only IDs strictly greater than the cursor, ordered by ascending ID, without mutating the input. A zero limit must return an empty page. Fix pagination while retaining the input validation.",
        "files": {
            "package.json": '{"name":"atlas-feed","private":true,"type":"module","scripts":{"test":"node --test"}}\n',
            "src/pagination.js": "export function pageAfter(events, cursor, limit) {\n  if (!Number.isInteger(limit) || limit < 0) throw new RangeError('Invalid limit');\n  return events.filter(event => event.id >= cursor).sort((a, b) => a.id - b.id).slice(0, limit);\n}\n",
            "src/feed.js": "import { pageAfter } from './pagination.js';\n\nexport function feedResponse(events, cursor, limit) {\n  const items = pageAfter(events, cursor, limit);\n  return { items, nextCursor: items.length ? items.at(-1).id : cursor };\n}\n",
            "test/pagination.test.js": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { pageAfter } from '../src/pagination.js';\n\ntest('cursor is exclusive', () => {\n  assert.deepEqual(pageAfter([{id: 1}, {id: 2}, {id: 3}], 2, 2), [{id: 3}]);\n});\ntest('returns ascending order without mutating input', () => {\n  const events = [{id: 3}, {id: 1}, {id: 2}];\n  assert.deepEqual(pageAfter(events, 0, 2), [{id: 1}, {id: 2}]);\n  assert.deepEqual(events, [{id: 3}, {id: 1}, {id: 2}]);\n});\ntest('zero limit', () => assert.deepEqual(pageAfter([{id: 1}], 0, 0), []));\ntest('invalid limit', () => assert.throws(() => pageAfter([], 0, -1), RangeError));\n",
            "test/feed.test.js": "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { feedResponse } from '../src/feed.js';\n\ntest('empty feed keeps the cursor', () => assert.deepEqual(feedResponse([], 10, 5), {items: [], nextCursor: 10}));\n",
            "CODEOWNERS": "src/pagination.js @platform\nsrc/feed.js @api\n",
        },
    },
    "python-timeout": {
        "name": "Relay / timeout-service", "runtime": "python",
        "description": "The tests pass, but zero is treated as a missing timeout. Add a regression, then fix it.",
        "incident": "timeout_config.py incorrectly treats integer zero as a missing timeout. Passing 0 should return 0 to disable the timeout; None and the empty string should still use the 30-second default. Preserve rejection of negative values and parsing of numeric strings. Existing tests miss integer zero.",
        "files": {
            "timeout_config.py": "def timeout_seconds(value=None):\n    seconds = int(value or 30)\n    if seconds < 0:\n        raise ValueError('Timeout cannot be negative')\n    return seconds\n",
            "tests/test_timeout.py": "import unittest\nfrom timeout_config import timeout_seconds\n\nclass TimeoutTests(unittest.TestCase):\n    def test_default(self):\n        self.assertEqual(timeout_seconds(), 30)\n    def test_string(self):\n        self.assertEqual(timeout_seconds('12'), 12)\n    def test_empty_string(self):\n        self.assertEqual(timeout_seconds(''), 30)\n    def test_negative(self):\n        with self.assertRaises(ValueError):\n            timeout_seconds(-1)\n",
            "CODEOWNERS": "timeout_config.py @reliability\n",
            "README.md": "# Timeout service\nRun `python -m unittest discover -s tests -v`. Zero disables the timeout; None and empty strings use the default. The existing tests miss zero.\n",
        },
    },
}
