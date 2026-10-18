export function encodeCursor(item, tenant, kind = '') {
  return Buffer.from(JSON.stringify({ v: 1, tenant, kind, after: { id: item.id, occurredAt: item.occurredAt } })).toString('base64url');
}

export function decodeCursor(token, tenant, kind = '') {
  if (!token) return null;
  let value;
  try { value = JSON.parse(Buffer.from(token, 'base64url').toString()); }
  catch { throw new TypeError('Malformed cursor'); }
  if (value?.v !== 1 || value.tenant !== tenant || value.kind !== kind) throw new TypeError('Cursor scope mismatch');
  if (typeof value.after?.id !== 'string' || !/^\d+$/.test(value.after.id) || !Number.isFinite(Date.parse(value.after.occurredAt))) throw new TypeError('Invalid cursor position');
  return value.after;
}
