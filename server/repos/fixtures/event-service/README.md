# Atlas event service

A runnable Node.js service with tenant-scoped storage, authenticated feed handlers,
opaque cursors, query planning, exports, credit replay, retention, and metrics.
No package installation is needed. Run `node --test`.

Incident: a batch of events shares a timestamp. Continuation repeats prior items,
exports stop advancing, and credit replay fails. IDs above JavaScript's safe
integer range also come back out of order. Timestamps sort ascending, then decimal
ID strings sort by exact integer value; a cursor is strictly exclusive on both.
The fix must preserve tenant isolation, kind filters, input order, and validation.
The intentionally failing suite exercises the bug through several service layers.
