export function event(input) {
  if (!/^\d+$/.test(input.id) || typeof input.id !== 'string') throw new TypeError('ID must be a decimal string');
  if (!input.tenant || !input.kind || !Number.isFinite(Date.parse(input.occurredAt))) throw new TypeError('Invalid event');
  return Object.freeze({ ...input, occurredAt: new Date(input.occurredAt).toISOString() });
}
