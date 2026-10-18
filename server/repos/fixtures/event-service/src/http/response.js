export function feedResponse(page) {
  return { status: 200, body: { events: page.items, nextCursor: page.nextCursor, hasMore: page.hasMore } };
}
