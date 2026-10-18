# Harbor order service

A runnable, dependency-free Python service with order submission, catalog validation,
coupons, line-level tax, receipts, refunds, accounting, shipping, and notifications.

Run `python -m unittest discover -s tests -v`.

Incident: a one-cent coupon on three equal $1 lines is charged as $3.00 instead of
$2.99. Two-cent coupons can over-discount; individual refunds and the cash ledger
then disagree. The failures appear across API, checkout, and refunds.

The allocation contract is exact integer cents, proportional to line subtotal,
largest fractional remainders first, ties by ascending line ID. Reordering a cart
must not change refunds. Existing validation, tax, and zero-value behavior must hold.
These are intentionally failing tests for a repair exercise, not production code.
