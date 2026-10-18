export function retained(item, since) {
  return !since || Date.parse(item.occurredAt) >= Date.parse(since);
}
