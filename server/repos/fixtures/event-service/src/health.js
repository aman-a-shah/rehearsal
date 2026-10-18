export function health(store) {
  return { ready: true, storedEvents: store.size };
}
