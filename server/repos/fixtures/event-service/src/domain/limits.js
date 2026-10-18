export function pageLimit(value = 25) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Limit must be 1–100');
  return limit;
}
