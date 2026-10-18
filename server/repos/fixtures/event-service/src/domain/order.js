export function compareEvents(left, right) {
  const byTime = Date.parse(left.occurredAt) - Date.parse(right.occurredAt);
  return byTime || Number(left.id) - Number(right.id);
}
